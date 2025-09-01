import { smallModel } from '../llm/models.js';
import logger from '../logger.js';

export async function estimationAgent(state) {
  logger.info({ state: state }, 'estimationAgent called');

  const context = state.context || {};
  // Robustly source acceptanceCriteria from state or context
  const acceptanceCriteria = Array.isArray(state.acceptanceCriteria)
    ? state.acceptanceCriteria
    : Array.isArray(context.acceptanceCriteria)
      ? context.acceptanceCriteria
      : [];

  const codingTasks = Array.isArray(state.codingTasks) ? state.codingTasks : [];
  const prompt = [
    {
      role: 'system',
      content:
        'You are a senior engineering manager. For each coding task, provide an effort estimate with story points (0.5–13) and a confidence score (0–1). Be concise. Consider complexity, unknowns, dependencies. Output in JSON: {"summedStoryPoints": number, "storyPointsbyTask": [{"storyPoints": number, "confidence": number, "notes": "short reasoning"}]} where storyPointsbyTask is an array with one object per coding task and summedStoryPoints is the total story points for the story.' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`
    },
    {
      role: 'user',
      content: `Story: ${state.enrichedStory || state.story}\nCoding Tasks:\n${codingTasks.map(task => `- [${task.type}] ${task.task}`).join('\n')}\nAcceptance Criteria:\n${acceptanceCriteria.join(
        '\n'
      )}`,
    },
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  logger.info({ text }, 'estimationAgent LLM response');

  let estimationRaw;
  let storyPointsbyTask = [];
  let summedStoryPoints = 0;
  try {
    estimationRaw = JSON.parse(text);
    // If the output is an array, treat as per-task estimates
    if (Array.isArray(estimationRaw)) {
      storyPointsbyTask = estimationRaw;
      summedStoryPoints = estimationRaw.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    } else if (Array.isArray(estimationRaw.tasks)) {
      storyPointsbyTask = estimationRaw.tasks;
      summedStoryPoints = estimationRaw.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    } else {
      // fallback: single estimate
      storyPointsbyTask = [estimationRaw];
      summedStoryPoints = estimationRaw.storyPoints || 0;
    }
  } catch {
    // fallback: single estimate
    storyPointsbyTask = [{
      storyPoints: 3,
      confidence: 0.6,
      notes: text || 'Default fallback estimation',
    }];
    summedStoryPoints = 3;
  }

  const estimation = {
    summedStoryPoints,
    storyPointsbyTask
  };

  const logs = Array.isArray(state.logs) ? state.logs : [];
  // Map estimation for supervisor
  logger.info({ estimation }, 'estimationAgent mapped estimation');
  return {
    ...state,
    estimation,
    logs: [...logs, 'estimation:done'],
  };
}
