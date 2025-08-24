import { smallModel } from '../llm/models.js';

export async function testingAgent(state) {
  const prompt = [
    { role: 'system', content: 'You are a QA lead. Generate test scenarios and Gherkin test cases that cover risks and acceptance criteria.' },
    { role: 'user', content: `Story: ${state.story}\nRisks: ${(state.decomposition?.risks||[]).join('\n')}` },
  ];
  const resp = await smallModel.invoke(prompt);
  const text = resp.content?.toString?.() || resp.content;

  const scenarios = text.split('\n').filter((l) => /^Scenario:/i.test(l.trim()));
  const cases = text.split('\n').filter((l) => /^(Given|When|Then|And|But)\b/i.test(l.trim()));

  const logs = Array.isArray(state.logs) ? state.logs : [];
  return { ...state, tests: { scenarios, cases }, logs: [...logs, 'testing:done'] };
}
