import { models } from '../models/index.js';

const getUser = async (conditions = {}) => {
  try {
    const user = await models.User.findOne({
      where: conditions,
    });

    return user;
  } catch (err) {
    throw err;
  }
};

const createUser = async (userData) => {
  try {
    const newUser = await models.User.create(userData);
    return newUser;
  } catch (err) {
    throw err;
  }
};


export {
  getUser,
  createUser
};




