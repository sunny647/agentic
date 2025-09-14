import { Router } from 'express';
import { runPipeline } from '../graph/pipeline.js';
import { v4 as uuid } from 'uuid';
import logger from '../logger.js';
import { queryDB } from '../db/postgressdb.js';

const router = Router();

/**
 * POST /api/story/submit
 * body: { issue: { key, fields: { summary, description } } }
 * Returns: { message, id } or { error }
 */
router.post('/submit', async (req, res) => {
  logger.info({ body: req.body }, 'Received /submit request');
  if (!req.is('application/json')) {
    logger.warn('Request content-type is not application/json');
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  const { issue } = req.body || {};
  if (!issue || !issue.key || !issue.fields || !issue.fields.summary || !issue.fields.description) {
    logger.warn('Missing required fields in /submit');
    return res.status(400).json({ error: 'Missing required fields: key, summary, description' });
  }
  // Validate Jira key format
  if (!/^([A-Z][A-Z0-9]+)-\d+$/.test(issue.key)) {
    logger.warn('Invalid Jira key format');
    return res.status(400).json({ error: 'Issue Key must be in format PROJECT-123' });
  }
  try {
    // Insert into DB (stories table)
    const insertQuery = `INSERT INTO stories (key, summary, description, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id`;
    const rows = await queryDB(insertQuery, [issue.key, issue.fields.summary, issue.fields.description]);
    logger.info({ key: issue.key }, 'Story inserted into DB');
    return res.json({ message: 'Story submitted successfully!', id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, 'DB insert error');
    return res.status(500).json({ error: 'Failed to save story to database.' });
  }
});

/**
 * POST /api/story/run
 * body: { story?: string, jiraKey?: string, jiraImages?: string[], descriptionAdf?: object }
 */
router.post('/run', async (req, res) => {
  try {
    logger.info({ body: req.body }, 'Received /run request with body');
    const requestId = uuid();
    if (!req.is('application/json')) {
      logger.warn('Request content-type is not application/json');
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      logger.warn('Empty request body');
      return res.status(400).json({ error: 'Request body cannot be empty' });
    }
    const { issue, story, jiraKey, jiraImages, descriptionAdf } = req.body || {};
    let storyText;
    let extractedJiraKey = jiraKey;
    if (issue && issue.fields) {
      const { summary, description } = issue.fields;
      const key = issue.key;
      storyText = `${summary ? summary + ': ' : ''}${description || ''}`.trim();
      if (key) {
        extractedJiraKey = key;
      }
    } else {
      storyText = typeof story === 'object' && story?.description ? story.description : story;
    }
    if (!storyText && extractedJiraKey) {
      storyText = `Jira ${extractedJiraKey}: (Jira integration disabled in demo).`;
    }
    if (!storyText) {
      logger.warn('No story text or jiraKey provided');
      return res.status(400).json({ error: 'story or jiraKey required' });
    }
    let resolvedImages = jiraImages || [];
    let resolvedDescriptionAdf = descriptionAdf || null;
    // (Jira image/ADF fetch logic omitted for brevity)
    logger.info({ storyText }, 'Starting pipeline with story');
    let output;
    try {
      output = await runPipeline({ requestId, story: storyText, issueID: extractedJiraKey, jiraImages: resolvedImages });
    } catch (pipelineErr) {
      logger.error({ pipelineErr }, 'Pipeline execution error');
      return res.status(500).json({ error: pipelineErr.message, stack: pipelineErr.stack });
    }
    res.json({ requestId, output });
  } catch (err) {
    logger.error({ err }, 'Pipeline error');
    const errorMessage = err && err.message ? err.message : 'Unknown server error';
    res.status(500).json({ error: errorMessage, stack: err && err.stack ? err.stack : undefined });
  }
});

export default router;
