// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/decomposition.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { getContext } from '../context/context.manager.js';

export async function decompositionAgent(state) {
  logger.info({ enrichedStory: state.enrichedStory }, 'decompositionAgent called');
  logger.info({ state }, 'decompositionAgent full state');

  // Always pass the full state to getContext for robustness
  const ctx = await getContext('decomposition', state);

  const prompt = [
    {
      role: 'system',
      content:
        `You are a senior tech lead. Decompose the enriched story into clear technical subtasks for FE (Frontend) and BE (Backend).
        Respond ONLY with a strict JSON object in this format:
        {
          "feTasks": ["<FE task 1>", "<FE task 2>", ...],
          "beTasks": ["<BE task 1>", "<BE task 2>", ...],
          "sharedTasks": ["<Shared task 1>", ...],
          "risks": ["<Risk 1>", ...]
        }
        Do not include any markdown, explanation, or extra text. Only valid JSON. Use the following context (architecture docs, code references, acceptance criteria) to ensure correctness and alignment.`,
    },
    {
      role: 'user', content: JSON.stringify({
        story: state.enrichedStory || state.story,
        acceptanceCriteria: ctx.acceptanceCriteria,
        contextDocs: ctx.documents,
      }, null, 2)
    },
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  logger.info({ text }, 'decompositionAgent LLM response');

  // Try to parse LLM output as JSON first
  let feTasks = [];
  let beTasks = [];
  let sharedTasks = [];
  let risksTasks = [];
  let parsed = null;
  try {
    parsed = JSON.parse(text);
    feTasks = Array.isArray(parsed.feTasks) ? parsed.feTasks : [];
    beTasks = Array.isArray(parsed.beTasks) ? parsed.beTasks : [];
    sharedTasks = Array.isArray(parsed.sharedTasks) ? parsed.sharedTasks : [];
    risksTasks = Array.isArray(parsed.risks) ? parsed.risks : [];
  } catch (e) {
    // Fallback: extract from markdown if JSON parsing fails
    logger.warn({ text }, 'decompositionAgent LLM response is not valid JSON');
  }

  // If markdown fallback is needed, implement here (currently not used)
  const logs = Array.isArray(state.logs) ? state.logs : [];

  // Map tasks for coding agent
  const codingTasks = [
    ...feTasks.map((task) => ({ type: 'FE', task })),
    ...beTasks.map((task) => ({ type: 'BE', task })),
    ...sharedTasks.map((task) => ({ type: 'Shared', task })),
  ];
  logger.info({ codingTasks }, 'decompositionAgent mapped codingTasks');

  return {
    ...state,
    decomposition: {
      feTasks,
      beTasks,
      sharedTasks,
      risks: risksTasks,
      rawOutput: text // keep full text for supervisor validation
    },
    codingTasks,
    logs: [...logs, 'decomposition:done'],
  };
}