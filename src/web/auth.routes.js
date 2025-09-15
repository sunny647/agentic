import { Router } from 'express';
import { queryDB } from '../db/postgressdb.js';
import logger from '../logger.js';
import bcrypt from 'bcrypt';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  logger.info({ email }, 'Login attempt');
  if (!email || !password) {
    logger.warn({ email }, 'Missing email or password');
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  try {
    // Query user by email
    const users = await queryDB('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    if (!users.length) {
      logger.warn({ email }, 'Login failed: user not found');
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const user = users[0];
    // Compare password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      logger.warn({ email }, 'Login failed: wrong password');
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    logger.info({ email, userId: user.id }, 'Login successful');
    // (Session/JWT logic can be added here)
    return res.json({ success: true, message: 'Login successful.' });
  } catch (err) {
    logger.error({ err, email }, 'Login error');
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

export default router;
