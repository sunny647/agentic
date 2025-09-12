// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/enrichment.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { z } from "zod"; // For schema definition
import { jiraTools } from '../services/jiraTools.js';

// Define the schema for the enrichment agent's output
const EnrichmentOutputSchema = z.object({
  description: z.string().describe("The enriched user story description, clarifying scope, assumptions, and dependencies."),
  acceptanceCriteria: z.array(z.string()).describe("A detailed list of acceptance criteria, expanded to cover edge cases and risks."),
});

// IMPORTANT: Create a model instance configured for structured output
// Ensure smallModel is actually an instance of ChatOpenAI or similar
const structuredEnrichmentModel =
  smallModel.withStructuredOutput(EnrichmentOutputSchema, {
    name: "EnrichmentOutput",
  });

export async function enrichmentAgent(state) {
  logger.info({ state }, 'enrichmentAgent called');

  const prompt = [
    {
      role: 'system',
      content:
        'You are a business analyst. Enrich the user story by clarifying scope, assumptions, and dependencies. ' +
        'Also expand the acceptance criteria into a detailed list that covers edge cases and risks. ' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`
    },
    {
      role: 'user',
      content: state.story,
    },
  ];

  let enriched = {};

  try {
    // Invoke the model with structured output
    enriched = await structuredEnrichmentModel.invoke(prompt);
    logger.info({ enriched }, 'Enriched story (structured output)');

  } catch (error) {
    logger.error({ error }, 'Enrichment model failed to produce structured JSON. Falling back.');
    // Fallback in case the model *still* fails (e.g., if the model doesn't support response_format or hits an internal error)
    enriched = {
      description: state.story,
      acceptanceCriteria: [],
      // feedback: 'LLM failed to produce valid structured JSON. Using original story.', // If you add feedback to schema
    };
  }

  // Update Jira story (if id present)
  logger.info({ jiraId: state.issueID }, 'Checking for Jira ID to update');
  if (state.issueID) {
    try {
      // IMPORTANT: Add the custom field update here
      const CUSTOM_FIELD_ID_PROCESSED = "customfield_10075";

      updateFields[CUSTOM_FIELD_ID_PROCESSED] = [{ "value": "Done" }]; // For a single-line text field
      // If it's a "Short text field", use updateFields[CUSTOM_FIELD_ID_PROCESSED] = "Processed by SprintPilot";
      // If it's a checkbox, use updateFields[CUSTOM_FIELD_ID_PROCESSED] = true;
      console.log("Update fields:", updateFields);

      await jiraTools.updateIssueFields.execute({ // We need a new tool for generic field updates
        issueId: state.issueID,
        fields: updateFields,
      });
      logger.info({ issueId: state.issueID }, 'Jira story update initiated, including automation status.');

    } catch (err) {
      logger.error({ err, jiraId: state.issueID }, 'Jira story status update failed in enrichmentAgent');
    }

    try {
      logger.info({ enriched }, 'Enriched Jira story');
      await jiraTools.updateStory.execute({ // Call the execute method of the tool
        issueId: state.issueID,
        description: enriched.description,
        acceptanceCriteria: enriched.acceptanceCriteria,
      });
    } catch (err) {
      logger.error({ err }, 'Jira update failed');
    }
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];

  const nextState = {
    ...state,
    enrichedStory: enriched.description,
    acceptanceCriteria: enriched.acceptanceCriteria,
    logs: [...logs, 'enrichment:done'],
  };
  logger.info({ nextState }, 'enrichmentAgent returning state');
  return nextState;
}

