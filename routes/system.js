import express from 'express';
import {getRewards} from '../services/system.js';

const router = express.Router();

router.get('/rewards', async (req, res, next) => {
  try {
    const rewards = await getRewards();

    res.json({"success":true, data: rewards});
  }

  catch (err) {
    console.error(err);
    next(err);
  }
});

export default router;