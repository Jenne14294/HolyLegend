// models/Class.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Class = sequelize.define(
  'Class',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nickname: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    STR: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DEX: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },  
    CON: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    INT: {
      type: DataTypes.INTEGER,  
      allowNull: true,
    },
    requireClassA: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requireClassLevelA: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requireClassB: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requireClassLevelB: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    // Other model options go here
    // tableName: 'Classs',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Class === sequelize.models.Class); // true

export default Class;

