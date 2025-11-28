import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 設定 __dirname (ES Module 必備)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// View Engine 設定
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 基礎 Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session 設定 (遊戲登入狀態用)
app.use(session({
  secret: 'game_secret_key', // 建議改由 .env 讀取
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // 若有 HTTPS 則改為 true
}));

// --- 測試路由 (確保伺服器會動) ---
app.get('/', (req, res) => {
  res.send('Game Server is Running!');
});

// 404 錯誤處理
app.use(function (req, res, next) {
  next(createError(404));
});

// 全域錯誤處理
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // 如果你有 views/error.ejs 就用 render，沒有的話改用 res.json(err)
  res.status(err.status || 500);
  res.render('error'); 
});

export default app;