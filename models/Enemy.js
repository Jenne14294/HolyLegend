// models/Enemy.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Enemy = sequelize.define(
  'Enemy',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    discription: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    HP: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    MP: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ATK: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DEF: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    MDEF: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    Gold: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    EXP: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    // Other model options go here
    // tableName: 'Enemys',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Enemy === sequelize.models.Enemy); // true

export default Enemy;

