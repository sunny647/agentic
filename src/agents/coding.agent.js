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
  let validationNotes = [];

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

  const system = `You are a senior full-stack engineer.
You will be given a Jira story and must propose code changes.

You have access to a tool:
- getFiles(paths): returns the latest content of multiple files from the repo. Pass a list of file paths as 'paths'.

Rules:
- For modifying existing files, you can call getFiles(paths) first, passing all needed file paths in a single call.
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
- DO not make more than 5 tool calls to getFiles per request, you can request for multiple files in one call.
- Do not request directories (like "src/" or "src/web/"), only concrete file paths.
- If a file does not exist (response null), proceed without it instead of retrying.
- Stop requesting more files once you have enough context to generate changes.

Project context: ${JSON.stringify(state.contextJson)}
Project file metadata: ${JSON.stringify(state.projectFileMetadataJson)}
`;

  logger.info({ system }, 'codingAgent system prompt');

  const user = `Story: ${state.enrichedStory || state.story}\n\nTasks:\n- ${tasks.join('\n- ')}`;

  const resp = await codeAgent.invoke({
    messages: [
      { role: "system", content: [{ type: "text", text: system }] },
      { role: "user", content: [{ type: "text", text: user }] },
    ],
  });

  logger.info({ response: JSON.stringify(resp) }, 'Coding Agent response');

    // --- Normalize output ---
  logger.info({ resp }, "Raw AI response");
  let finalResponse = "";

  if (Array.isArray(resp?.messages)) {
    logger.info({ messages: resp.messages }, "AI response messages array detected");

    // Find the first message with a non-empty content property
    let foundContent = null;
    for (const m of resp.messages) {
      if (m && m.content && m.response_metadata && m.response_metadata.finish_reason === "stop" && ((typeof m.content === "string" && m.content.trim()) || (Array.isArray(m.content) && m.content.length) || (typeof m.content === "object" && m.content.text))) {
        foundContent = m.content;
        logger.info({ foundContent }, "Found message with non-empty content");
        break;
      }
    }

    if (foundContent) {
      if (typeof foundContent === "string" && foundContent.trim()) {
        finalResponse = foundContent.trim();
      } else if (Array.isArray(foundContent)) {
        finalResponse = foundContent.map(c => (typeof c === "string" ? c : c.text || "")).join("\n").trim();
      } else if (foundContent.text) {
        finalResponse = foundContent.text.trim();
      }
    }
  }

  logger.info({ finalResponse }, "Normalized AI response after messages array check");

  // Fallbacks
  if (!finalResponse && typeof resp?.content === "string") {
    finalResponse = resp.content.trim();
  } else if (!finalResponse && resp?.output) {
    finalResponse = resp.output.trim();
  }

  logger.info({ finalResponse }, "Normalized AI response");

  // --- Extract strict JSON ---
  let files = { files: {} };
  try {
    let candidate = finalResponse;
    logger.info({ candidate }, "Candidate response for JSON extraction");

    // Find the first {...} block
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in AI output");
    }

    let jsonString = match[0];

    // If it looks like escaped JSON, clean it once
    if (jsonString.includes('\"')) {
      logger.info("Escaped JSON detected, unescaping");
      jsonString = jsonString
        .replace(/\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\/g, '\\');
    }

    // Sanitize: replace literal newlines and carriage returns inside quoted values with \n
    jsonString = jsonString.replace(/("(?:[^"\\]|\\.)*")/g, (m) => m.replace(/\n/g, '\\n').replace(/\r/g, ''));

    const parsed = JSON.parse(jsonString);
    logger.info({ parsed }, "Parsed JSON object from AI output");

    files = parsed.files ? parsed : { files: parsed }; // ensure files key
  } catch (err) {
    logger.error({ finalResponse, err }, "Failed to parse AI JSON output");
  }


  logger.info({ files }, 'Parsed code changes');

  let commitFileList = [];
  for (const [path, change] of Object.entries(files.files || {})) {
    logger.info({ path, action: change.action }, `Processing ${path}`);
    if (change.action === 'delete') {
      commitFileList.push({ path, action: 'delete' });
    } else if (change.action === 'modify' || change.action === 'create') {
      commitFileList.push({ path, action: change.action, content: change.content });
    }
  }

  logger.info({ commitFileList }, 'Prepared commit file list');

  if (!commitFileList.length) {
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

  try {
    await createBranch({ owner: state.repoOwner, repo: state.repoName, newBranch: branchName, baseBranch: state.baseBranch });
    logger.info({ branchName }, 'Branch created');
  } catch (err) {
    validationNotes.push(`Branch creation failed: ${err.message}`);
    logger.error({ err }, 'Branch creation failed');
  }

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
