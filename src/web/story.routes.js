import { Router } from 'express';
import { runPipeline } from '../graph/pipeline.js';
import { v4 as uuid } from 'uuid';

const router = Router();

/**
 * POST /api/story/run
 * body: { story?: string, jiraKey?: string, context?: { repo, projectKey, acceptanceCriteria } }
 */
router.post('/run', async (req, res) => {
  try {
    console.log('Received /run request with body:', req.body);
    const requestId = uuid();
    // Log the incoming request body
    if (req.log) {
      req.log.info({ body: req.body }, 'Incoming /run request body');
    } else {
      console.log('Incoming /run request body:', req.body);
    }
    const { issue, story, jiraKey, context } = req.body || {};

    let storyText;
    let extractedJiraKey = jiraKey;
    // If issue object is present, extract summary, description, and key
    if (issue && issue.fields) {
      const { summary, description } = issue.fields;
      const key = issue.key;
      // Combine summary and description for storyText
      storyText = `${summary ? summary + ': ' : ''}${description || ''}`.trim();
      // Optionally, you can use key as jiraKey
      if (key) {
        extractedJiraKey = key;
      }
    } else {
      // Extract story description if story is an object with a description property
      storyText = typeof story === 'object' && story?.description ? story.description : story;
    }
    let acceptanceCriteria = context?.acceptanceCriteria || [];

    // If you want, fetch Jira here (left minimal to keep demo self-contained)
    if (!storyText && extractedJiraKey) {
      storyText = `Jira ${extractedJiraKey}: (Jira integration disabled in demo).`;
    }

    if (!storyText) return res.status(400).json({ error: 'story or jiraKey required' });

    console.log('Starting pipeline with story:', storyText);
    const output = await runPipeline({ requestId, story: storyText, context: context || {} });

    res.json({ requestId, output });
  } catch (err) {
    console.error('Pipeline error:', err); // Add this for more detail
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

export default router;
