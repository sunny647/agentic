// src/agents/enrichment.agent.js
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { jiraTools } from '../services/jiraTools.js';
import { getPrompt, EnrichmentOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt and Schema


// IMPORTANT: Create a model instance configured for structured output
const structuredEnrichmentModel =
  smallModel.withStructuredOutput(EnrichmentOutputSchema, {
    name: "EnrichmentOutput",
  }).bind({ temperature: 0 }); // Bind temperature to 0 for structured output

export async function enrichmentAgent(state) {
  logger.info({ state }, 'enrichmentAgent called');

  // Use the prompt manager to get the messages
  const messages = getPrompt('enrichmentAgent', state);

  let enriched;

  try {
    enriched = await structuredEnrichmentModel.invoke(messages);
    logger.info({ enriched }, 'Enriched story (structured output)');

  } catch (error) {
    logger.error({ error, messages }, 'Enrichment model failed to produce structured JSON. Falling back.');
    enriched = {
      description: state.story,
      acceptanceCriteria: [],
    };
  }

  logger.info({ jiraId: state.issueID }, 'Checking for Jira ID to update');
  if (state.issueID) {
    try {
      await jiraTools.updateIssueFields.execute({
        issueId: state.issueID,
        fields: {"customfield_10075": [{ "value": "Done" }]}, // Assuming this is your custom field ID
      });
      logger.info({ issueId: state.issueID }, 'Jira story automation status updated.');

      await jiraTools.updateStory.execute({
        issueId: state.issueID,
        description: enriched.description,
        acceptanceCriteria: enriched.acceptanceCriteria,
        jiraImages: state.jiraImages || [], // Pass images for attachment
      });
      logger.info({ issueId: state.issueID }, 'Jira story description/AC and attachments updated.');
    } catch (err) {
      logger.error({ err, jiraId: state.issueID }, 'Failed to update Jira issue in enrichmentAgent');
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
