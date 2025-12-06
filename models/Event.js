// models/Event.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Event = sequelize.define(
  'Event',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rewardText: {
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
    failText: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    punishType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    punishValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requirementType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    requirementValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    }
  },
  {
    // Other model options go here
    // tableName: 'Events',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Event === sequelize.models.Event); // true

export default Event;

