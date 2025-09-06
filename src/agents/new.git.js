// codingAgent.js
import { codeModel } from '../llm/models.js';
import logger from '../logger.js';
import { Octokit } from "@octokit/rest";
import { applyPatch } from 'diff'; // from 'diff' npm package

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function codingAgent(state) {
  logger.info({ state }, 'codingAgent called');

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
  let commitFiles = [];
  for (const [path, change] of Object.entries(files)) {
    try {
      if (change.action === "create") {
        commitFiles.push({ path, content: change.patch });
      } else if (change.action === "modify") {
        // Get current file from GitHub
        const { data: fileData } = await octokit.repos.getContent({
          owner: state.repoOwner,
          repo: state.repoName,
          path,
          ref: state.branchName || state.baseBranch, // current branch
        });

        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // Apply patch
        const updatedContent = applyPatch(currentContent, change.patch);
        if (!updatedContent) {
          validationNotes.push(`Patch failed to apply for ${path}`);
          continue;
        }

        commitFiles.push({ path, content: updatedContent });
      } else if (change.action === "delete") {
        // Represent deletes with empty content OR handle separately
        commitFiles.push({ path, content: "" });
      } else {
        validationNotes.push(`Invalid action for ${path}: ${change.action}`);
      }
    } catch (err) {
      validationNotes.push(`Error processing ${path}: ${err.message}`);
    }
  }

  logger.info({ commitFiles }, 'codingAgent prepared commit-ready files');

  return {
    ...state,
    codePatches: files,    // raw LLM patches
    commitFiles,           // full file contents for githubTools.commitFiles
    logs: [...(state.logs || []), 'coding:done'],
    validationNotes,
  };
}
