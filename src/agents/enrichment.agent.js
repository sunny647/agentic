// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/enrichment.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
// import { jiraClient } from '../mcp/jira.client.js'; // wrapper for MCP Jira server

export async function enrichmentAgent(state) {
  const prompt = [
    {
      role: 'system',
      content:
        'You are a business analyst. Enrich the user story by clarifying scope, assumptions, and dependencies. ' +
        'Also expand the acceptance criteria into a detailed list that covers edge cases and risks. ' +
        'Output JSON with { "description": "...", "acceptanceCriteria": ["...","..."] }'
    },
    {
      role: 'user',
      content: state.story,
    },
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;

  let enriched = {};
  try {
    enriched = JSON.parse(text);
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
      console.log(`Enriched Jira story ${JSON.stringify(enriched)}...`);
      //   await jiraClient.updateStory(state.jiraId, {
      //     description: enriched.description,
      //     acceptanceCriteria: enriched.acceptanceCriteria,
      //   });
    } catch (err) {
      console.error(`Jira update failed: ${err.message}`);
    }
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];

  return {
    ...state,
    enrichedStory: enriched.description,
    context: {
      ...(state.context || {}),
      acceptanceCriteria: enriched.acceptanceCriteria,
    },
    logs: [...logs, 'enrichment:done'],
  };
}
