import { Router } from 'express';
import { runPipeline } from '../graph/pipeline.js';
import { v4 as uuid } from 'uuid';
import logger from '../logger.js';
import multer from 'multer';
import path from 'path';
import { queryDB } from '../db/postgressdb.js';

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed'));
    }
  }
});

const router = Router();

/**
 * POST /api/story/run
 * Accepts either JSON or multipart/form-data (for image upload)
 */
router.post('/run', upload.single('image'), async (req, res) => {
  try {
    logger.info({ body: req.body, file: req.file }, 'Received /run request with body and file');
    const requestId = uuid();
    let key, summary, description, imageMeta = null;
    // If multipart/form-data (image upload)
    if (req.file) {
      key = req.body.key;
      summary = req.body.summary;
      description = req.body.description;
      imageMeta = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
      // Store image metadata in DB
      await queryDB(
        'INSERT INTO story_images (issue_key, filename, originalname, mimetype, size, path, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [key, imageMeta.filename, imageMeta.originalname, imageMeta.mimetype, imageMeta.size, imageMeta.path]
      );
    } else {
      // JSON body
      if (!req.is('application/json')) {
        logger.warn('Request content-type is not application/json');
        return res.status(415).json({ error: 'Content-Type must be application/json or multipart/form-data' });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        logger.warn('Empty request body');
        return res.status(400).json({ error: 'Request body cannot be empty' });
      }
      const { issue } = req.body || {};
      if (issue && issue.fields) {
        key = issue.key;
        summary = issue.fields.summary;
        description = issue.fields.description;
      }
    }
    if (!key) {
      logger.warn('No issue key provided');
      return res.status(400).json({ error: 'issue key is required' });
    }
    // Compose story text
    let storyText = `${summary ? summary + ': ' : ''}${description || ''}`.trim();
    // Retrieve image metadata for this issue
    const images = await queryDB('SELECT id, filename, originalname, mimetype, size FROM story_images WHERE issue_key = $1', [key]);
    logger.info({ storyText, images }, 'Starting pipeline with story and images');
    let output;
    try {
      output = await runPipeline({ requestId, story: storyText, issueID: key, images });
    } catch (pipelineErr) {
      logger.error({ pipelineErr }, 'Pipeline execution error');
      return res.status(500).json({ error: pipelineErr.message, stack: pipelineErr.stack });
    }
    res.json({ requestId, output, images });
  } catch (err) {
    logger.error({ err }, 'Pipeline error');
    // Defensive: ensure error message is always a string
    const errorMessage = err && err.message ? err.message : 'Unknown server error';
    res.status(500).json({ error: errorMessage, stack: err && err.stack ? err.stack : undefined });
  }
});

// Endpoint to retrieve image by filename
router.get('/image/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(process.cwd(), 'uploads', filename);
  res.sendFile(filePath, err => {
    if (err) {
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

export default router;
