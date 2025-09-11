// Export a codeAgent that supports tool calling
import { getFiles } from '../services/githubTools.js';
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";


export const smallModel = new ChatOpenAI({
  model: process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini',
  temperature: 0.2,
});

export const reasoningModel = new ChatOpenAI({
  model: process.env.OPENAI_REASONING_MODEL || 'gpt-5.1-mini',
  temperature: 0.2,
});

export const codeModel = new ChatOpenAI({
  model: process.env.OPENAI_CODE_MODEL || 'gpt-4.1'
});


export async function getCodeAgent() {
    // Use GPT-4.1 or fallback
    const model = new ChatOpenAI({
        model: "gpt-4.1",
        temperature: 0,
    });

    const agent = createReactAgent({
        llm: model,
        tools: [getFiles],
        prompt: `You are a coding assistant.
You can use the get_files tool to retrieve file content from GitHub for suggesting code changes to already existing files.
When responding with changes, return the FULL file content, not diffs. Respond strictly in JSON: { "files": { ... } }.`,
        verbose: true,
    });

    return agent;
}
