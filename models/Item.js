import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';

const Item = sequelize.define(
  'Item',
  {
    // --- 基礎資訊 ---
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // --- 分類與限制 ---
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      // 建議值: 'POTION' (藥水), 'STAT_BOOST' (屬性強化), 'GENERAL_SKILL' (通用技能), 'CLASS_SKILL' (職業技能)
    },
    requiredClass: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // 如果是 NULL 代表通用，如果有值 (e.g., '戰士') 代表只有該職業能買/用
    },

    // --- 效果定義 ---
    effectType: {
      type: DataTypes.STRING,
      allowNull: false,
      // 建議值: 'HP', 'MP', 'REVIVE', 'STR', 'DEX', 'CON', 'INT', 'SKILL_UNLOCK'
    },
    effectValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      // 若是藥水/強化: 代表數值 (如 30, 2)
      // 若是技能石: 代表技能 ID
    },
    isPercentage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // --- 商店邏輯 ---
    maxStock: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
  },
  {
    timestamps: true, // 保留建立與更新時間
  },
);

console.log(Item === sequelize.models.Item); // true

export default Item;