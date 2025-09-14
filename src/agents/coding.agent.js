// src/agents/coding.agent.js
import { getCodeAgent } from '../llm/models.js';
import logger from '../logger.js';
import dotenv from 'dotenv';
import { z } from "zod";
import { jiraTools } from '../services/jiraTools.js';
import { getPrompt, CodingOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt and Schema


dotenv.config();

// IMPORTANT: Create a model instance configured for structured output
// Note: getCodeAgent returns a createReactAgent, which is not directly compatible with .withStructuredOutput.
// We'll revert this agent to manual JSON parsing with Zod validation of the string output.
const FileActionSchema = z.enum(["create", "modify", "delete"]).describe("The action to perform on the file.");
const FileChangeSchema = z.object({
  action: FileActionSchema,
  content: z.string().optional().describe("The full content of the file. Required for 'create' and 'modify' actions. Not applicable for 'delete'.")
}).describe("Details of a file change, including action and content.");

const CodingOutputSchema = z.object({
  files: z.record(z.string().describe("File path relative to the repository root (e.g., 'src/components/MyComponent.js')."), FileChangeSchema)
           .describe("An object where keys are file paths and values are objects describing the change.")
}).describe("A JSON object representing all proposed file changes.");


export async function codingAgent(state) {
  logger.info({ state }, 'codingAgent called');
  let validationNotes = [];

  const codeAgent = await getCodeAgent(); // This returns a createReactAgent

  const storyKey = state.storyKey || `task-${Date.now()}`;
  const branchName = `feature/${storyKey}-${Math.random().toString(36).substr(2, 5)}`;
  state.branchName = branchName;

  state.baseBranch = state.baseBranch || process.env.GIT_DEFAULT_BRANCH || 'main';
  state.repoOwner = state.repoOwner || process.env.GITHUB_REPO_OWNER;
  state.repoName = state.repoName || process.env.GITHUB_REPO_NAME;

  const decompositionTasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];

  if (!decompositionTasks || decompositionTasks.length === 0) {
    logger.warn('codingAgent: no decomposition tasks found, skipping code generation');
    return {
      ...state,
      logs: [...(state.logs || []), 'coding:skipped:no_tasks'],
    };
  }

  // Use the prompt manager to get the messages.
  // getPrompt for codingAgent will return the system prompt content as a string
  // and the user content as a complex array.
  const codingPromptMessages = getPrompt('codingAgent', state);

  let files; // Declare variable
  let rawAgentOutput = ""; // To store the raw output for error logging

  try {
    // Invoke the createReactAgent. Its response will be a string in the 'output' field.
    // The createReactAgent's prompt (from models.js) already contains the system prompt.
    // We only need to pass the user's part of the prompt.
    const agentResponse = await codeAgent.invoke({
      input: codingPromptMessages[1].content, // Pass the user content array as 'input'
      // The system prompt should already be configured within getCodeAgent's prompt
      // You might need to adjust getCodeAgent if you want to dynamically update system prompt per invocation.
    });

    logger.info({ agentResponse }, 'Coding Agent raw response');
    rawAgentOutput = agentResponse.output;

    // Clean up markdown fences and parse the JSON string
    let cleanedJsonString = rawAgentOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    
    // Attempt to parse and validate the JSON
    const parsedJson = JSON.parse(cleanedJsonString);
    files = CodingOutputSchema.parse(parsedJson); // Validate against Zod schema

    logger.info({ files }, 'Coding Agent structured output (parsed and validated)');

  } catch (error) {
    logger.error({ error, rawAgentOutput }, 'Coding agent failed to produce valid structured JSON or encountered an error. Falling back to no changes.');
    validationNotes.push(`Code generation failed: ${error.message || 'Unknown error'}. Manual code review required.`);
    files = { files: {} }; // Fallback to an empty files object
  }

  // --- Simplify commit file list preparation ---
  let commitFileList = [];
  for (const [path, change] of Object.entries(files.files || {})) {
    logger.info({ path, action: change.action }, `Processing file for commit: ${path}`);
    if (change.action === 'delete') {
      commitFileList.push({ path, action: 'delete' });
    } else if (change.action === 'modify' || change.action === 'create') {
      if (change.content === undefined || change.content === null) {
        logger.warn(`File ${path} has action '${change.action}' but no content provided. Skipping this file.`);
        validationNotes.push(`Warning: File ${path} for action '${change.action}' had no content. Skipping.`);
        continue;
      }
      commitFileList.push({ path, action: change.action, content: change.content });
    } else {
      logger.warn(`File ${path} has unknown action '${change.action}'. Skipping this file.`);
      validationNotes.push(`Warning: File ${path} had an unknown action '${change.action}'. Skipping.`);
    }
  }

  logger.info({ commitFileList }, 'Prepared commit file list');

  if (!commitFileList.length) {
    logger.warn('codingAgent: No valid code changes to commit, skipping commit and PR creation');
    validationNotes.push('No valid code changes detected, commit and PR steps skipped.');
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
      message: `feat(${storyKey}): Auto-generated code for ${state.issueID || 'story'}`,
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
      title: `feat(${storyKey}): Implement ${state.issueID || 'story'}`,
      body: `**Jira Story:** [${state.issueID || 'N/A'}](${process.env.JIRA_HOST}/browse/${state.issueID})\n\n**Description:**\n${state.enrichedStory || state.story || 'N/A'}\n\n**Decomposed Tasks Implemented:**\n${decompositionTasks.map(t => `- [${t.type}] ${t.task}`).join('\n')}\n\nThis PR was automatically generated by the Agentic Supervisor.`,
      head: branchName,
      base: state.baseBranch,
    });
    prUrl = pr.html_url;
    logger.info({ prUrl }, 'PR created');
    if (state.issueID) {
    try {
      logger.info({ issueId: state.issueID }, 'Adding prURL comment to Jira issue');
      await jiraTools.addComment.execute({
        issueId: state.issueID,
        comment: 'PR created: ' + prUrl,
      });
      logger.info({ issueId: state.issueID }, 'prURL comment added to Jira successfully');
    } catch (err) {
      logger.error({ err, jiraId: state.issueID }, 'Failed to add prURL comment to Jira issue');
    }
  }
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
