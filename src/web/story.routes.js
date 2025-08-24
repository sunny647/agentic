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
    const requestId = uuid();
    const { story, jiraKey, context } = req.body || {};

    let storyText = story;
    let acceptanceCriteria = context?.acceptanceCriteria || [];

    // If you want, fetch Jira here (left minimal to keep demo self-contained)
    if (!storyText && jiraKey) {
      storyText = `Jira ${jiraKey}: (Jira integration disabled in demo).`;
    }

    if (!storyText) return res.status(400).json({ error: 'story or jiraKey required' });

    const output = await runPipeline({ requestId, story: storyText, context: context || {} });

    res.json({ requestId, output });
  } catch (err) {
    console.error('Pipeline error:', err); // Add this for more detail
    req.log.error({ err }, 'pipeline failed');
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

export default router;
