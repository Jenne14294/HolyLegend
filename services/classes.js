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

export { getClass, updateUserClass, };