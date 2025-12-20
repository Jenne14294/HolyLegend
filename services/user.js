import { models } from '../models/index.js';

const getClass = async (conditions = {}) => {
  try {
    const classInstance = await models.Class.findAll({
      where: conditions,
    });
    return classInstance;
    }   
catch (err) {  
    throw err;
  }};

const getUserClasses = async (conditions = {}) => {
    try {
        const userClass = await models.UserClass.findAll({
            where: conditions,
        });
        return userClass;
    }
    catch (err) {
        throw err;
    }
};

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

const getInventory = async (conditions = {}) => {
    try {
        const Inventory = await models.Inventory.findAll({
            where: conditions,
            // ★ 新增 include 設定
            include: [{
                model: models.Item,
                as: 'item', // 必須對應 models/index.js 中 belongsTo 設定的別名
                // attributes: ['name', 'image', 'description'], // (選用) 如果只想撈特定欄位
            }],
            // order: [['createdAt', 'DESC']] // (選用) 排序
        });
        return Inventory;
    }
    catch (err) {
        throw err;
    }
}

const getEquipments = async (conditions = {}) => {
    try {
        const Equipments = await models.Equipment.findOne({
            where: conditions,
        });
        return Equipments;
    }
    catch (err) {
        throw err;
    }
}

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

const addUserEquipments = async (data) => {
    try {
        const Equipment = await models.Equipment.create({
            userId: data.userId,
        });
        return Equipment;
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


const updateUserEquipment = async (userId, data) => {
    try {
        let CleanData = []
        data.forEach(item => {
            if (item === null) {
                CleanData.push({id: null})
            }

            else {
                CleanData.push({id: item.id})
            }
            
        });

        // Sequelize: 更新資料
        // 回傳值是一個陣列，第一個元素是「受影響的行數」
        const [updatedRows] = await models.Equipment.update(
            {
                slot1: CleanData[0].id,
                slot2: CleanData[1].id,
                slot3: CleanData[2].id,
                slot4: CleanData[3].id,
                slot5: CleanData[4].id,
                slot6: CleanData[5].id,
                slot7: CleanData[6].id,
                slot8: CleanData[7].id,
                
            },
            {
                where: { userId: userId } // 指定更新條件
            }
        );

        // 如果受影響行數 > 0，代表更新成功
        return updatedRows > 0;
        
    } catch (error) {
        console.error("DB Update Error:", error);
        return false;
    }
}

const updateUserInventory = async (userId, inventoryArray) => {
    try {
        if (!inventoryArray || !Array.isArray(inventoryArray) || inventoryArray.length === 0) {
            return true; // 空陣列視為成功
        }

        // 1. 資料清洗與映射
        // 前端傳來的 item.id 是物品ID (itemId)，item.count 是數量
        const cleanData = inventoryArray.map(item => ({
            userId: userId,
            itemId: item.id,      // 對應 Inventory.itemId
            quantity: item.quantity, // 對應 Inventory.quantity
            equipped: item.equipped || 0 // 如果前端有維護已裝備數量
        }));

        // 2. 批量寫入 (如果 userId+itemId 存在則更新，不存在則插入)
        await models.Inventory.bulkCreate(cleanData, {
            updateOnDuplicate: ['quantity', 'equipped', 'updatedAt']
        });

        return true;
    } catch (error) {
        console.error("DB Update Inventory Error:", error);
        return false;
    }
}



export { getClass, getUserClasses, getEquipments, getInventory, getUserClassRecord, addUserClassRecord, addUserEquipments, updateUserClassRecord, updateUserClass, updateUserEquipment, updateUserInventory};