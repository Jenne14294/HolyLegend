// models/UserClass.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const UserClass = sequelize.define(
  'UserClass',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    jobId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    currentEXP: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    // Other model options go here
    // tableName: 'UserClasss',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(UserClass === sequelize.models.UserClass); // true

export default UserClass;

