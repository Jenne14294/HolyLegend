// models/Status.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const Status = sequelize.define('Status', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  skillId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false
  },
  image: {
    type: DataTypes.STRING,
    allowNull: false
  },
  duration:{
    type: DataTypes.INTEGER,
    allowNull: false
  },
  effectType: {
    type: DataTypes.ENUM('STAT', 'SKILL_DAMAGE'),
    allowNull: false
  },
  statKey: {
    type: DataTypes.ENUM('STR', 'DEX', 'CON', 'INT','CRIT', 'DODGE', 'DMG_REDUCE','HP_BONUS', 'MP_BONUS','REGEN', 'MANA_RETURN','ATK_BONUS', 'SKILL_BONUS','EXP_BONUS'),
    allowNull: true
  },
  value: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  valueType: { 
    type: DataTypes.ENUM('Add', 'Multiply'),
    allowNull: false
  }
});

// `sequelize.define` also returns the model
console.log(Status === sequelize.models.Status); // true

export default Status;

