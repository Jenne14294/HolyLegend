// models/index.js
import sequelize from '../database.js';
import User from './User.js';
import Class from './Class.js';

const models = { User, Class };

// --- 修正關聯設定 ---

// 1. 因為 User 身上有 'jobId'，所以是 User 屬於 Class
// 這告訴 Sequelize: 請拿 User.jobId 去對應 Class.id
User.belongsTo(Class, { foreignKey: 'jobId', as: 'class' }); 

// 2. (選用) 反向關聯：一個職業可以有很多玩家
// 這告訴 Sequelize: Class 自己沒有外鍵，請去 User 表找 'jobId'
Class.hasMany(User, { foreignKey: 'jobId' });

console.log(models);

export { sequelize, models };