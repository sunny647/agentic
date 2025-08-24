// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/testing.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';

export async function testingAgent(state) {
  const prompt = [
    {
      role: 'system',
      content:
        'You are a QA lead. Generate detailed test scenarios and Gherkin test cases. ' +
        'Cover all identified risks and acceptance criteria. Format clearly with "Scenario:" and steps.'
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

  return {
    ...state,
    tests: { raw: text, scenarios, cases },
    logs: [...logs, 'testing:generated'],
  };
}
