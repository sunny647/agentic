// server.js
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const pinoHttp = require('pino-http');
const { logger } = require('./logger');
const storyRoutes = require('./web/story.routes');
const authRoutes = require('./web/auth.routes');
require('./web/passport.config');

const app = express();

app.use(express.json());
app.use(pinoHttp({ logger }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'sprintpilot_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/story', storyRoutes);
app.use('/api/auth', authRoutes);

app.use(express.static(path.join(__dirname, '../public')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, '../public/story_input.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`SprintPilot server running on port ${PORT}`);
});
