// models/Player.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Player = sequelize.define('Player', {
  // --- 基礎資訊 ---
  job: { 
    type: DataTypes.ENUM('warrior', 'mage', 'archer', 'novice'), // 限制只能填這幾種
    defaultValue: 'novice'
  },
  
  // --- 成長進度 ---
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  currentEXP: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  gold: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  currentFloor: { 
    type: DataTypes.INTEGER,
    defaultValue: 1
  },

  // --- 戰鬥狀態 (會變動) ---
  currentHp: { 
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  currentMp: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  },
  {
    // Other model options go here
    // tableName: 'Players',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Player === sequelize.models.Player); // true

export default Player;

