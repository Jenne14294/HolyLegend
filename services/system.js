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
    const items = await models.Item.findAll({
      include: [
        {
          model: models.Class,
          as: 'requiredClassDetail',
          attributes: ['id', 'name', 'nickname'], // 視需要調整
          required: false // requiredClassId 為 null 的道具也會撈出
        }
      ]
    });

    return items;
  } catch (err) {
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

const getSkills = async () => {
  try {
      const Skills = await models.Skill.findAll({
      });
      return Skills;
      }   
  catch (err) {  
      throw err;
    }
};

export {getRewards, getEvents, getItems, getEnemies, getSkills}