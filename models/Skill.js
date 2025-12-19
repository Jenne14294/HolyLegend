// models/Skill.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Skill = sequelize.define(
  'Skill',
  {
    jobId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    ItemId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    skillType: {
      type: DataTypes.ENUM("Active", "Buff", "Passive"),
      allowNull: true
    },
    DamageType: {
      type: DataTypes.ENUM("Physical", "Magic", "Heal"),
      allowNull: true
    },
    DamageAStat: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    DamageBStat: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    DamageARatio: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DamageBRatio: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DamageTime : {
    type: DataTypes.INTEGER,
      allowNull: true,
    },
    targetType: {
      type: DataTypes.ENUM("self", "team", "enemy"),
      allowNull: true,
    },
    consumeType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    consumeAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    }
  },
  {
    // Other model options go here
    // tableName: 'Skills',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(Skill === sequelize.models.Skill); // true

export default Skill;

