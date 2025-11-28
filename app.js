import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';
import { sequelize } from './models/index.js';

import indexRouter from './routes/index.js';
import accountRouter from './routes/Account.js';

const app = express();

// 為了取得 __dirname 等效
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/social', express.static(path.join(__dirname, 'public', 'social')));
app.use(express.static(path.join(__dirname, 'public')));


sequelize.sync()
  .then(() => {
    console.log('資料表已同步');
  })
  .catch((err) => {
    console.error('同步失敗:', err);
  });

// session 的東東
app.use(session({
  secret: 'secret_key',    // 換成自己設定的字串
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // 如果有 https，這裡可以改 true
}));

app.use('/', indexRouter);
app.use('/account', accountRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

export default app;
