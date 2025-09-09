// src/agents/estimation.agent.js
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { z } from "zod";
import { jiraTools } from '../services/jiraTools.js'; // Ensure this is imported

// Define the schema for the estimation agent's output
const EstimationOutputSchema = z.object({
  approach: z.string().describe("A detailed solution approach outlining how the story will be implemented."),
  LOE: z.object({
    FE: z.string().describe("Level of Effort for Frontend tasks (e.g., '3 Story Points', 'Medium', '8h')."),
    BE: z.string().describe("Level of Effort for Backend tasks (e.g., '5 Story Points', 'Large', '16h')."),
    QA: z.string().describe("Level of Effort for Quality Assurance/Testing (e.g., '2 Story Points', 'Small', '4h')."),
    Review: z.string().describe("Level of Effort for Code Review/Pull Request Review (e.g., '1 Story Point', 'Very Small', '2h')."),
  }).describe("Level of Effort breakdown by domain."),
});

// IMPORTANT: Create a model instance configured for structured output
const structuredEstimationModel =
  smallModel.withStructuredOutput(EstimationOutputSchema, {
    name: "EstimationOutput",
  });

export async function estimationAgent(state) {
  logger.info({ state }, 'estimationAgent called');

  const codingTasksSummary = (state.codingTasks || []).map(task => `${task.type}: ${task.task}`).join('\n- ');
  const acceptanceCriteriaList = (state.acceptanceCriteria || []).join('\n- ');

  const prompt = [
    {
      role: 'system',
      content:
        'You are a senior engineering manager. Your task is to provide a detailed solution approach and ' +
        'a Level of Effort (LOE) breakdown for the given user story. ' +
        'The LOE should be provided for Frontend (FE), Backend (BE), Quality Assurance (QA), and Code Review (Review). ' +
        'Use units for LOE as hrs but ensure consistency for a single story.' +
        'Provide a concise but detailed approach for implementation.' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}` +
        `\n\nUser Story: ${state.enrichedStory}` +
        (acceptanceCriteriaList ? `\n\nAcceptance Criteria:\n- ${acceptanceCriteriaList}` : '') +
        (codingTasksSummary ? `\n\nIdentified Coding Tasks:\n- ${codingTasksSummary}` : '')
    },
    {
      role: 'user',
      content: 'Generate the solution approach and LOE breakdown.',
    },
  ];

  let estimationResult; // No initializer needed here as it's assigned in try/catch

  try {
    estimationResult = await structuredEstimationModel.invoke(prompt);
    logger.info({ estimationResult }, 'Estimation agent structured output');
  } catch (error) {
    logger.error({ error }, 'Estimation model failed to produce structured JSON. Falling back to default.');
    // Fallback in case the model *still* fails
    estimationResult = {
      approach: "Failed to generate detailed approach. Manual review needed.",
      LOE: { FE: "N/A", BE: "N/A", QA: "N/A", Review: "N/A" },
    };
  }

  // Format the output for a Jira comment
  const commentContent = `
**Estimation and Solution Approach:**

**Approach:**
${estimationResult.approach}

**Level of Effort (LOE):**
- **Frontend (FE):** ${estimationResult.LOE.FE}
- **Backend (BE):** ${estimationResult.LOE.BE}
- **Quality Assurance (QA):** ${estimationResult.LOE.QA}
- **Code Review (Review):** ${estimationResult.LOE.Review}
`;

  // Add the estimation as a comment to the Jira story
  logger.info({ jiraId: state.issueID }, 'Checking for Jira ID to add estimation comment');
  if (state.issueID) {
    try {
      logger.info({ issueId: state.issueID }, 'Adding estimation comment to Jira issue');
      await jiraTools.addComment.execute({
        issueId: state.issueID,
        comment: commentContent,
      });
      logger.info({ issueId: state.issueID }, 'Estimation comment added to Jira successfully');
    } catch (err) {
      logger.error({ err, jiraId: state.issueID }, 'Failed to add estimation comment to Jira issue');
    }
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];

  const nextState = {
    ...state,
    estimation: estimationResult, // Store the structured estimation directly
    logs: [...logs, 'estimation:done'],
  };
  logger.info({ nextState }, 'estimationAgent returning state');
  return nextState;
}