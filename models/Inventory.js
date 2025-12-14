import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';

const Inventory = sequelize.define(
  'Inventory',
  {
    // 自動生成的 id
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // 對應的使用者 ID
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // 對應的物品 ID (關聯到 Item 表)
    itemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // 擁有的總數量 (包含已裝備)
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // 已裝備的數量
    equipped: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    timestamps: true, // 記錄獲得時間
    indexes: [
      {
        unique: true,
        fields: ['userId', 'itemId'], // 確保同一玩家對同一物品只有一筆記錄 (用數量控制)
      },
    ],
  },
);

console.log(Inventory === sequelize.models.Inventory); // true

export default Inventory;