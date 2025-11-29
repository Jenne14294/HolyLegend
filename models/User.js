// models/User.js
import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../database.js';
const User = sequelize.define(
  'User',
  {
    // 這裡不需要定義 id，Sequelize 會自動識別並處理
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    jobId : {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    // Other model options go here
    // tableName: 'users',  // 明確指定資料表名稱
    timestamps: true,   // 禁用 `createdAt` 和 `updatedAt` 欄位
  },
);


// `sequelize.define` also returns the model
console.log(User === sequelize.models.User); // true

export default User;

