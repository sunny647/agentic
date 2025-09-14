// ─────────────────────────────────────────────────────────────────────────────
// File: src/agents/testing.agent.js
// ─────────────────────────────────────────────────────────────────────────────
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { jiraTools } from '../services/jiraTools.js'; // Import jiraTools


export async function testingAgent(state) {
  logger.info({ state }, 'testingAgent called');
  const userContentParts = [
    { type: 'text', text: state.enrichedStory || state.story },
    { type: 'text', text: `\nAcceptance Criteria: ${(state.acceptanceCriteria || []).join('\n')}` },
    { type: 'text', text: `\nRisks: ${(state.decomposition?.risks || []).join('\n')}` }
  ];
  if (state.jiraImages && state.jiraImages.length > 0) {
    userContentParts.push({ type: 'text', text: '\n\n**Attached UI/Visual References:**\n' });
    state.jiraImages.forEach((img, index) => {
      userContentParts.push({ type: 'image_url', image_url: { url: img.base64 } });
      userContentParts.push({ type: 'text', text: `\n(Image ${index + 1}: [ImageName: ${img.filename}, ImageURL: ${img.url}])\n` });
    });
    userContentParts.push({ type: 'text', text: '\nConsider these images carefully for detailed UI requirements and context when generating tests.' });
  }

  const prompt = [
    { role: 'system', content:
      'You are a QA lead. Generate detailed test scenarios and Gherkin test cases. ' +
      'Cover all identified risks and acceptance criteria. Format clearly with "Scenario:" and steps.' +
      `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`
    },
    { role: 'user', content: userContentParts }
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

  // Optionally create Jira test cases
  try {
    const jiraTestCaseSubtaskResults = await jiraTools.createSubTask.execute({
      parentIssueId: state.issueID,
      summary: `Test Cases`,
      description: cases.join('\n'),
    });

    const jiraSubtaskResults = await jiraTools.createSubTasks.execute({
      parentIssueId: state.issueID,
      tasks: scenarios.map((scenario) => ({
        summary: `Test scenario: ${scenario}`,
        description: `Automated test scenario generated from user story: ${state.story}`
      })),
    });

    logger.info({ jiraTestCaseSubtaskResults }, 'Jira sub-tasks created for test scenarios');
    logger.info({ jiraSubtaskResults }, 'Jira sub-tasks created for test scenarios');
  } catch (err) {
    logger.error({ err, issueId: state.issueID }, 'Failed to create Jira sub-tasks for test scenarios');
  }

  return {
    ...state,
    tests: { raw: text, scenarios, cases },
    logs: [...logs, 'testing:generated'],
  };
}
