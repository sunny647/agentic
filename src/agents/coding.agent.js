import { codeModel } from '../llm/models.js';

export async function codingAgent(state) {
  const tasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];

  if (!tasks.length) {
    return {
      ...state,
      code: null,
      logs: [...(state.logs || []), 'coding:skipped:no_tasks'],
    };
  }

  const system = `You are a senior full-stack engineer. 
  Generate minimal, production-quality code diffs. 
  Return a JSON object mapping file paths to contents (e.g. {"src/index.js": "..."}).
  Always ensure the code is:
  - syntactically valid
  - matches the described tasks
  - self-contained for copy-paste usage
  - includes comments where non-trivial
  `;

  const user = `Story: ${state.story}\n\nTasks:\n- ${tasks.join('\n- ')}`;

  const resp = await codeModel.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const text = resp.content?.toString?.() || resp.content;
  let files = {};
  let validationNotes = [];

  try {
    files = JSON.parse(text);
  } catch (err) {
    validationNotes.push(`Could not parse as JSON. Capturing as raw notes.`);
    files = { 'IMPLEMENTATION_NOTES.md': String(text) };
  }

  // Light self-check before handing to supervisor
  if (Object.keys(files).length === 0) {
    validationNotes.push('No files returned.');
  } else {
    for (const [path, content] of Object.entries(files)) {
      if (!content || content.trim().length === 0) {
        validationNotes.push(`Empty content in file: ${path}`);
      }
      if (path.endsWith('.js') && !content.includes('function') && !content.includes('import')) {
        validationNotes.push(`${path} may not include any JS/TS logic.`);
      }
    }
  }

  return {
    ...state,
    code: { files, validationNotes },
    logs: [...(state.logs || []), 'coding:done'],
  };
}
