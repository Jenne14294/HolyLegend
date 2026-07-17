import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';

const Enemy = sequelize.define(
  'Enemy',
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // ★ 關鍵修改：使用 ENUM
    type: {
      type: DataTypes.ENUM('NORMAL', 'ELITE', 'BOSS'),
      allowNull: false,
      defaultValue: 'NORMAL',
      comment: '怪物階級：NORMAL(普通), ELITE(菁英), BOSS(首領)',
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
      allowNull: false,
      defaultValue: 10,
    },
    MP: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ATK: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    DEF: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    MDEF: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    Gold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    EXP: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    minLayer: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    maxLayer: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
  },
  {
    timestamps: true,
  }
);

export default Enemy;