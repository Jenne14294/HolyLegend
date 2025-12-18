// models/index.js
import sequelize from '../database.js';
import User from './User.js';
import Class from './Class.js';
import UserClass from './UserClass.js';
import Skill from './Skill.js';
import Reward from './Reward.js';
import Event from './Event.js';
import Item from './Item.js';
import Inventory from './Inventory.js';
import Equipment from './Equipment.js';
import Enemy from './Enemy.js';

const models = { 
  User, 
  Class, 
  UserClass, 
  Skill, 
  Reward, 
  Event, 
  Item, 
  Inventory, 
  Equipment,
  Enemy
};

// --- 修正關聯設定 ---
User.belongsTo(Class, { foreignKey: 'jobId', as: 'class' });  // User 只有一個 Class
Class.hasMany(User, { foreignKey: 'jobId' });  // 多個 Class 對應到一個用戶
UserClass.belongsTo(User, { foreignKey: 'userId', as: 'user' }); // 一個職業紀錄對應到一個用戶
User.hasMany(UserClass, { foreignKey: 'userId' });  // 用戶有多個遊玩的職業紀錄

UserClass.belongsTo(Class, { foreignKey: 'id', as: 'class' });
Class.hasMany(UserClass, { foreignKey: 'jobId' });

Class.hasMany(Skill, { foreignKey: 'jobId' });

User.hasMany(Inventory, { foreignKey: 'userId', as: 'inventory' });
Inventory.belongsTo(User, { foreignKey: 'userId' });

Item.hasMany(Inventory, { foreignKey: 'itemId' });
Inventory.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

// 一個使用者只有一套裝備設定
User.hasOne(Equipment, { foreignKey: 'userId', as: 'equipment' });
Equipment.belongsTo(User, { foreignKey: 'userId' });

Equipment.belongsTo(Item, { foreignKey: 'slot1', as: 'itemSlot1' });
Equipment.belongsTo(Item, { foreignKey: 'slot2', as: 'itemSlot2' });
Equipment.belongsTo(Item, { foreignKey: 'slot3', as: 'itemSlot3' });
Equipment.belongsTo(Item, { foreignKey: 'slot4', as: 'itemSlot4' });
Equipment.belongsTo(Item, { foreignKey: 'slot5', as: 'itemSlot5' });
Equipment.belongsTo(Item, { foreignKey: 'slot6', as: 'itemSlot6' });
Equipment.belongsTo(Item, { foreignKey: 'slot7', as: 'itemSlot7' });
Equipment.belongsTo(Item, { foreignKey: 'slot8', as: 'itemSlot8' });

Item.belongsTo(Class, { foreignKey: 'requiredClass', as: 'requiredClassDetail' });
// 一個職業可以有多個專屬物品 (選用)
Class.hasMany(Item, { foreignKey: 'requiredClass', as: 'exclusiveItems' });

Skill.belongsTo(Item, { foreignKey: 'ItemId', as: 'item' });
Item.hasOne(Skill, { foreignKey: 'ItemId', as: 'skill' });

console.log(models);

export { sequelize, models };