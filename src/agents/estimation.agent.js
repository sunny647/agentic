// src/agents/estimation.agent.js
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { z } from "zod";
import { jiraTools } from '../services/jiraTools.js';
import { getPrompt, EstimationOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt and Schema


// IMPORTANT: Create a model instance configured for structured output
const structuredEstimationModel =
  smallModel.withStructuredOutput(EstimationOutputSchema, {
    name: "EstimationOutput",
  }).bind({ temperature: 0 }); // Bind temperature to 0 for structured output

export async function estimationAgent(state) {
  logger.info({ state }, 'estimationAgent called');

  // Use the prompt manager to get the messages
  const messages = getPrompt('estimationAgent', state);

  let estimationResult;

  try {
    estimationResult = await structuredEstimationModel.invoke(messages);
    logger.info({ estimationResult }, 'Estimation agent structured output');
  } catch (error) {
    logger.error({ error, messages }, 'Estimation model failed to produce structured JSON. Falling back to default.');
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
    estimation: estimationResult,
    logs: [...logs, 'estimation:done'],
  };
  logger.info({ nextState }, 'estimationAgent returning state');
  return nextState;
}
