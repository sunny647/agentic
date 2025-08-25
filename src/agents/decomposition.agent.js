// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/decomposition.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import { getContext } from '../context/context.manager.js';

export async function decompositionAgent(state) {
  console.log('decompositionAgent called', state.enrichedStory);
  console.log('decompositionAgent full state:', JSON.stringify(state, null, 2));

  // Always pass the full state to getContext for robustness
  const ctx = await getContext('decomposition', state);

  const prompt = [
    {
      role: 'system',
      content:
        `You are a senior tech lead. Decompose the enriched story into clear technical subtasks FE (Frontend) and BE (Backend). 
        Use the following context (architecture docs, code references, acceptance criteria) 
        to ensure correctness and alignment.`,
    },
    { role: 'user', content: JSON.stringify({
        story: state.enrichedStory || state.story,
        acceptanceCriteria: ctx.acceptanceCriteria,
        contextDocs: ctx.documents,
      }, null, 2)},
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  console.log('decompositionAgent LLM response:', text);

  // Improved section extraction
  const sectionRegex = /(?:^|\n)\s*(FE|Frontend|BE|Backend|Shared|Risks)\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(FE|Frontend|BE|Backend|Shared|Risks)\s*[:\-]?|$)/gi;
  const sections = {};
  let match;
  while ((match = sectionRegex.exec(text))) {
    const key = match[1].toLowerCase();
    sections[key] = match[2].trim();
  }

  const fe = sections.fe || sections.frontend || '';
  const be = sections.be || sections.backend || '';
  const shared = sections.shared || '';
  const risks = sections.risks || '';

  const toList = (s) =>
    s.split(/\n|\r/)
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean);

  const logs = Array.isArray(state.logs) ? state.logs : [];

  // Map tasks for coding agent
  const codingTasks = [
    ...toList(fe).map((task) => ({ type: 'FE', task })),
    ...toList(be).map((task) => ({ type: 'BE', task })),
    ...toList(shared).map((task) => ({ type: 'Shared', task })),
  ];
  console.log('decompositionAgent mapped codingTasks:', codingTasks);

  return {
    ...state,
    decomposition: {
      feTasks: toList(fe),
      beTasks: toList(be),
      sharedTasks: toList(shared),
      risks: toList(risks),
      rawOutput: text // keep full text for supervisor validation
    },
    codingTasks,
    logs: [...logs, 'decomposition:done'],
  };
}
