// models/Reward.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Reward = sequelize.define(
  'Reward',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rewardType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rewardValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rewardPercent: {
      type: DataTypes.INTEGER,
      allowNull: true,
    }
  },
  {
    // Other model options go here
    // tableName: 'Rewards',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Reward === sequelize.models.Reward); // true

export default Reward;

