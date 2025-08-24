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

    if (!storyText) return res.status(400).json({ error: 'story or jiraKey required' });

    console.log('Starting pipeline with story:', storyText);
  const output = await runPipeline({ requestId, story: storyText });

    res.json({ requestId, output });
  } catch (err) {
    console.error('Pipeline error:', err); // Add this for more detail
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

export default router;
