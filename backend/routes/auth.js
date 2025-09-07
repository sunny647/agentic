const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Email/password login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login', session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  res.redirect('/dashboard');
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;
