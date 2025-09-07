// codingAgent.js
import { getCodeAgent } from '../llm/models.js';
import logger from '../logger.js';
import dotenv from 'dotenv';
// --- Tool functions ---
const { createBranch, commitFiles: githubCommitFiles, createPR } =
    (await import('../services/githubTools.js')).githubTools;

dotenv.config();

export async function codingAgent(state) {
  const codeAgent = await getCodeAgent();
  logger.info({ state }, 'codingAgent called');

  // --- Setup repo/branch info ---
  const storyKey = state.storyKey || `task-${Date.now()}`;
  const branchName = `feature/${storyKey}-${Math.random().toString(36).substr(2, 5)}`;
  state.branchName = branchName;

  state.baseBranch = state.baseBranch || process.env.GIT_DEFAULT_BRANCH || 'main';
  state.repoOwner = state.repoOwner || process.env.GITHUB_REPO_OWNER;
  state.repoName = state.repoName || process.env.GITHUB_REPO_NAME;

  const tasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];

  if (!state.codingTasks || state.codingTasks.length === 0) {
    logger.warn('codingAgent: no codingTasks found, skipping code generation');
    return {
      ...state,
      logs: [...(state.logs || []), 'coding:skipped:no_tasks'],
    };
  }

  // --- Prompt setup ---
  const system = `You are a senior full-stack engineer.
You will be given a Jira story and must propose code changes.

You have access to a tool:
- getFile(path): returns the latest content of a file from the repo.

Rules:
- For modifying an existing file, ALWAYS call getFile(path) first.
- When responding with changes, return the FULL file content, not diffs.
- Respond strictly in JSON:
  {
    "files": {
      "src/example.js": { "action": "modify", "content": "..." },
      "src/newFile.js": { "action": "create", "content": "..." },
      "src/oldFile.js": { "action": "delete" }
    }
  }
- Do not add explanations outside JSON.

Project context: ${JSON.stringify(state.contextJson)}
Project file metadata: ${JSON.stringify(state.projectFileMetadataJson)}
`;

  logger.info({ system }, 'codingAgent system prompt');

  const user = `Story: ${state.enrichedStory || state.story}\n\nTasks:\n- ${tasks.join('\n- ')}`;

  // Build prompt string for agent input
  const prompt = `${system}\n\n${user}`;

  // Use agent executor for tool calling
  const resp = await codeAgent.invoke({ input: prompt });
  let finalResponse = resp;

  // --- Parse final JSON ---
  let files = {};
  let validationNotes = [];
  try {
    files = JSON.parse(finalResponse.content);
  } catch (err) {
    validationNotes.push('Could not parse as JSON, capturing raw output');
    files = { 'IMPLEMENTATION_NOTES.md': { action: 'create', content: String(finalResponse.content) } };
  }

  let commitFileList = [];
  for (const [path, change] of Object.entries(files.files || {})) {
    logger.info({ path, action: change.action }, `Processing ${path}`);
    if (change.action === 'delete') {
      commitFileList.push({ path, delete: true });
    } else {
      commitFileList.push({ path, content: change.content });
    }
  }

  // --- GitHub automation ---
  // 1. Create branch
  try {
    await createBranch({
      owner: state.repoOwner,
      repo: state.repoName,
      newBranch: branchName,
      baseBranch: state.baseBranch,
    });
    logger.info({ branchName }, 'Branch created');
  } catch (err) {
    validationNotes.push(`Branch creation failed: ${err.message}`);
    logger.error({ err }, 'Branch creation failed');
  }

  // 2. Commit files
  try {
    await githubCommitFiles({
      owner: state.repoOwner,
      repo: state.repoName,
      branch: branchName,
      message: `Auto-generated code for ${state.storyKey || state.issueID || 'story'}`,
      files: commitFileList,
    });
    logger.info({ branchName }, 'Files committed');
  } catch (err) {
    validationNotes.push(`Commit failed: ${err.message}`);
    logger.error({ err }, 'Commit failed');
  }

  // 3. Create PR
  let prUrl = null;
  try {
    const pr = await createPR({
      owner: state.repoOwner,
      repo: state.repoName,
      title: `Auto PR for ${state.storyKey || state.issueID || 'story'}`,
      body: state.enrichedStory || state.story || '',
      head: branchName,
      base: state.baseBranch,
    });
    prUrl = pr.url;
    logger.info({ prUrl }, 'PR created');
  } catch (err) {
    validationNotes.push(`PR creation failed: ${err.message}`);
    logger.error({ err }, 'PR creation failed');
  }

  return {
    ...state,
    codePatches: files,
    commitFiles: commitFileList,
    prUrl,
    logs: [...(state.logs || []), 'coding:done'],
    validationNotes,
  };
}
