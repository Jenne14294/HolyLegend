import { models } from '../models/index.js';
import jwt from 'jsonwebtoken';

const getUser = async (conditions = {}) => {
  try {
    const user = await models.User.findOne({
      where: conditions,
      include: [
        {
          model: models.UserClass,
          // as: 'classData' // 如果你在 model/index.js 有設定 as，這裡也要加
        },
        {
          model: models.Class,
          as: 'class' // 對應 User.belongsTo(Class, { as: 'class' })
        }
      ],
    });

    // 關鍵修改：如果有找到人，就轉成純物件 (Plain Object)
    // 這樣回傳給前端時才不會報錯
    return user ? user.get({ plain: true }) : null;

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




