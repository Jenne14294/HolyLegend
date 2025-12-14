import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';

const Equipment = sequelize.define(
  'Equipment',
  {
    // 自動生成的 id
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // 對應的使用者 ID
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // 一個玩家只能有一組裝備設定
    },
    // 8 個技能石插槽，儲存的是 Item 的 ID
    // 如果該插槽沒裝備，則為 NULL
    slot1: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot2: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot3: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot4: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot5: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot6: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot7: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot8: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    timestamps: true,
  },
);

console.log(Equipment === sequelize.models.Equipment); // true

export default Equipment;