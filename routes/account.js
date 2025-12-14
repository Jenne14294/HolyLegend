import express from 'express';
import bcrypt from 'bcrypt';
import { getUser, createUser, verifyToken} from '../services/accountAuth.js';
import { getClass, updateUserClass, getUserClassRecord, addUserClassRecord, addUserEquipments } from '../services/user.js';
import { updateUserNickname} from '../services/account.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.render('create_account', { title: 'Express' });
});

router.post('/auth/register', async (req, res, next) => {
  // Handle registration logic here
  const user = await getUser({ name: req.body.username });

  if (user) {
    return res.status(400).json({ success: false, msg: ' 該信箱已存在帳戶' });
  }

  const hash = await bcrypt.hash(req.body.password, 10);

  const Newuser = await createUser({
    name: req.body.username,
    password: hash,
    jobId: -1,
    gameIntro: false
  });

  await addUserEquipments({userId: Newuser.id})

  return res.status(200).json({ success: true, msg: '註冊成功' });
});

router.post('/auth/login', async (req, res, next) => {
  try {
    // 1. 驗證帳號
    const user = await getUser({ name: req.body.username });
    if (!user) {
      return res.status(400).json({ success: false, msg: '帳號或密碼錯誤' });
    }

    // 2. 驗證密碼
    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) {
      return res.status(400).json({ success: false, msg: '帳號或密碼錯誤' });
    }

    // --- 3. 生成 JWT Token (這張票據代表使用者的身分) ---
    // payload: 裡面放你之後想隨時讀取的資料，例如 id 和 name
    const token = jwt.sign(
      { id: user.id, username: user.name }, 
      process.env.JWT_SECRET, // 建議放在 .env 檔
      { expiresIn: '24h' } // Token 有效期
    );

    // --- 4. 設定 Cookie ---
    res.cookie('auth_token', token, {
      httpOnly: true,  // 關鍵！防止前端 JS (document.cookie) 讀取，防 XSS 攻擊
      secure: false,   // 如果你有用 HTTPS (正式上線) 這裡要改成 true
      maxAge: 24 * 60 * 60 * 1000, // Cookie 有效期 (毫秒)，這裡設為 1 天
      sameSite: 'lax'  // 防止 CSRF 的基本設定
    });

    // 5. 為了安全，回傳給前端的 user 物件不要包含密碼
    const userResponse = { ...user };
    delete userResponse.password; 

    return res.status(200).json({ 
      success: true, 
      msg: '登入成功', 
      user: userResponse 
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: '伺服器錯誤' });
  }
});

router.get('/select_role', (req, res, next) => {
  res.render('create_player', { title: '選擇角色' });
});

router.post('/set_role', verifyToken, async (req, res, next) => {
  try {
    // 1. 檢查職業是否存在
    const job = await getClass({ name: req.body.role });
    if (!job) {
      return res.status(400).json({ success: false, msg: '職業不存在' });
    }

    const job_record = await getUserClassRecord({userId: req.user.id, jobId: job[0].id});

    if (!job_record) {
      // 如果沒有職業紀錄，新增一筆
      await addUserClassRecord({
        userId: req.user.id,
        jobId: job[0].id,
        currentEXP: 0,
        level: 1
      });
    }

    // 2. 更新使用者資料
    // 這裡的 req.user.id 就是從 Cookie 解密出來的，絕對安全！
    // 假設你的 updateUserClass 需要的是使用者 ID (user_id)
    await updateUserClass({
      id: req.user.id,     // <--- 關鍵修改：使用 Token 裡的 ID
      jobId: job[0].id,       // 職業的 ID (例如 1=戰士)
      nickname: req.body.name
    });

    // 3. 回傳成功
    return res.status(200).json({
      success: true,
      msg: '職業設定成功',
      redirectUrl: '/holylegend/game_lobby',
      // 注意：回傳給前端的 playerId 應該是用戶 ID，讓前端知道要載入誰的存檔
      playerId: req.user.id, 
      tutorial: req.body.tutorial
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: '伺服器錯誤' });
  }
});


router.post('/updateProfile', verifyToken, async (req, res, next) => {
  try {
    // 1. 檢查職業是否存在
    const user = await getUser({id: req.user.id})

    if (!user) {
      return res.redirect('/holylegend'); // 找不到人就踢回登入
    }

    await updateUserNickname({name: req.body.name, userId: req.user.id})

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: '伺服器錯誤' });
  }
});

export default router;
