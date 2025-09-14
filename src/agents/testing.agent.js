// src/agents/testing.agent.js
import { smallModel } from '../llm/models.js';
import logger from '../logger.js';
import { z } from "zod";
import { jiraTools } from '../services/jiraTools.js';
import { getPrompt, TestingOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import getPrompt and Schema


// IMPORTANT: Create a model instance configured for structured output
const structuredTestingModel =
  smallModel.withStructuredOutput(TestingOutputSchema, {
    name: "TestingOutput",
  }).bind({ temperature: 0 }); // Bind temperature to 0 for structured output


export async function testingAgent(state) {
  logger.info({ state }, 'testingAgent called');

  // Use the prompt manager to get the messages
  const messages = getPrompt('testingAgent', state);

  let testingResult;

  try {
    testingResult = await structuredTestingModel.invoke(messages);
    logger.info({ testingResult }, 'Testing agent structured output');
  } catch (error) {
    logger.error({ error, messages }, 'Testing model failed to produce structured JSON. Falling back to empty tests.');
    testingResult = {
      testScenarios: [],
      risksCovered: [],
      notes: "Failed to generate structured test scenarios."
    };
  }

  // --- Create Jira Sub-tasks for each test scenario ---
  if (state.issueID && testingResult.testScenarios && testingResult.testScenarios.length > 0) {
    logger.info({ jiraId: state.issueID, numScenarios: testingResult.testScenarios.length }, 'Creating Jira sub-tasks for test scenarios');
    const subtasksToCreate = testingResult.testScenarios.map(scenario => {
      const summary = `Test Scenario: ${scenario.scenarioTitle}`;
      const description = `**Scenario:** ${scenario.scenarioTitle}\n\n**Gherkin Steps:**\n${scenario.gherkinSteps.map(step => `    ${step}`).join('\n')}\n\n` +
                          (testingResult.risksCovered && testingResult.risksCovered.length > 0 ? `**Risks Covered:**\n${testingResult.risksCovered.map(risk => `- ${risk}`).join('\n')}\n\n` : '') +
                          (testingResult.notes ? `**Notes:**\n${testingResult.notes}` : '');
      return { summary, description };
    });

    try {
      const jiraSubtaskResults = await jiraTools.createSubTasks.execute({
        parentIssueId: state.issueID,
        tasks: subtasksToCreate,
      });
      logger.info({ jiraSubtaskResults }, 'Jira sub-tasks created for test scenarios');
    } catch (err) {
      logger.error({ err, issueId: state.issueID }, 'Failed to create Jira sub-tasks for test scenarios');
    }
  } else if (state.issueID) {
    logger.warn({ jiraId: state.issueID }, 'No test scenarios generated to create Jira sub-tasks.');
  }

  const logs = Array.isArray(state.logs) ? state.logs : [];

  return {
    ...state,
    tests: testingResult,
    logs: [...logs, 'testing:generated'],
  };
}
