import { smallModel } from '../llm/models.js';

export async function estimationAgent(state) {
  const context = state.context || {};
    const acceptanceCriteria = Array.isArray(state.acceptanceCriteria)
      ? state.acceptanceCriteria
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
  return {
    ...state,
    estimation,
    logs: [...logs, 'estimation:done'],
  };
}
