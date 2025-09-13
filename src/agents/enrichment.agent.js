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

  const systemPromptText ='You are a business analyst. Enrich the user story by clarifying scope, assumptions, and dependencies. ' +
        'Pay close attention to any provided images for UI requirements and visual context. Add the images in the in the enriched output.' +
        'Also expand the acceptance criteria into a detailed list that covers edge cases and risks. ' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`;

  // Construct the user message content array (for multimodal input)
  const userContentParts = [
    { type: 'text', text: state.story }, // The primary text of the story
  ];
  // Add images to the user's prompt if available
  if (state.jiraImages && state.jiraImages.length > 0) {
    userContentParts.push({
        type: 'text',
        text: '\n\n**Attached UI/Visual References:**\n' // Intro text for images
    });
    state.jiraImages.forEach((img, index) => {

      userContentParts.push({
        type: 'image_url',
        image_url: { url: img.base64 } // Use base64 data URI
      });
      userContentParts.push({
          type: 'text',
          text: `\n(Image ${index + 1}: [ImageName: ${img.filename}, ImageURL: ${img.url}])\n` // Label for each image
      });
    });
    userContentParts.push({
        type: 'text',
        text: '\nConsider these images carefully for detailed UI requirements and context when enriching the story and expanding acceptance criteria.'
    });
  }

  console.log('User content parts for enrichment:', userContentParts); // Debug log

  const messages = [
    { role: 'system', content: systemPromptText },
    { role: 'user', content: userContentParts }, // Pass the array of content parts
  ];

  let enriched = {};

  try {
    // Invoke the model with structured output
    enriched = await structuredEnrichmentModel.invoke(messages);
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
      await jiraTools.updateIssueFields.execute({ // We need a new tool for generic field updates
        issueId: state.issueID,
        fields: {"customfield_10075": [{ "value": "Done" }]},
      });
      logger.info({ issueId: state.issueID }, 'Jira story update initiated, including automation status.');

    } catch (err) {
      logger.error({ err, jiraId: state.issueID }, 'Jira story status update failed in enrichmentAgent');
    }
console.log('Enriched data before Jira update:', enriched.description); // Debug log
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

