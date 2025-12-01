import { models } from '../models/index.js';

const getClass = async (conditions = {}) => {
  try {
    const classInstance = await models.Class.findOne({
      where: conditions,
    });
    return classInstance;
    }   
catch (err) {  
    throw err;
  }};

const getUserClassRecord = async (conditions = {}) => {
    try {
        const userClass = await models.UserClass.findOne({
            where: conditions,
        });
        return userClass;
    }
    catch (err) {
        throw err;
    }
};

const addUserClassRecord = async (data) => {
    try {
        const newUserClass = await models.UserClass.create({
            userId: data.userId,
            jobId: data.jobId,
            currentEXP: data.currentEXP || 0,
            level: data.level || 1,
        });
        return newUserClass;
    } catch (err) {
        throw err;
    }
};

const updateUserClassRecord = async (user, data) => {
    try {
        const [updatedRows] = await models.UserClass.update(
            {
                currentEXP: data.currentEXP,
                level: data.level
            },
            {
                // 確保同時對應 userId 和 jobId
                where: { 
                    userId: user.id, // user.id (Sequelize 物件通常是 id)
                    jobId: user.jobId 
                } 
            }
        );

        return updatedRows > 0;
        
    } catch (error) {
        console.error("DB Update Error:", error);
        return false;
    }
};

const updateUserClass = async (data) => {
    try {
        // Sequelize: 更新資料
        // 回傳值是一個陣列，第一個元素是「受影響的行數」
        const [updatedRows] = await models.User.update(
            {
                jobId: data.jobId,
                nickName: data.nickname,
            },
            {
                where: { id: data.id } // 指定更新條件
            }
        );

        // 如果受影響行數 > 0，代表更新成功
        return updatedRows > 0;
        
    } catch (error) {
        console.error("DB Update Error:", error);
        return false;
    }
};



export { getClass, updateUserClass, getUserClassRecord, addUserClassRecord, updateUserClassRecord };