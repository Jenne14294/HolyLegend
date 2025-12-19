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
import Status from './Status.js'; // ★ 新增：匯入 Status 模型

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
  Enemy,
  Status // ★ 新增：加入模型清單
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
Skill.belongsTo(Class, { foreignKey: 'jobId', as: 'class' }); // 對應職業 ID

// 4. User & Inventory (背包)
User.hasMany(Inventory, { foreignKey: 'userId', as: 'inventory' });
Inventory.belongsTo(User, { foreignKey: 'userId' });

// 5. Item & Inventory (物品定義)
Item.hasMany(Inventory, { foreignKey: 'itemId' });
Inventory.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

// 6. User & Equipment (裝備欄)
User.hasOne(Equipment, { foreignKey: 'userId', as: 'equipment' });
Equipment.belongsTo(User, { foreignKey: 'userId' });

// 7. Equipment & Item (8個技能石插槽)
Equipment.belongsTo(Item, { foreignKey: 'slot1', as: 'itemSlot1' });
Equipment.belongsTo(Item, { foreignKey: 'slot2', as: 'itemSlot2' });
Equipment.belongsTo(Item, { foreignKey: 'slot3', as: 'itemSlot3' });
Equipment.belongsTo(Item, { foreignKey: 'slot4', as: 'itemSlot4' });
Equipment.belongsTo(Item, { foreignKey: 'slot5', as: 'itemSlot5' });
Equipment.belongsTo(Item, { foreignKey: 'slot6', as: 'itemSlot6' });
Equipment.belongsTo(Item, { foreignKey: 'slot7', as: 'itemSlot7' });
Equipment.belongsTo(Item, { foreignKey: 'slot8', as: 'itemSlot8' });

// 8. Item & Class (物品需求)
Item.belongsTo(Class, { foreignKey: 'requiredClass', as: 'requiredClassDetail' });
Class.hasMany(Item, { foreignKey: 'requiredClass', as: 'exclusiveItems' });

// 9. Skill & Item (技能與物品)
Skill.belongsTo(Item, { foreignKey: 'ItemId', as: 'item' });
Item.hasOne(Skill, { foreignKey: 'ItemId', as: 'skill' });

// 10. ★ 新增：Skill & Status (技能與狀態效果)
// 一個狀態效果屬於一個技能 (透過 skillId)
Status.belongsTo(Skill, { foreignKey: 'skillId', as: 'skill' });
// 一個技能可以擁有多個狀態效果 (例如：流血 + 減速)
Skill.hasMany(Status, { foreignKey: 'skillId'});

console.log(models);

export { sequelize, models };