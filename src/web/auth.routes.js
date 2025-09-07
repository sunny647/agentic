const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { getUserByEmail, createUser, verifyPassword } = require('../db/user');
const { jwtSecret } = require('../config');

const router = express.Router();

// Email/password login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Google OAuth2 login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login?error=google' }), (req, res) => {
  // Successful Google login
  const user = req.user;
  const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
  // Redirect to frontend with token (could use cookie or query param)
  res.redirect(`/?token=${token}`);
});

module.exports = router;
