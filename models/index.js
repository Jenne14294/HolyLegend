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

// 1. User & Class (職業)
User.belongsTo(Class, { foreignKey: 'jobId', as: 'class' }); 
Class.hasMany(User, { foreignKey: 'jobId' });

// 2. User & UserClass (職業進度)
UserClass.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(UserClass, { foreignKey: 'userId' });

UserClass.belongsTo(Class, { foreignKey: 'id', as: 'class' });
Class.hasMany(UserClass, { foreignKey: 'jobId' });

// 3. Class & Skill (職業技能)
Class.hasMany(Skill, { foreignKey: 'jobId' });

// --- 新增: 物品系統關聯 ---

// 4. User & Inventory (背包)
// 一個使用者有多個背包格子
User.hasMany(Inventory, { foreignKey: 'userId', as: 'inventory' });
// 一個背包格子屬於一個使用者
Inventory.belongsTo(User, { foreignKey: 'userId' });

// 5. Item & Inventory (物品定義)
// 一個物品可以出現在很多背包記錄中
Item.hasMany(Inventory, { foreignKey: 'itemId' });
// 一個背包記錄對應一種物品
Inventory.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

// 6. User & Equipment (裝備欄)
// 一個使用者只有一套裝備設定
User.hasOne(Equipment, { foreignKey: 'userId', as: 'equipment' });
Equipment.belongsTo(User, { foreignKey: 'userId' });

// 7. Equipment & Item (8個技能石插槽)
// 這裡建立 8 個關聯，讓你在查詢 Equipment 時可以 include 這些別名來獲取物品詳細資料
Equipment.belongsTo(Item, { foreignKey: 'slot1', as: 'itemSlot1' });
Equipment.belongsTo(Item, { foreignKey: 'slot2', as: 'itemSlot2' });
Equipment.belongsTo(Item, { foreignKey: 'slot3', as: 'itemSlot3' });
Equipment.belongsTo(Item, { foreignKey: 'slot4', as: 'itemSlot4' });
Equipment.belongsTo(Item, { foreignKey: 'slot5', as: 'itemSlot5' });
Equipment.belongsTo(Item, { foreignKey: 'slot6', as: 'itemSlot6' });
Equipment.belongsTo(Item, { foreignKey: 'slot7', as: 'itemSlot7' });
Equipment.belongsTo(Item, { foreignKey: 'slot8', as: 'itemSlot8' });

// 8. Item & Class (物品需求職業)
// 物品屬於某個職業 (需求職業)
// 假設 Item 模型中的欄位名稱改為 requiredClassId
// ★ 修正：將 as 改為 'requiredClassDetail' 避免與 Item 模型中的 requiredClass 欄位名稱衝突
Item.belongsTo(Class, { foreignKey: 'requiredClassId', as: 'requiredClassDetail' });
// 一個職業可以有多個專屬物品 (選用)
Class.hasMany(Item, { foreignKey: 'requiredClassId', as: 'exclusiveItems' });

console.log(models);

export { sequelize, models };