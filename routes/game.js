import express from 'express';
import { getUser, verifyToken } from '../services/accountAuth.js';
import { getClass, getUserClasses, updateUserClassRecord } from '../services/classes.js';

const router = express.Router();

/* GET home page. */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    // 1. 根據 Token (req.user.id) 撈取完整玩家資料
    const userData = await getUser({ id: req.user.id });

    if (!userData) {
      return res.redirect('/holylegend/login'); // 找不到人就踢回登入
    }

    // 2. 資料整形 (Data Flattening) - 這一步很重要！
    // 因為資料庫結構通常是 user.UserClasses[0].level
    // 但你的 EJS 模板是寫 user.level
    // 所以我們要在這裡把資料「鋪平」
    const currentClass = userData.UserClasses.find(
      uc => uc.jobId === userData.jobId
    );
    
    // 簡單計算一下屬性 (或是你在 getUser 裡算好也可以)
    const level = currentClass.level || 1;
    const hp = 100 + ((level - 1) * 5);
    const mp = 30 + ((level - 1) * 3);

    const renderData = {
        id: userData.id,
        nickname: userData.nickName, // 或是 userData.nickName，看資料庫欄位
        role: userData.class.name, // 假設 User 表有 role 欄位
        level: level,
        exp: currentClass.currentEXP || 0,
        needEXP: 50 + (level - 1) * 20,
        hp: hp,      // 目前先預設滿血
        maxHp: hp,
        mp: mp,
        maxMp: mp,
        currentFloor: 1, // 假設 User 表有紀錄樓層
        gold: 0
    };

    // 3. 傳輸資料進去渲染 (Render)
    // 第一個參數 'game_scene' 是你的 ejs 檔名 (不含 .ejs)
    // 第二個參數是用來傳資料的物件
    res.render('game', { 
        title: 'Holy Legend',
        user: renderData // 這裡傳進去的 key 叫 'user'，EJS 裡就用 user.xxx
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/status', verifyToken, async (req, res, next) => {
  try {
    // 1. 根據 Token (req.user.id) 撈取完整玩家資料
    const userData = await getUser({ id: req.user.id });

    if (!userData) {
      return res.redirect('/holylegend/'); // 找不到人就踢回登入
    }

    // 2. 資料整形 (Data Flattening) - 這一步很重要！
    // 因為資料庫結構通常是 user.UserClasses[0].level
    // 但你的 EJS 模板是寫 user.level
    // 所以我們要在這裡把資料「鋪平」
    const currentClass = userData.UserClasses.find(
      uc => uc.jobId === userData.jobId
    );
    
    // 簡單計算一下屬性 (或是你在 getUser 裡算好也可以)
    const level = currentClass.level || 1;
    const hp = 100 + ((level - 1) * 5);
    const mp = 30 + ((level - 1) * 3);

    const renderData = {
        id: userData.id,
        nickname: userData.nickName, // 或是 userData.nickName，看資料庫欄位
        role: userData.class.name, // 假設 User 表有 role 欄位
        level: level,
        exp: currentClass.currentEXP || 0,
        needEXP: 50 + (level - 1) * 20,
        hp: hp,      // 目前先預設滿血
        maxHp: hp,
        mp: mp,
        maxMp: mp,
        currentFloor: 1, // 假設 User 表有紀錄樓層
        gold: 0
    };

    // 3. 傳輸資料進去渲染 (Render)
    // 第一個參數 'game_scene' 是你的 ejs 檔名 (不含 .ejs)
    // 第二個參數是用來傳資料的物件
    res.json({
        success: true,
        data: renderData
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/classes', verifyToken, async (req, res, next) => {
  try {
    const userData = await getUser({id: req.user.id})

    if (!userData) {
      return res.redirect('/holylegend/'); // 找不到人就踢回登入
    }

    // 1. 根據 Token (req.user.id) 撈取完整玩家資料
    const ClassData = await getClass({})

    
    res.json({
        success: true,
        userData: userData,
        classData: ClassData
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/save_status', verifyToken, async(req, res, next) => {
  try {
    const userId = req.user.id;
    // 1. 抓取完整玩家資料
    const userData = await getUser({ id: req.user.id });

    if (!userData) {
      return res.redirect('/holylegend/'); 
    }

    // 2. 找到正確的職業紀錄 (UserClass)
    // 注意：UserClasses 是一個陣列
    const userClassRecord = userData.UserClasses.find(c => c.jobId === userData.jobId) || userData.UserClasses[0];

    if (!userClassRecord) {
        return res.status(400).json({ success: false, msg: "找不到職業紀錄" });
    }

    let database_EXP = userClassRecord.currentEXP;
    let database_level = userClassRecord.level;

    // 前端傳來的經驗值 (確保是數字)
    let ingame_EXP = parseInt(req.body.exp) || 0;

    let new_EXP = database_EXP + ingame_EXP;
    
    // 3. 計算升級邏輯 (While 迴圈)
    // 初始升級門檻
    let baseEXP = ((database_level - 1) * 20) + 50;

    // 只要經驗值大於門檻，就升級
    while (new_EXP >= baseEXP) {
        new_EXP -= baseEXP;      // 【修正】扣除門檻 (原本寫 new_EXP - baseEXP 無效)
        database_level += 1;     // 等級 +1
        
        // 【修正】升級後，下一級的門檻會變高，必須重新計算 baseEXP
        baseEXP = ((database_level - 1) * 20) + 50;
    }

    // 準備要更新的資料
    const updateData = { 
        currentEXP: new_EXP, 
        level: database_level 
    };

    // 4. 更新資料庫
    // 使用你定義的 helper (雖然直接 userClassRecord.save() 更快，但照你的結構寫)
    await updateUserClassRecord(userData, updateData);

    return res.json({ success: true, data: updateData });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

export default router;
