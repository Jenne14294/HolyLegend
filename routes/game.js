import express from 'express';
import bcrypt from 'bcrypt';
import { getUser, createUser, verifyToken} from '../services/accountAuth.js';
import { getClass, updateUserClass } from '../services/classes.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.render('game', { title: 'Express' });
});

export default router;
