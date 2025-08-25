import { smallModel } from '../llm/models.js';
import logger from '../logger.js';

export async function estimationAgent(state) {
  logger.info({ decomposition: state.decomposition }, 'estimationAgent called');
  
  const context = state.context || {};
  // Robustly source acceptanceCriteria from state or context
  const acceptanceCriteria = Array.isArray(state.acceptanceCriteria)
    ? state.acceptanceCriteria
    : Array.isArray(context.acceptanceCriteria)
      ? context.acceptanceCriteria
      : [];

  const prompt = [
    {
      role: 'system',
      content:
        'You are a senior engineering manager. Provide an effort estimate with story points (0.5–13) and a confidence score (0–1). Be concise. Consider complexity, unknowns, dependencies. Output in JSON: {"storyPoints": number, "confidence": number, "notes": "short reasoning"}',
    },
    {
      role: 'user',
      content: `Story: ${state.story}\nAcceptance Criteria:\n${acceptanceCriteria.join(
        '\n'
      )}`,
    },
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  logger.info({ text }, 'estimationAgent LLM response');

  let estimation;
  try {
    estimation = JSON.parse(text);
  } catch {
    estimation = {
      storyPoints: 3,
      confidence: 0.6,
      notes: text || 'Default fallback estimation',
    };
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];
  // Map estimation for supervisor
  logger.info({ estimation }, 'estimationAgent mapped estimation');
  return {
    ...state,
    estimation,
    logs: [...logs, 'estimation:done'],
  };
}
