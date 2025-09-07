// auth.routes.js
const express = require('express');
const passport = require('passport');
const { logger } = require('../logger');
const router = express.Router();

// Email/password login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error({ msg: 'Auth error', err });
      return res.status(500).json({ message: 'Internal server error.' });
    }
    if (!user) {
      logger.info({ msg: 'Login failed', email: req.body.email });
      return res.status(401).json({ message: info.message || 'Invalid credentials.' });
    }
    req.logIn(user, (err) => {
      if (err) {
        logger.error({ msg: 'Session error', err });
        return res.status(500).json({ message: 'Session error.' });
      }
      logger.info({ msg: 'Login success', userId: user.id, email: user.email });
      return res.json({ user: { id: user.id, email: user.email } });
    });
  })(req, res, next);
});

// Google OAuth login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google' }),
  (req, res) => {
    logger.info({ msg: 'Google login success', userId: req.user.id, email: req.user.email });
    res.redirect('/');
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ message: 'Logged out.' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (req.user) {
    res.json({ user: { id: req.user.id, email: req.user.email } });
  } else {
    res.status(401).json({ message: 'Not authenticated.' });
  }
});

module.exports = router;
