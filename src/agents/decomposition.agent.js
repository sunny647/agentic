// src/agents/decomposition.agent.js
import { smallModel } from '../llm/models.js';
import { getContext } from '../context/context.manager.js';
import { jiraTools } from '../services/jiraTools.js';
import logger from '../logger.js';
import { z } from "zod"; // Import Zod for schema definition

// Define the schema for the detailed task item
const DetailedTaskSchema = z.object({
  task: z.string().describe("Summary or title of the technical subtask."),
  solution: z.string().describe("Detailed solution approach, steps, or considerations for implementing this specific subtask."),
});

// Define the schema for the decomposition agent's output
const DecompositionOutputSchema = z.object({
  feTasks: z.array(DetailedTaskSchema).describe("List of Frontend technical subtasks, each with a detailed solution."),
  beTasks: z.array(DetailedTaskSchema).describe("List of Backend technical subtasks, each with a detailed solution."),
  sharedTasks: z.array(DetailedTaskSchema).describe("List of shared technical subtasks, each with a detailed solution."),
  risks: z.array(z.string()).describe("List of identified technical risks related to the story implementation."),
});

// IMPORTANT: Create a model instance configured for structured output
const structuredDecompositionModel =
  smallModel.withStructuredOutput(DecompositionOutputSchema, {
    name: "DecompositionOutput", // Optional: Name for clarity
  });

export async function decompositionAgent(state) {
  logger.info({ enrichedStory: state.enrichedStory }, 'decompositionAgent called');
  logger.info({ state }, 'decompositionAgent full state');

  // const ctx = await getContext('decomposition', state);

  // Prepare the user content for the LLM
  const userContent = JSON.stringify({
    contextDocs: state.contextJson,
    projectFileMetadataJson: state.projectFileMetadataJson // Assuming ctx.documents is already an array of strings or suitable for JSON.stringify
  }, null, 2);


  const systemPromptText =
    `You are a senior tech lead. Decompose the enriched user story into clear technical subtasks for Frontend (FE), Backend (BE), and Shared categories. For each subtask, provide a concise summary AND a detailed solution approach. Identify any potential technical risks.
    Pay close attention to any provided images for UI requirements and visual context. Add the images in the decomposition output.
    Your response MUST be a valid JSON object strictly conforming to the following schema:
    ${JSON.stringify(DecompositionOutputSchema.shape, null, 2)}
    Use the provided project context (architecture documents, code references, acceptance criteria) to ensure correctness, alignment, and comprehensive decomposition.`;

  const userContentParts = [
    { type: 'text', text: userContent },
    { type: 'text', text: `\nStory Requirements: ${JSON.stringify(state.enrichedStory || state.story)}` },
    { type: 'text', text: `\nAcceptance Criteria: ${JSON.stringify(state.acceptanceCriteria)}` }
  ];
  if (state.jiraImages && state.jiraImages.length > 0) {
    userContentParts.push({ type: 'text', text: '\n\n**Attached UI/Visual References:**\n' });
    state.jiraImages.forEach((img, index) => {
      userContentParts.push({ type: 'image_url', image_url: { url: img.base64 } });
      userContentParts.push({ type: 'text', text: `\n(Image ${index + 1}: [ImageName: ${img.filename}, ImageURL: ${img.url}])\n` });
    });
    userContentParts.push({ type: 'text', text: '\nConsider these images carefully for detailed UI requirements and context when decomposing the story.' });
  }

  const prompt = [
    { role: 'system', content: systemPromptText },
    { role: 'user', content: userContentParts }
  ];

  let decompositionResult; // Declare variable without initializer

  try {
    // Invoke the model with structured output
    decompositionResult = await structuredDecompositionModel.invoke(prompt);
    logger.info({ decompositionResult }, 'Decomposition agent structured output');
  } catch (error) {
    logger.error({ error }, 'Decomposition model failed to produce structured JSON. Falling back to empty tasks.');
    // Fallback in case the model *still* fails (e.g., API error, model internal failure)
    decompositionResult = {
      feTasks: [],
      beTasks: [],
      sharedTasks: [],
      risks: [],
    };
  }

  // Extract from the structured result
  const feTasks = decompositionResult.feTasks;
  const beTasks = decompositionResult.beTasks;
  const sharedTasks = decompositionResult.sharedTasks;
  const risksTasks = decompositionResult.risks;


  const logs = Array.isArray(state.logs) ? state.logs : [];

  // Map tasks for coding agent - now includes detailed solution
  const codingTasks = [
    ...feTasks.map((taskObj) => ({ type: 'FE', task: taskObj.task, solution: taskObj.solution })),
    ...beTasks.map((taskObj) => ({ type: 'BE', task: taskObj.task, solution: taskObj.solution })),
    ...sharedTasks.map((taskObj) => ({ type: 'Shared', task: taskObj.task, solution: taskObj.solution })),
  ];
  logger.info({ codingTasks }, 'decompositionAgent mapped codingTasks');

  // After codingTasks are mapped, call JiraTools.createSubTasks to create Jira sub-tasks
  if (codingTasks.length > 0) {
    logger.info({ stateIssueID: state.issueID }, 'DEBUG: state.issueID before parentIssueId assignment');
    const parentIssueId = state.issueID || '';
    logger.info({ parentIssueId }, 'DEBUG: parentIssueId before Jira sub-task creation');
    const tasks = codingTasks.map(task => ({
      summary: `[${task.type}] ${task.task}`, // Prefix summary with type for clarity in Jira
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
    codingTasks, // This now contains task summary and solution
    logs: [...logs, 'decomposition:done'],
  };
}