// src/agents/testing.agent.js
import { smallModel } from '../llm/models.js'; // Ensure smallModel is a multi-modal capable model (e.g., gpt-4o-mini)
import logger from '../logger.js';
import { z } from "zod"; // Import Zod
import { jiraTools } from '../services/jiraTools.js'; // Import jiraTools
// Removed SystemMessage, HumanMessage import as we are manually constructing the message array


// 1. Define Zod Schemas for the expected structured output
const GherkinStepSchema = z.string().describe("A single Gherkin step (Given, When, Then, And, But).");
const TestScenarioSchema = z.object({
  scenarioTitle: z.string().describe("The title of the test scenario."),
  gherkinSteps: z.array(GherkinStepSchema).describe("An array of Gherkin steps for this scenario."),
}).describe("A single test scenario with its title and Gherkin steps.");

const TestingOutputSchema = z.object({
  testScenarios: z.array(TestScenarioSchema).describe("An array of detailed test scenarios."),
  risksCovered: z.array(z.string()).optional().describe("A list of identified risks that these tests specifically cover."),
  notes: z.string().optional().describe("Any additional notes or considerations for testing."),
}).describe("Structured output for all generated test scenarios.");

// 2. Create a structured output version of the smallModel
const structuredTestingModel =
  smallModel.withStructuredOutput(TestingOutputSchema, {
    name: "TestingOutput",
  });


export async function testingAgent(state) {
  logger.info({ state }, 'testingAgent called');

  const decompositionTasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];
  const formattedTasks = decompositionTasks.map(taskObj =>
    `- [${taskObj.type || 'Shared'}] ${taskObj.task}:\n  Solution Approach: ${taskObj.solution}`
  ).join('\n');

  const acceptanceCriteriaList = (state.context?.acceptanceCriteria || []).join('\n- ');
  const identifiedRisksList = (state.decomposition?.risks || []).join('\n- ');


  const systemPromptContent =
    `You are a QA lead. Your task is to generate detailed test scenarios and Gherkin test cases. ` +
    `Cover all identified risks, acceptance criteria, and specific decomposed tasks. ` +
    `Pay close attention to any provided images for UI requirements and visual context to ensure UI tests are relevant. ` +
    `Your response MUST be a valid JSON object. Focus on generating the test scenarios directly.` +
    `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`;

  // Construct the user message content array (for multimodal input)
  const userContentParts = [
    { type: 'text', text: `Story: ${state.enrichedStory || state.story}` },
    { type: 'text', text: acceptanceCriteriaList ? `\n\nAcceptance Criteria:\n- ${acceptanceCriteriaList}` : '' },
    { type: 'text', text: formattedTasks ? `\n\nDecomposed Tasks:\n${formattedTasks}` : '' },
    { type: 'text', text: identifiedRisksList ? `\n\nIdentified Risks:\n- ${identifiedRisksList}` : ''},
  ];

  // Add images to the user's prompt if available
  if (state.jiraImages && state.jiraImages.length > 0) {
    userContentParts.push({
        type: 'text',
        text: '\n\n**UI Screenshots/Images for Test Case Generation:**\n'
    });
    state.jiraImages.forEach((img, index) => {
      userContentParts.push({
        type: 'image_url',
        image_url: { url: img.base64 }
      });
      userContentParts.push({
          type: 'text',
          text: `\n(Image ${index + 1}: ${img.filename || img.url.split('/').pop()})\n`
      });
    });
    userContentParts.push({
        type: 'text',
        text: '\nConsider these images carefully when generating detailed UI test cases.'
    });
  }

  // FIX: Manually construct the OpenAI API-compatible messages array
  const openAIMessages = [
    { role: 'system', content: systemPromptContent },
    { role: 'user', content: userContentParts }, // User content is already an array of text/image_url objects
  ];

  let testingResult; // Declare variable

  try {
    // 3. Invoke the structured testing model with the manually constructed messages array
    testingResult = await structuredTestingModel.invoke(openAIMessages);
    logger.info({ testingResult }, 'Testing agent structured output');
  } catch (error) {
    // Log the error object directly for better debugging
    logger.error({ error: error, openAIMessages }, 'Testing model failed to produce structured JSON. Falling back to empty tests.');
    // Fallback in case the model *still* fails
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
    tests: testingResult, // Store the structured result directly
    logs: [...logs, 'testing:generated'],
  };
}
