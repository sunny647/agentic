import { smallModel } from '../llm/models.js';

export async function estimationAgent(state) {
  const context = state.context || {};
  const acceptanceCriteria = Array.isArray(context.acceptanceCriteria) ? context.acceptanceCriteria : [];
  const prompt = [
    {
      role: 'system',
      content:
        'You are a senior engineering manager. Provide effort estimate with story points (0.5-13) and a confidence 0-1. Be concise. Consider complexity, unknowns, dependencies.'
    },
    {
      role: 'user',
      content: `Story: ${state.story}\nAcceptance Criteria: ${acceptanceCriteria.join('\n')}`,
    },
  ];
  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  const match = /points\s*:?\s*(\d+(?:\.\d+)?).*confidence\s*:?\s*(\d+(?:\.\d+)?)/is.exec(text) || [];
  const storyPoints = match[1] ? Number(match[1]) : 3;
  const confidence = match[2] ? Number(match[2]) : 0.6;
  const logs = Array.isArray(state.logs) ? state.logs : [];
  return {
    ...state,
    estimation: { storyPoints, confidence, notes: text },
    logs: [...logs, 'estimation:done'],
  };
}
