// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/testing.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';

export async function testingAgent(state) {
  logger.info({ state }, 'testingAgent called');

  const prompt = [
    {
      role: 'system',
      content:
        'You are a QA lead. Generate detailed test scenarios and Gherkin test cases. ' +
        'Cover all identified risks and acceptance criteria. Format clearly with "Scenario:" and steps.' +
        `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`
    },
    {
      role: 'user',
      content: `Story: ${state.story}
  Acceptance Criteria: ${(state.acceptanceCriteria || []).join('\n')}
Risks: ${(state.decomposition?.risks || []).join('\n')}`,
    },
  ];

  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;
  logger.info({ text }, 'testingAgent LLM response');

  // Extract scenarios and steps
  const scenarios = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^Scenario:/i.test(l));

  const cases = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(Given|When|Then|And|But)\b/i.test(l));

  const logs = Array.isArray(state.logs) ? state.logs : [];
  
    // Map tests for supervisor
    logger.info({ raw: text, scenarios, cases }, 'testingAgent mapped tests');

  return {
    ...state,
    tests: { raw: text, scenarios, cases },
    logs: [...logs, 'testing:generated'],
  };
}
