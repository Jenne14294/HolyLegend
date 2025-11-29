import express from 'express';
import bcrypt from 'bcrypt';
import { getUser, createUser } from '../services/accountAuth.js';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.render('account/login/index', { title: 'Express' });
});

router.get('/register', (req, res, next) => {
  res.render('account/register/index', { title: 'Express' });
});

router.post('/auth/register', async (req, res, next) => {
  // Handle registration logic here
  const user = await getUser({ email: req.body.email });

  console.log(user);

  if (user) {
    return res.status(400).json({ success: false, msg: ' 該信箱已存在帳戶' });
  }

  const hash = await bcrypt.hash(req.body.password, 10);

  await createUser({
    name: req.body.username,
    email: req.body.email,
    password: hash
  });

  return res.status(200).json({ success: true, msg: '註冊成功' });
});

router.post('/auth/login', async (req, res, next) => {
  // Handle login logic here
  const user = await getUser({ email: req.body.email });
  if (!user) {
    return res.status(400).json({ success: false, msg: '帳號或密碼錯誤' });
  }
  const match = await bcrypt.compare(req.body.password, user.password);
  if (!match) {
    return res.status(400).json({ success: false, msg: '帳號或密碼錯誤' });
  }

  return res.status(200).json({ success: true, msg: '登入成功', user: user });
});

router.get('/select_role', (req, res, next) => {
  res.render('account/create_player/index', { title: '選擇角色' });
});

export default router;
