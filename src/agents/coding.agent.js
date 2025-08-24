import { codeModel } from '../llm/models.js';

export async function codingAgent(state) {
  const tasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];

  const system = `You are a senior full-stack engineer. Generate minimal, production-quality code diffs. \nReturn a JSON object mapping file paths to contents. Use JS/TS for Node + React when relevant.`;

  const user = `Story: ${state.story}\nTasks:\n- ${tasks.join('\n- ')}`;

  const resp = await codeModel.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const text = resp.content?.toString?.() || resp.content;
  let files = {};
  try {
    files = JSON.parse(text);
  } catch {
    files = { 'IMPLEMENTATION_NOTES.md': String(text) };
  }

    const logs = Array.isArray(state.logs) ? state.logs : [];
  return {
    ...state,
    code: { files, instructions: ['Review and adjust file paths as needed.'] },
      logs: [...logs, 'coding:done'],
  };
}
