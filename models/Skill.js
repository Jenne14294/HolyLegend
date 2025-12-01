// models/Skill.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Skill = sequelize.define(
  'Skill',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    jobId: {
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
      type: DataTypes.ENUM("Active", "Passive", "Buff"),
      allowNull: true
    },
    DamageTypeA: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    DamageTypeB: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    DamageRatioA: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DamageRatioB: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    targetType: {
      type: DataTypes.ENUM("self", "all_self", "all_enemy","one", "random"),
      allowNull: true,
    },
    consumeType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    consumeAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    levelRequirement: {
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

