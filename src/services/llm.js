// index.js
import OpenAI from "openai";
import { githubTools } from "./githubTools.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Convert githubTools into OpenAI tool schema
const tools = Object.values(githubTools).map(tool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
}));

async function runTask(task) {
  const response = await client.chat.completions.create({
    model: "gpt-4.1", // or gpt-4.1-mini for cheaper runs
    messages: [{ role: "user", content: task }],
    tools,
    tool_choice: "auto"
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (toolCall) {
    const tool = githubTools[toolCall.function.name];
    const args = JSON.parse(toolCall.function.arguments);
    const result = await tool.execute(args);

    console.log(`Tool used: ${tool.name}`);
    console.log(result);
  } else {
    console.log("LLM response:", response.choices[0].message.content);
  }
}

// Example
runTask("Create a branch called feature/telemetry and update the README with a new section about telemetry, then open a PR to main.");
