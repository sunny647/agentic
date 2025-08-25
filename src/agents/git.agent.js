// ─────────────────────────────────────────────────────────────
// File: src/agents/git.agent.js
// ─────────────────────────────────────────────────────────────
import { codeModel } from '../llm/models.js';
import logger from '../logger.js';

/**
 * Git Agent
 * - For each subtask from decomposition, generates code (diffs or file contents)
 * - Returns a mapping of subtask to generated code
 */
export async function gitAgent(state) {
  logger.info({ state }, 'gitAgent called');
  
  const decomposition = state.decomposition || {};
  const allTasks = [
    ...(decomposition.feTasks || []),
    ...(decomposition.beTasks || []),
    ...(decomposition.sharedTasks || [])
  ];

  if (!allTasks.length) {
    return {
      ...state,
      git: { files: {}, notes: 'No tasks to generate code for.' },
      logs: [...(state.logs || []), 'git:skipped:no_tasks']
    };
  }

  const system = `You are a senior engineer. For each subtask, generate production-quality code. Return a JSON object mapping subtask to code.`;

  const user = `Subtasks:\n- ${allTasks.join('\n- ')}`;

  const resp = await codeModel.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]);
  let files = {};
  let notes = '';
  logger.info({ content: resp.content }, 'gitAgent LLM response');
  try {
    files = JSON.parse(resp.content);
  } catch (err) {
    notes = 'Could not parse code output as JSON.';
    files = { 'IMPLEMENTATION_NOTES.md': String(resp.content) };
  }

  return {
    ...state,
    git: { files, notes },
    logs: [...(state.logs || []), 'git:done']
  };
}
