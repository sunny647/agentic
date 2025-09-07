// codingAgent.js
import { codeModel } from '../llm/models.js';
import logger from '../logger.js';
import { Octokit } from "@octokit/rest";
import { applyPatch } from 'diff'; // from 'diff' npm package 
import dotenv from 'dotenv';
dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function codingAgent(state) {
  logger.info({ state }, 'codingAgent called');
  // inside codingAgent before calling Octokit APIs
const storyKey = state.storyKey || `task-${Date.now()}`;
const branchName = `feature/${storyKey}-${Math.random().toString(36).substr(2,5)}`;
state.branchName = branchName; // add branchName to state for later use

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
You will be given a Jira story, the repo structure, and relevant file contents.

Your output must be a JSON object where keys are file paths,
and values are objects with:
- "action": "create" | "modify" | "delete"
- "patch": unified diff for modify, full file content for create

Rules:
- Always generate syntactically valid patches.
- Prefer minimal changes rather than rewriting whole files.
- Do not include explanations, only JSON.
- If unsure about exact placement, include a clear comment in the patch.

Project context: ${JSON.stringify(state.contextJson)}
Project file metadata: ${JSON.stringify(state.projectFileMetadataJson)}
`;

  logger.info({ system }, 'codingAgent system prompt');

  const user = `Story: ${state.enrichedStory || state.story}\n\nTasks:\n- ${tasks.join('\n- ')}`;

  const resp = await codeModel.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const text = resp.content?.toString?.() || resp.content;
  logger.info({ text }, 'codingAgent LLM response');

  let files = {};
  let validationNotes = [];

  try {
    files = JSON.parse(text);
  } catch (err) {
    validationNotes.push(`Could not parse as JSON. Capturing raw output.`);
    files = { 'IMPLEMENTATION_NOTES.md': { action: "create", patch: String(text) } };
  }

  // === Convert patches into full file contents ===
  let commitFileList = [];
  for (const [path, change] of Object.entries(files)) {
    logger.info({ path, action: change.action }, `Processing file: ${path} with action: ${change.action}`);
    try {
      if (change.action === "create") {
        logger.info({ path }, `Creating new file: ${path}`);
        commitFileList.push({ path, content: change.patch });
      } else if (change.action === "modify") {
        logger.info({ path }, `Modifying file: ${path}`);
        // Get current file from GitHub
        const { data: fileData } = await octokit.repos.getContent({
          owner: state.repoOwner,
          repo: state.repoName,
          path,
          ref: state.baseBranch, // current branch
        });

        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        logger.info({ path }, `Fetched current content for: ${path}`);

        // Apply patch
        const updatedContent = applyPatch(currentContent, change.patch);
        if (!updatedContent) {
          validationNotes.push(`Patch failed to apply for ${path}`);
          logger.warn({ path }, `Patch failed to apply for: ${path}`);
          continue;
        }

        logger.info({ path }, `Patch applied successfully for: ${path}`);
        commitFileList.push({ path, content: updatedContent });
      } else if (change.action === "delete") {
        logger.info({ path }, `Deleting file: ${path}`);
        // Represent deletes with empty content OR handle separately
        commitFileList.push({ path, content: "" });
      } else {
        validationNotes.push(`Invalid action for ${path}: ${change.action}`);
        logger.warn({ path, action: change.action }, `Invalid action for: ${path}`);
      }
    } catch (err) {
      validationNotes.push(`Error processing ${path}: ${err.message}`);
      logger.error({ path, err }, `Error processing file: ${path}`);
    }
  }

  logger.info({ commitFileList }, 'codingAgent prepared commit-ready files');

  // --- GitHub automation ---
  // Import tools
  const { createBranch, commitFiles: githubCommitFiles, createPR } = (await import('../services/githubTools.js')).githubTools;

  // 1. Create branch
  logger.info({ branchName, baseBranch: state.baseBranch }, 'codingAgent: creating branch');
  try {
    await createBranch({
      owner: state.repoOwner,
      repo: state.repoName,
      newBranch: branchName,
      baseBranch: state.baseBranch
    });
    logger.info({ branchName }, 'codingAgent: branch created');
  } catch (err) {
    validationNotes.push(`Branch creation failed: ${err.message}`);
    logger.error({ err }, 'codingAgent: branch creation failed');
  }

  // 2. Commit files
  logger.info({ commitFileList, branchName }, 'codingAgent: committing files');
  try {
    await githubCommitFiles({
      owner: state.repoOwner,
      repo: state.repoName,
      branch: branchName,
      message: `Auto-generated code for ${state.storyKey || state.issueID || 'story'}`,
      files: commitFileList.map(f => ({ path: f.path, action: 'create', content: f.content }))
    });
    logger.info({ branchName }, 'codingAgent: files committed');
  } catch (err) {
    validationNotes.push(`Commit failed: ${err.message}`);
    logger.error({ err }, 'codingAgent: commit failed');
  }

  // 3. Create PR
  logger.info({ branchName, baseBranch: state.baseBranch }, 'codingAgent: creating PR');
  let prUrl = null;
  try {
    const pr = await createPR({
      owner: state.repoOwner,
      repo: state.repoName,
      title: `Auto PR for ${state.storyKey || state.issueID || 'story'}`,
      body: state.enrichedStory || state.story || '',
      head: branchName,
      base: state.baseBranch
    });
    prUrl = pr.url;
    logger.info({ prUrl }, 'codingAgent: PR created');
  } catch (err) {
    validationNotes.push(`PR creation failed: ${err.message}`);
    logger.error({ err }, 'codingAgent: PR creation failed');
  }

  return {
    ...state,
    codePatches: files,    // raw LLM patches
    commitFiles: commitFileList,           // full file contents for githubTools.commitFiles
    prUrl,                 // PR URL if created
    logs: [...(state.logs || []), 'coding:done'],
    validationNotes,
  };
}
