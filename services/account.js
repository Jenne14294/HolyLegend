import { models } from '../models/index.js';

const updateUser = async (data) => {
  try {
    const [updatedRows] = await models.User.update(
        {
            nickName: data.name
        },
        {
            // 確保同時對應 userId 和 jobId
            where: { 
                id: data.userId
            } 
        }
    );

    return updatedRows > 0;
        
} catch (error) {
    console.error("DB Update Error:", error);
    return false;
}};


export {
  updateUser,
};




