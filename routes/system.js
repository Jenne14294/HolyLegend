import express from 'express';
import { getRewards } from '../services/system.js';
import { getUser, verifyToken } from '../services/accountAuth.js';
import { getClass } from '../services/classes.js';

const router = express.Router();

router.get('/rewards', async (req, res, next) => {
  try {
    const rewards = await getRewards();

    res.json({"success":true, data: rewards});
  }

  catch (err) {
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

    const classData = await getClass({ id: userData.jobId})

    // 2. 資料整形 (Data Flattening) - 這一步很重要！
    // 因為資料庫結構通常是 user.UserClasses[0].level
    // 但你的 EJS 模板是寫 user.level
    // 所以我們要在這裡把資料「鋪平」
    const currentClass = userData.UserClasses.find(
      uc => uc.jobId === userData.jobId
    );

    console.log()
    
    // 簡單計算一下屬性 (或是你在 getUser 裡算好也可以)
    const level = currentClass.level || 1;
    const hp = Math.round(classData[0].dataValues.HP + ((level - 1) * (classData[0].dataValues.STR * 0.3 + classData[0].dataValues.CON * 0.7)))
    const mp = Math.round(classData[0].dataValues.MP + ((level - 1) * (classData[0].dataValues.INT * 1)))

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
        gold: 0,
        AdditionState: [
          classData[0].dataValues.STR,
          classData[0].dataValues.DEX,
          classData[0].dataValues.CON,
          classData[0].dataValues.INT
        ]
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


export default router;