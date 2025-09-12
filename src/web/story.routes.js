import { Router } from 'express';
import { runPipeline } from '../graph/pipeline.js';
import { v4 as uuid } from 'uuid';
import logger from '../logger.js';
import { jiraTools, extractImageUrlsFromAdf, fetchImageAsBase64 } from '../services/jiraTools.js'; // Import new helpers
import { extractPlainTextFromAdf } from '../utils/adf-parser.js'; // Assuming you create this helper

const router = Router();

/**
 * POST /api/story/run
 * body: { story?: string, jiraKey?: string, jiraImages?: string[], descriptionAdf?: object }
 */
router.post('/run', async (req, res) => {
  try {
    console.log("Inside /run endpoint");
    console.log("Request body:", req.body);
    logger.info({ body: req.body }, 'Received /run request with body');
    const requestId = uuid();
    // Validate that the request body is JSON and not empty
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
    // If you want, fetch Jira here (left minimal to keep demo self-contained)
    if (!storyText && extractedJiraKey) {
      storyText = `Jira ${extractedJiraKey}: (Jira integration disabled in demo).`;
    }

    if (!storyText) {
      logger.warn('No story text or jiraKey provided');
      return res.status(400).json({ error: 'story or jiraKey required' });
    }

    let resolvedImages = jiraImages || [];
    let resolvedDescriptionAdf = descriptionAdf || null;
    console.log("Jira Images:", jiraImages);
    console.log("Extracted Description ADF:", descriptionAdf);
    // If we have a Jira key but no images or description ADF, try to fetch them
    if (issueID && !jiraImages && !descriptionAdf) {
      // If only issueID is provided, try to fetch fresh data
      const fetchedIssue = await jiraTools.getIssue.execute({ issueId: issueID });
      console.log("Fetched Issue:", fetchedIssue);
      if (fetchedIssue.error) {
        throw new Error(fetchedIssue.error);
      }
      resolvedDescriptionAdf = fetchedIssue.descriptionAdf;
      const extractedUrls = fetchedIssue.extractedImageUrls || [];

      // Fetch and convert images to Base64
      for (const url of extractedUrls) {
        const base64 = await fetchImageAsBase64(url, issueID);
        if (base64) {
          resolvedImages.push({ url, base64, filename: url.split('/').pop() });
        }
      }
    }

    console.log("Extracted Jira Key:", extractedJiraKey);
    console.log("Resolved Images:", resolvedImages);
    console.log("Resolved Description ADF:", resolvedDescriptionAdf);

    logger.info({ storyText }, 'Starting pipeline with story');
    let output;
    try {
      output = await runPipeline({ requestId, story: storyText, issueID: extractedJiraKey });
    } catch (pipelineErr) {
      logger.error({ pipelineErr }, 'Pipeline execution error');
      return res.status(500).json({ error: pipelineErr.message, stack: pipelineErr.stack });
    }
    res.json({ requestId, output });
  } catch (err) {
    logger.error({ err }, 'Pipeline error');
    // Defensive: ensure error message is always a string
    const errorMessage = err && err.message ? err.message : 'Unknown server error';
    res.status(500).json({ error: errorMessage, stack: err && err.stack ? err.stack : undefined });
  }
});

// Webhook endpoint for Jira
router.post('/webhook', async (req, res) => {
  try {
    logger.info({ body: req.body }, 'Received Jira webhook');
    if (!req.is('application/json')) {
      logger.warn('Webhook content-type is not application/json');
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      logger.warn('Empty webhook body');
      return res.status(400).json({ error: 'Webhook body cannot be empty' });
    }
    // Basic validation for Jira webhook payload
    const { issue } = req.body;
    if (!issue || !issue.fields) {
      logger.warn('Webhook missing issue or fields');
      return res.status(400).json({ error: 'Invalid webhook payload: missing issue/fields' });
    }
    const { summary, description } = issue.fields;
    const key = issue.key;
    const storyText = `${summary ? summary + ': ' : ''}${description || ''}`.trim();
    if (!storyText) {
      logger.warn('Webhook issue missing summary/description');
      return res.status(400).json({ error: 'Webhook issue missing summary/description' });
    }
    const requestId = uuid();
    let output;
    try {
      output = await runPipeline({ requestId, story: storyText, issueID: key });
    } catch (pipelineErr) {
      logger.error({ pipelineErr }, 'Pipeline execution error (webhook)');
      return res.status(500).json({ error: pipelineErr.message, stack: pipelineErr.stack });
    }
    res.json({ requestId, output });
  } catch (err) {
    logger.error({ err }, 'Webhook processing error');
    const errorMessage = err && err.message ? err.message : 'Unknown server error';
    res.status(500).json({ error: errorMessage, stack: err && err.stack ? err.stack : undefined });
  }
});

export default router;
