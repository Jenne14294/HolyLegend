import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // 必需：用於 ES Modules 定義 __dirname

// 引入您的服務層 (Service)
import { getRewards, getEvents, getItems, getEnemies } from '../services/system.js';
import { getUser, verifyToken } from '../services/accountAuth.js';
import { getClass } from '../services/classes.js';
import {updateUserAvatar} from '../services/account.js';

const router = express.Router();

// --- ES Modules 修正 __dirname ---
// 因為 type="module" 時沒有全域 __dirname，需手動建立
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Multer 儲存設定 ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 1. 獲取 user_id (從 verifyToken 解析的 req.user 中獲取)
        // 注意：這依賴於路由設定中 verifyToken 必須排在 upload 之前
        const userId = req.user ? req.user.id : null;

        if (!userId) {
            return cb(new Error('未授權: 無法獲取 User ID'), null);
        }

        // 2. 定義目標資料夾路徑
        // 這裡假設 system.js 在 routes/ 資料夾內，所以用 ../public 回到根目錄找 public
        const uploadDir = path.join(__dirname, '../public', 'avatars', 'users', String(userId));

        // 3. 檢查資料夾是否存在，不存在則建立 (recursive: true 代表可建立多層目錄)
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 4. 處理檔名
        // 取得原始檔案的副檔名 (例如 .jpg, .png)
        const ext = path.extname(file.originalname);
        
        // 強制命名為 avatar + 原副檔名 (覆蓋舊檔)
        cb(null, `avatar${ext}`);
    }
});

// 過濾器：只允許圖片
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只允許上傳圖片檔案！'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ===============================
//            Routes
// ===============================

router.get('/rewards', async (req, res, next) => {
  try {
    const rewards = await getRewards();
    res.json({"success":true, data: rewards});
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

    const classData = await getClass({ id: userData.jobId})

    // 2. 資料整形
    const currentClass = userData.UserClasses.find(
      uc => uc.jobId === userData.jobId
    );
    
    // 計算屬性
    const level = currentClass.level || 1;
    const hp = Math.round(classData[0].dataValues.HP + ((level - 1) * (classData[0].dataValues.STR * 0.3 + classData[0].dataValues.CON * 0.7)))
    const mp = Math.round(classData[0].dataValues.MP + ((level - 1) * (classData[0].dataValues.INT * 0.75)))

    const renderData = {
        id: userData.id,
        nickname: userData.nickName,
        role: userData.class.nickname,
        level: level,
        exp: currentClass.currentEXP || 0,
        needEXP: 50 + (level - 1) * 20,
        hp: hp,
        maxHp: hp,
        mp: mp,
        maxMp: mp,
        currentFloor: 1,
        gold: 0,
        AdditionState: [
          classData[0].dataValues.STR,
          classData[0].dataValues.DEX,
          classData[0].dataValues.CON,
          classData[0].dataValues.INT
        ],
        avatar: userData.avatar || `/holylegend/images/classes/${classData[0].dataValues.name}_1.png`
    };

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
      return res.redirect('/holylegend/');
    }

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

router.get('/events', async (req, res, next) => {
  try {
    const events = await getEvents();
    res.json({"success":true, data: events});
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/items', async (req, res, next) => {
  try {
    const items = await getItems();
    res.json({"success":true, data: items});
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/enemy', async (req, res, next) => {
  try {
    const enemies = await getEnemies();
    res.json({"success":true, data: enemies});
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// --- 上傳頭像路由 ---
// 重要：verifyToken 必須在 upload.single 之前執行
router.post('/upload_avatar', verifyToken, upload.single('avatar_image'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '請選擇要上傳的圖片' });
        }

        const userId = req.user.id;
        
        // 構建回傳路徑 (假設 public 對應根目錄 /)
        const fileUrl = `/holylegend/avatars/users/${userId}/${req.file.filename}`;

        await updateUserAvatar({avatar: fileUrl, userId: req.user.id})
        
        res.json({
            success: true, 
            message: '頭像上傳成功', 
            data: {
                userId: userId,
                path: fileUrl,
                filename: req.file.filename
            }
        });
    } catch (err) {
        console.error('上傳錯誤:', err);
        next(err);
    }
});

export default router;