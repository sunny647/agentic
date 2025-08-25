import { smallModel } from '../llm/models.js';

export async function estimationAgent(state) {
  console.log('estimationAgent called', state.decomposition);
  
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
  console.log('estimationAgent LLM response:', text);

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
  console.log('estimationAgent mapped estimation:', estimation);
  return {
    ...state,
    estimation,
    logs: [...logs, 'estimation:done'],
  };
}
