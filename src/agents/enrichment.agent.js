// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/enrichment.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
// import { jiraClient } from '../mcp/jira.client.js'; // wrapper for MCP Jira server

export async function enrichmentAgent(state) {
  logger.info({ state }, 'enrichmentAgent called');

  const prompt = [
    {
      role: 'system',
      content:
        'You are a business analyst. Enrich the user story by clarifying scope, assumptions, and dependencies. ' +
        'Also expand the acceptance criteria into a detailed list that covers edge cases and risks. ' +
        'Output JSON with { "description": "...", "acceptanceCriteria": ["...","..."] }' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`
    },
    {
      role: 'user',
      content: state.story,
    },
  ];

  const resp = await smallModel.invoke(prompt);
  let text = resp.content?.toString?.() || resp.content;
  // Remove markdown code block markers if present
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  logger.info({ text }, 'Raw enrichment model output');

  let enriched = {};
  try {
    enriched = JSON.parse(text);
  logger.info({ enriched }, 'Enriched story');
  } catch {
    enriched = {
      description: state.story,
      acceptanceCriteria: [],
      feedback: 'Parsing failed, using original story.',
    };
  }

  // Update Jira story (if id present)
  if (state.jiraId) {
    try {
  logger.info({ enriched }, 'Enriched Jira story');
      //   await jiraClient.updateStory(state.jiraId, {
      //     description: enriched.description,
      //     acceptanceCriteria: enriched.acceptanceCriteria,
      //   });
    } catch (err) {
  logger.error({ err }, 'Jira update failed');
    }
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];

  const nextState = {
    ...state,
    enrichedStory: enriched.description,
    context: {
      ...(state.context || {}),
      acceptanceCriteria: enriched.acceptanceCriteria,
    },
    logs: [...logs, 'enrichment:done'],
  };
  logger.info({ nextState }, 'enrichmentAgent returning state');
  return nextState;
}
