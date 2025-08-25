// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/supervisor.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import OpenAI from "openai";
import logger from '../logger.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    code,
    tests,
    git,
    logs = [],
  } = state;

  const reviewPrompt = `
You are the Supervisor Agent.
Your role is to REVIEW outputs from sub-agents and validate them.

### Instructions:
1. Check decomposition → Are FE, BE, Shared, and Risks sections present, non-empty, and relevant?
2. Check estimation → Is there at least a numeric effort or time breakdown?
3. Check code → Is it aligned with decomposition tasks?
4. Check tests → Do they cover acceptance criteria?
5. Check git → Is there a branch/commit info?

IMPORTANT: Return your response as a JSON object.

Story context:
${JSON.stringify(state.story, null, 2)}

Outputs so far:
- Estimation: ${estimation ? JSON.stringify(estimation) : "Missing"}
- Decomposition: ${decomposition ? JSON.stringify(decomposition) : "Missing"}
- Code: ${code ? JSON.stringify(code) : "Missing"}
- Tests: ${tests ? JSON.stringify(tests) : "Missing"}
- Git: ${git ? JSON.stringify(git) : "Missing"}

Return JSON in this exact structure:
{
  "status": "ok" | "needs_revision",
  "missing": [ "estimation" | "decomposition" | "code" | "tests" | "git" ],
  "revisionNeeded": [ "estimation" | "decomposition" | "code" | "tests" | "git" ],
  "feedback": "Detailed supervisor review notes"
}
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [{ role: "system", content: reviewPrompt }],
    response_format: { type: "json_object" }
  });
  const text = response.choices[0].message.content;
  logger.info({ text }, 'supervisorAgent LLM response');

  let supervisorDecision;
  try {
    supervisorDecision = JSON.parse(text);
  } catch (err) {
    supervisorDecision = {
      status: "error",
      missing: [],
      revisionNeeded: [],
      feedback: "Supervisor failed to parse LLM response"
    };
  }

  return {
    ...state,
    supervisorDecision,
    logs: [...logs, `supervisor:review:${JSON.stringify(supervisorDecision)}`]
  };
}
