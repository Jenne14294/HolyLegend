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

export {getRewards, getEvents}