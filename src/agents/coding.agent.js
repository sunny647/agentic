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
- getFiles(paths): returns the latest content of multiple files from the repo. Pass a list of file paths as 'paths'.

Rules:
- For modifying existing files, ALWAYS call getFiles(paths) first, passing all needed file paths in a single call.
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

  // --- Agent execution ---
  const resp = await codeAgent.invoke({
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "text", text: user }],
      },
    ],
  });

  logger.info({ response: JSON.stringify(resp) }, 'Coding Agent response');

  // Normalize output
  let finalResponse = "";
  if (Array.isArray(resp?.messages)) {
    const last = resp.messages.findLast(m => m.role === "assistant");
    if (last?.content?.[0]?.text) {
      finalResponse = last.content[0].text.trim();
    } else if (typeof last?.content === "string") {
      finalResponse = last.content.trim();
    }
  } else {
    finalResponse = resp?.content || resp?.output || "";
  }

  let files = {};
  try {
    files = JSON.parse(finalResponse);
  } catch (err) {
    logger.error({ finalResponse }, "Failed to parse AI JSON output");
    files = { files: {} }; // fallback
  }

  logger.info({ files }, 'Parsed code changes');

  let commitFileList = [];
  for (const [path, change] of Object.entries(files.files || {})) {
    logger.info({ path, action: change.action }, `Processing ${path}`);
    if (change.action === 'delete') {
      commitFileList.push({ path, action: 'delete' });
    } else if (change.action === 'modify' || change.action === 'create') {
      commitFileList.push({
        path,
        action: change.action,
        content: change.content,
      });
    }
  }

  logger.info({ commitFileList }, 'Prepared commit file list');

  // --- GitHub automation ---
  if (!commitFileList || commitFileList.length === 0) {
    logger.warn('codingAgent: No code changes to commit, skipping commit and PR creation');
    validationNotes.push('No code changes detected, commit and PR steps skipped.');
    return {
      ...state,
      codePatches: files,
      commitFiles: [],
      prUrl: null,
      logs: [...(state.logs || []), 'coding:skipped:no_code_changes'],
      validationNotes,
    };
  }

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
