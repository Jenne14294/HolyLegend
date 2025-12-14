import { models } from '../models/index.js';

const getRewards = async () => {
  try {
    const rewards = await models.Reward.findAll({
    });
    return rewards;
    }   
catch (err) {  
    throw err;
  }
};



const getEvents = async () => {
  try {
    const Events = await models.Event.findAll({
    });
    return Events;
    }   
catch (err) {  
    throw err;
  }
};

const getItems = async () => {
  try {
      const Items = await models.Item.findAll({
      });
      return Items;
      }   
  catch (err) {  
      throw err;
    }
};

const getEnemies = async () => {
  try {
      const Enemies = await models.Enemy.findAll({
      });
      return Enemies;
      }   
  catch (err) {  
      throw err;
    }
};

export {getRewards, getEvents, getItems, getEnemies}