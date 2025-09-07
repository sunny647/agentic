// server.js
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const storyRoutes = require('./web/story.routes');
const authRoutes = require('./web/auth.routes');

const app = express();

app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/story', storyRoutes);
app.use('/api/auth', authRoutes);

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Serve main app (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/story_input.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`SprintPilot server running on port ${PORT}`);
});
