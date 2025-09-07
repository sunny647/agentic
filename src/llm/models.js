import { ChatOpenAI } from '@langchain/openai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';

export const smallModel = new ChatOpenAI({
  model: process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini',
  temperature: 0.2,
});

export const reasoningModel = new ChatOpenAI({
  model: process.env.OPENAI_REASONING_MODEL || 'gpt-5.1-mini',
  temperature: 0.2,
});

export const codeModel = new ChatOpenAI({
  model: process.env.OPENAI_CODE_MODEL || 'gpt-5'
});

// Export a codeAgent that supports tool calling
import { getFileTool } from '../services/githubTools.js';
export async function getCodeAgent() {
  return await initializeAgentExecutorWithOptions([
    getFileTool
  ], codeModel, {
    agentType: "openai-functions",
    verbose: true
  });
}