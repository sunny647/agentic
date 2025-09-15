// src/agents/decomposition.agent.js
import { smallModel } from '../llm/models.js';
// import { getContext } from '../context/context.manager.js';
import { jiraTools } from '../services/jiraTools.js';
import logger from '../logger.js';
import { getPrompt, DecompositionOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt and Schema


// IMPORTANT: Create a model instance configured for structured output
const structuredDecompositionModel =
  smallModel.withStructuredOutput(DecompositionOutputSchema, {
    name: "DecompositionOutput",
  }).bind({ temperature: 0 }); // Bind temperature to 0 for structured output

export async function decompositionAgent(state) {
  logger.info({ enrichedStory: state.enrichedStory }, 'decompositionAgent called');
  logger.info({ state }, 'decompositionAgent full state');

  // FIX: Call getContext inside the agent as it's async and returns relevant docs.
  // const ctx = await getContext('decomposition', state);
  // Ensure ctx.documents is part of state for the prompt manager if needed there, or pass it explicitly.
  // For now, prompt manager uses state.contextJson; if ctx.documents is needed, either add to state or pass to getPrompt
  // state.contextDocs = ctx.documents; // Temporarily add to state for prompt manager if needed


  // Use the prompt manager to get the messages
  // We need to pass state.contextDocs if prompt manager uses it, or rely on state.contextJson
  const messages = getPrompt('decompositionAgent', state);

  let decompositionResult;

  try {
    decompositionResult = await structuredDecompositionModel.invoke(messages);
    logger.info({ decompositionResult }, 'Decomposition agent structured output');
  } catch (error) {
    logger.error({ error, messages }, 'Decomposition model failed to produce structured JSON. Falling back to empty tasks.');
    decompositionResult = {
      feTasks: [],
      beTasks: [],
      sharedTasks: [],
      risks: [],
    };
  }

  const feTasks = decompositionResult.feTasks;
  const beTasks = decompositionResult.beTasks;
  const sharedTasks = decompositionResult.sharedTasks;
  const risksTasks = decompositionResult.risks;


  const logs = Array.isArray(state.logs) ? state.logs : [];

  const codingTasks = [
    ...feTasks.map((taskObj) => ({ type: 'FE', task: taskObj.task, solution: taskObj.solution })),
    ...beTasks.map((taskObj) => ({ type: 'BE', task: taskObj.task, solution: taskObj.solution })),
    ...sharedTasks.map((taskObj) => ({ type: 'Shared', task: taskObj.task, solution: taskObj.solution })),
  ];
  logger.info({ codingTasks }, 'decompositionAgent mapped codingTasks');

  if (codingTasks.length > 0) {
    const parentIssueId = state.issueID || '';
    const tasks = codingTasks.map(task => ({
      summary: `[${task.type}] ${task.task}`,
      description: `**Type:** ${task.type}\n\n**Task:** ${task.task}\n\n**Solution Approach:**\n${task.solution}`
    }));
    try {
      const jiraResult = await jiraTools.createSubTasks.execute({ parentIssueId, tasks });
      logger.info({ parentIssueId, tasks, jiraResult }, 'Jira sub-tasks created after codingTasks mapping');
    } catch (err) {
      logger.error({ parentIssueId, tasks, error: err.message }, 'Failed to create Jira sub-tasks after codingTasks mapping');
    }
  }

  return {
    ...state,
    decomposition: {
      feTasks,
      beTasks,
      sharedTasks,
      risks: risksTasks,
    },
    codingTasks,
    logs: [...logs, 'decomposition:done'],
    // Remove contextDocs if it was temporarily added
    contextDocs: undefined,
  };
}
