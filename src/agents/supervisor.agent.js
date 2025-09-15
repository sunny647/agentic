// src/agents/supervisor.agent.js
import OpenAI from "openai"; // Keep this if you're using raw OpenAI SDK here
import logger from '../logger.js';
import { getPrompt } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Keep this for raw OpenAI SDK use

/**
 * Supervisor Agent
 * - Reviews outputs from subagents (estimation, decomposition, coding, testing, git)
 * - Validates completeness, correctness, and consistency
 * - Decides which steps are missing or need revision
 */
export async function supervisorAgent(state) {
  logger.info({ state }, 'supervisorAgent called');

  const {
    estimation,
    decomposition,
    tests,
    commitFiles,
    prUrl,
    logs = [],
  } = state;

  // Use the prompt manager to get the messages for the supervisor
  const messages = getPrompt('supervisorAgent', state); // getPrompt will construct the review content

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini", // Use gpt-4o-mini for supervisor
    temperature: 0,
    messages: messages, // Pass the messages array from getPrompt
    response_format: { type: "json_object" }
  });
  const text = response.choices[0].message.content;
  logger.info({ text }, 'supervisorAgent LLM response');

  let supervisorDecision;
  try {
    supervisorDecision = JSON.parse(text);
  } catch (err) {
    logger.error({ err, text }, "Supervisor failed to parse LLM response to JSON.");
    supervisorDecision = {
      status: "error",
      missing: [],
      revisionNeeded: [],
      feedback: "Supervisor failed to parse LLM response"
    };
  }

  // --- LOG: Only log simplified status for supervisor ---
  const supervisorLog = `supervisor:status:${supervisorDecision.status}`;

  return {
    ...state,
    supervisorDecision,
    logs: [...logs, supervisorLog]
  };
}
