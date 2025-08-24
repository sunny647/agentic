import { smallModel } from '../llm/models.js';

export async function decompositionAgent(state) {
  const prompt = [
    { role: 'system', content: 'You are a tech lead. Split work into FE, BE, and Shared technical tasks. Return bullet lists.' },
    { role: 'user', content: `Story: ${state.story}` },
  ];
  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  const fe = /FE(?:-|:)?([\s\S]*?)BE/i.exec(text)?.[1] || '';
  const be = /BE(?:-|:)?([\s\S]*?)(Shared|Risks|$)/i.exec(text)?.[1] || '';
  const shared = /Shared(?:-|:)?([\s\S]*?)(Risks|$)/i.exec(text)?.[1] || '';
  const risks = /Risks(?:-|:)?([\s\S]*)/i.exec(text)?.[1] || '';

  const toList = (s) => s.split(/\n|\r/).map((l) => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean);

  const logs = Array.isArray(state.logs) ? state.logs : [];
  return {
    ...state,
    decomposition: {
      feTasks: toList(fe),
      beTasks: toList(be),
      sharedTasks: toList(shared),
      risks: toList(risks),
    },
    logs: [...logs, 'decomposition:done'],
  };
}
