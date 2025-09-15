// src/prompts/prompt.manager.js
import { z } from "zod"; // Assuming schemas are defined here or imported
import logger from '../logger.js';
// --- Define Schemas if not already imported elsewhere ---
// For testing agent
const GherkinStepSchema = z.string().describe("A single Gherkin step (Given, When, Then, And, But).");
const TestScenarioSchema = z.object({
  scenarioTitle: z.string().describe("The title of the test scenario."),
  gherkinSteps: z.array(GherkinStepSchema).describe("An array of Gherkin steps for this scenario."),
}).describe("A single test scenario with its title and Gherkin steps.");
export const TestingOutputSchema = z.object({ // Export if used in structured models
  testScenarios: z.array(TestScenarioSchema).describe("An array of detailed test scenarios."),
  risksCovered: z.array(z.string()).optional().describe("A list of identified risks that these tests specifically cover."),
  notes: z.string().optional().describe("Any additional notes or considerations for testing."),
}).describe("Structured output for all generated test scenarios.");

// For enrichment agent
export const EnrichmentOutputSchema = z.object({ // Export if used in structured models
  description: z.string().describe("The enriched user story description, clarifying scope, assumptions, and dependencies."),
  acceptanceCriteria: z.array(z.string()).describe("A detailed list of acceptance criteria, expanded to cover edge cases and risks."),
});

// For estimation agent
export const EstimationOutputSchema = z.object({ // Export if used in structured models
  approach: z.string().describe("A detailed solution approach outlining how the story will be implemented."),
  LOE: z.object({
    FE: z.string().describe("Level of Effort for Frontend tasks (e.g., '3 Story Points', 'Medium', '8h')."),
    BE: z.string().describe("Level of Effort for Backend tasks (e.g., '5 Story Points', 'Large', '16h')."),
    QA: z.string().describe("Level of Effort for Quality Assurance/Testing (e.g., '2 Story Points', 'Small', '4h')."),
    Review: z.string().describe("Level of Effort for Code Review/Pull Request Review (e.g., '1 Story Point', 'Very Small', '2h')."),
  }).describe("Level of Effort breakdown by domain."),
});

// For decomposition agent
const DetailedTaskSchema = z.object({
  task: z.string().describe("Summary or title of the technical subtask."),
  solution: z.string().describe("Detailed solution approach, steps, or considerations for implementing this specific subtask."),
});
export const DecompositionOutputSchema = z.object({ // Export if used in structured models
  feTasks: z.array(DetailedTaskSchema).describe("List of Frontend technical subtasks, each with a detailed solution."),
  beTasks: z.array(DetailedTaskSchema).describe("List of Backend technical subtasks, each with a detailed solution."),
  sharedTasks: z.array(DetailedTaskSchema).describe("List of shared technical subtasks, each with a detailed solution."),
  risks: z.array(z.string()).describe("List of identified technical risks related to the story implementation."),
});

// For coding agent
const FileActionSchema = z.enum(["create", "modify", "delete"]).describe("The action to perform on the file.");
const FileChangeSchema = z.object({
  action: FileActionSchema,
  content: z.string().optional().describe("The full content of the file. Required for 'create' and 'modify' actions. Not applicable for 'delete'.")
});
export const CodingOutputSchema = z.object({ // Export if used in structured models
  files: z.record(z.string().describe("File path relative to the repository root (e.g., 'src/components/MyComponent.js')."), FileChangeSchema)
}).describe("A JSON object representing all proposed file changes.");


/**
 * Centralized prompt manager. Returns an array of messages for the LLM based on agent role.
 * @param {string} agentName The name of the agent requesting the prompt.
 * @param {object} state The current state object from the LangGraph pipeline.
 * @returns {Array<object>} An array of message objects ({ role: 'system' | 'user', content: string | Array<object> }).
 */
export function getPrompt(agentName, state) {
  const baseContext = `\n\nProject context: ${JSON.stringify(state.contextJson)}\nProject file metadata: ${JSON.stringify(state.projectFileMetadataJson)}`;
  const imageInstruction = `\n\n**Attached UI/Visual References:**\n`;
  const imageConsideration = `\nConsider these images carefully for detailed UI requirements and context when generating your response.`;
  const jsonOutputInstruction = `Your response MUST be a valid JSON object. Focus on generating the structured output directly.` +
                                `\n\n--- IMPORTANT: Respond ONLY with the JSON object. Do NOT include any additional text or markdown fences (e.g., \`\`\`json). ---`;


  const userContentPartsWithImages = (mainTextContent) => {
    const parts = [{ type: 'text', text: mainTextContent }];
    if (state.jiraImages && state.jiraImages.length > 0) {
      parts.push({ type: 'text', text: imageInstruction });
      state.jiraImages.forEach((img, index) => {
        parts.push({ type: 'image_url', image_url: { url: img.base64 } });
        parts.push({ type: 'text', text: `\n(Image ${index + 1}: [ImageName: ${img.filename}, ImageURL: ${img.url}])\n` });
      });
      parts.push({ type: 'text', text: imageConsideration });
    }
    parts.push({ type: 'text', text: '\n\nOutput:' }); // Final explicit output instruction
    return parts;
  };
  var prompt = [];
  switch (agentName) {
    case 'enrichmentAgent':
      logger.info(`Generating prompt for agent: ${agentName}`);
      prompt = [
        {
          role: 'system',
          content:
            'You are a business analyst. Enrich the user story by clarifying scope, assumptions, and dependencies. ' +
            'Also expand the acceptance criteria into a detailed list that covers edge cases and risks. ' +
            `Pay close attention to any provided images for UI requirements and visual context. ${jsonOutputInstruction}` +
            baseContext
        },
        { role: 'user', content: userContentPartsWithImages(state.story) },
      ];
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);
      return prompt;

    case 'estimationAgent':
      logger.info(`Generating prompt for agent: ${agentName}`);
      const codingTasksSummary = (state.codingTasks || []).map(task => `${task.type}: ${task.task}`).join('\n- ');
      const acceptanceCriteriaList = (state.context?.acceptanceCriteria || []).join('\n- '); // Access from state.context

      const estimationMainText =
        `Story: ${state.enrichedStory || state.story}` +
        (acceptanceCriteriaList ? `\n\nAcceptance Criteria:\n- ${acceptanceCriteriaList}` : '') +
        (codingTasksSummary ? `\n\nIdentified Coding Tasks:\n- ${codingTasksSummary}` : '');
      
      prompt = [
        {
          role: 'system',
          content:
            'You are a senior engineering manager. Your task is to provide a detailed solution approach and ' +
            'a Level of Effort (LOE) breakdown for the given user story. ' +
            'The LOE should be provided for Frontend (FE), Backend (BE), Quality Assurance (QA), and Code Review (Review). ' +
            'Use units for LOE as hrs but ensure consistency for a single story.' +
            `Provide a concise but detailed approach for implementation. ${jsonOutputInstruction}` +
            baseContext
        },
        { role: 'user', content: userContentPartsWithImages(estimationMainText) }
      ];
      
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);

      return prompt;

    case 'decompositionAgent':
      // const ctx = await getContext('decomposition', state); // getContext should be called inside the agent if it's async
      logger.info(`Generating prompt for agent: ${agentName}`);
      const decompositionMainText = JSON.stringify({
        story: state.enrichedStory || state.story,
        acceptanceCriteria: state.context?.acceptanceCriteria || [], // Access from state.context
        // contextDocs: ctx.documents, // This would be passed if getContext was run here
        // projectFileMetadataJson: state.projectFileMetadataJson // already in baseContext
      }, null, 2);
      prompt = [
        {
          role: 'system',
          content:
            `You are a senior tech lead. Decompose the enriched user story into clear technical subtasks for Frontend (FE), Backend (BE), and Shared categories. For each subtask, provide a concise summary AND a detailed solution approach. Identify any potential technical risks. ` +
            `Pay close attention to any provided images for UI requirements and visual context. ${jsonOutputInstruction}` +
            baseContext
            // Assuming contextDocs will be added by the agent if it needs to call getContext
        },
        { role: 'user', content: userContentPartsWithImages(decompositionMainText) }
      ];
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);
      return prompt;

    case 'codingAgent':
      logger.info(`Generating prompt for agent: ${agentName}`);
      const decompositionTasks = [
        ...(state.decomposition?.feTasks || []),
        ...(state.decomposition?.beTasks || []),
        ...(state.decomposition?.sharedTasks || []),
      ];
      const formattedTasks = decompositionTasks.map(taskObj =>
        `- [${taskObj.type || 'Shared'}] ${taskObj.task}:\n  Solution Approach: ${taskObj.solution}`
      ).join('\n');

      const codingMainText =
        `User Story: ${state.enrichedStory || state.story}\n\n` +
        `Decomposed Technical Tasks with Solution Approaches:\n${formattedTasks}\n\n` +
        `Based on the above, provide the JSON object for the required file changes. If no files need to be changed, return an empty object for 'files'.`;
        
      prompt = [
        {
          role: 'system',
          content:
            `You are a senior full-stack engineer.
            You will be given a user story and a list of decomposed technical tasks, each with a detailed solution approach.
            Your goal is to propose code changes (create, modify, or delete files) that implement these tasks.
            You have access to a tool: getFiles(paths: string[]): Returns the latest content of multiple files from the repository.
            Rules: Use getFiles(paths) first for modifying existing files. Return FULL file content, not diffs. Do not request directories. ` +
            `If a file does not exist, assume 'create' or proceed without. ${jsonOutputInstruction}` +
            baseContext
        },
        { role: 'user', content: userContentPartsWithImages(codingMainText) }
      ];
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);
      return prompt;

    case 'testingAgent':
      logger.info(`Generating prompt for agent: ${agentName}`);
      const testDecompositionTasks = [
        ...(state.decomposition?.feTasks || []),
        ...(state.decomposition?.beTasks || []),
        ...(state.decomposition?.sharedTasks || []),
      ];
      const testFormattedTasks = testDecompositionTasks.map(taskObj =>
        `- [${taskObj.type || 'Shared'}] ${taskObj.task}:\n  Solution Approach: ${taskObj.solution}`
      ).join('\n');
      const testAcceptanceCriteriaList = (state.context?.acceptanceCriteria || []).join('\n- ');
      const testIdentifiedRisksList = (state.decomposition?.risks || []).join('\n- ');

      const testingMainText =
        `Story: ${state.enrichedStory || state.story}` +
        (testAcceptanceCriteriaList ? `\n\nAcceptance Criteria:\n- ${testAcceptanceCriteriaList}` : '') +
        (testFormattedTasks ? `\n\nDecomposed Tasks:\n${testFormattedTasks}` : '') +
        (testIdentifiedRisksList ? `\n\nIdentified Risks:\n- ${testIdentifiedRisksList}` : '');

      prompt = [
        {
          role: 'system',
          content:
            'You are a QA lead. Your task is to generate detailed test scenarios and Gherkin test cases. ' +
            'Cover all identified risks, acceptance criteria, and specific decomposed tasks. ' +
            `Pay close attention to any provided images for UI requirements and visual context to ensure UI tests are relevant. ${jsonOutputInstruction}` +
            baseContext
        },
        { role: 'user', content: userContentPartsWithImages(testingMainText) }
      ];
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);
      return prompt;

    case 'supervisorAgent':
      logger.info(`Generating prompt for agent: ${agentName}`);
      const { estimation, decomposition, tests, commitFiles, prUrl } = state;
      prompt = [
        {
          role: 'system',
          content:
            `You are the Supervisor Agent.
            Your role is to REVIEW outputs from sub-agents and validate them.
            Check decomposition (FE, BE, Shared, Risks present, non-empty, relevant).
            Check estimation (numeric effort/time breakdown).
            Check code (aligned with decomposition tasks).
            Check tests (cover acceptance criteria).
            Check git (branch/commit info, PR URL).
            Return JSON in this exact structure:
            {
              "status": "ok" | "needs_revision",
              "missing": [ "estimation" | "decomposition" | "code" | "tests" | "git" ],
              "revisionNeeded": [ "estimation" | "decomposition" | "code" | "tests" | "git" ],
              "feedback": "Detailed supervisor review notes"
            }
            ` + baseContext // Supervisor doesn't explicitly need images in prompt.
        },
        {
            role: 'user', content: JSON.stringify({
                storyContext: state.story,
                estimation: estimation,
                decomposition: decomposition,
                code: commitFiles,
                tests: tests,
                git: prUrl
            }, null, 2)
        }
      ];
      logger.info(`Generated prompt for agent: ${agentName}\n${JSON.stringify(prompt, null, 2)}`);
      return prompt;

    default:
      throw new Error(`Unknown agent: ${agentName}`);
  }
}
