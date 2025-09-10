import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import path from 'path';
import { fileURLToPath } from 'url';
import './setupEnv.js';
import storyRouter from './web/story.routes.js';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// Serve static assets from public directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));

// Serve story_input.html from public directory
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/story_input.html'));
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/story', storyRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info({ port }, 'Server listening');
});
