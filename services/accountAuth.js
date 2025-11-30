import { models } from '../models/index.js';
import jwt from 'jsonwebtoken';

const getUser = async (conditions = {}) => {
  try {
    const user = await models.User.findOne({
      where: conditions,
    });

    return user;
  } catch (err) {
    throw err;
  }
};

const createUser = async (userData) => {
  try {
    const newUser = await models.User.create(userData);
    return newUser;
  } catch (err) {
    throw err;
  }
};

const verifyToken = (req, res, next) => {
    // 1. 從 cookie 拿 token
    const token = req.cookies.auth_token; 
    console.log(token);

    if (!token) {
        return res.status(401).json({ success: false, msg: '請先登入' });
    }

    try {
        // 2. 解密 Token
        // 'secret_key_change_me' 必須跟你登入時用的一模一樣
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. 把解出來的資料 (id, username) 存入 req.user
        req.user = decoded; 
        
        next(); // 通行，繼續執行後面的路由
    } catch (err) {
        return res.status(403).json({ success: false, msg: '登入過期或無效' });
    }
};


export {
  getUser,
  createUser,
  verifyToken
};




