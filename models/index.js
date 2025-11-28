// models/index.js
import sequelize from '../database.js';  // 資料庫連線
import User from './User.js';  // 引入模型
import Player from './player.js';
// import Exercise from './Exercise.js';
// import Dodo_value from './DodoValue.js';
// import Activity from './Activity.js';
// import Task from './Task.js';
// import UserTask from './UserTask.js';
// import Friendship from './Friendship.js';
// import Collection from './Collection.js';
// import Achievement from './Achievement.js';
// import Album from './Album.js';
// import ItemData from './ItemData.js';
// import Inventory from './Inventory.js';

// // 建立模型之間的關聯
// const models = { User, Exercise, Dodo_value, Activity, Task, UserTask, Friendship, Collection, Achievement, Album, ItemData, Inventory };
const models = {User, Player};

// // 設定模型之間的關聯（如果有）
// User.hasMany(Activity, { foreignKey: 'user_id' });  // User 和 Activity 一對多
// Activity.belongsTo(User, { foreignKey: 'user_id' });  // Activity 依賴於 User

// Exercise.hasMany(Activity, { foreignKey: 'exer_id' });  // Exercise 和 Activity 一對多
// Activity.belongsTo(Exercise, { foreignKey: 'exer_id' });  // Activity 依賴於 Exercise

// Dodo_value.hasOne(User, { foreignKey: 'dodo_id' });  // User 和 Dodo_value 一對一
// User.belongsTo(Dodo_value, { foreignKey: 'dodo_id' });  // Dodo_value 依賴於 User

// User.hasMany(UserTask, { foreignKey: 'user_id' });
// UserTask.belongsTo(User, { foreignKey: 'user_id' });

// Task.hasMany(UserTask, { foreignKey: 'task_id' });
// UserTask.belongsTo(Task, { foreignKey: 'task_id' });

// Friendship.belongsTo(User, { as: 'Friend', foreignKey: 'friend_id' });
// User.hasMany(Friendship, { foreignKey: 'user_id', as: 'Friends' });

// // --- 玩家背包 ---
// User.hasMany(Inventory, { foreignKey: 'user_id' });
// Inventory.belongsTo(User, { foreignKey: 'user_id' });

// // 🛑 修正這裡：foreignKey 應該是 'item_id'，不是 'id'
// ItemData.hasMany(Inventory, { foreignKey: 'item_id' }); 
// Inventory.belongsTo(ItemData, { foreignKey: 'item_id' });


// // --- 收藏 ---
// User.hasMany(Collection, { foreignKey: 'user_id' });
// Collection.belongsTo(User, { foreignKey: 'user_id' });

// // 🛑 修正這裡：foreignKey 應該是 'collection_id'，不是 'id'
// ItemData.hasMany(Collection, { foreignKey: 'collection_id' }); 
// Collection.belongsTo(ItemData, { foreignKey: 'collection_id' });


// // --- 成就 ---
// User.hasMany(Achievement, { foreignKey: 'user_id' });
// Achievement.belongsTo(User, { foreignKey: 'user_id' });

// // 🛑 修正這裡：foreignKey 應該是 'achievement_id'，不是 'id'
// ItemData.hasMany(Achievement, { foreignKey: 'achievement_id' }); 
// Achievement.belongsTo(ItemData, { foreignKey: 'achievement_id' });


// // --- 相冊 ---
// User.hasMany(Album, { foreignKey: 'user_id' });
// Album.belongsTo(User, { foreignKey: 'user_id' });

// // 🛑 修正這裡：foreignKey 應該是 'album_id'，不是 'id'
// ItemData.hasMany(Album, { foreignKey: 'album_id' }); 
// Album.belongsTo(ItemData, { foreignKey: 'album_id' });

console.log(models);

// 將所有模型和資料庫匯出
export { sequelize, models };
