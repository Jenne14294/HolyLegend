import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

console.log(process.env.DB_HOST);

const DB_HOST = process.env.DB_HOST ?? 'localhost';
const DB_NAME = process.env.DB_NAME ?? 'XXX';
const DB_USER = process.env.DB_USER ?? 'root';
const DB_PASSWORD = process.env.DB_PASSWORD ?? '';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: 'mysql',
});

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
}

export default sequelize;
