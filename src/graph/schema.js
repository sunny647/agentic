// src/flow/schema.js
import { z } from 'zod';

// Define schema for a single image, now storing base64
const JiraImageSchema = z.object({
  url: z.string().url().describe("The URL of the image in Jira."),
  base64: z.string().describe("Base64 encoded string of the image (data URI format)."),
  filename: z.string().optional().describe("Original filename of the image, if available."),
});

// Zod schemas for structured testing agent output
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

// Zod schema for the entire pipeline state
export const StoryStateSchema = z.object({
  requestId: z.string().optional(), // Added optional, as it might not always be present initially
  issueID: z.string().optional().describe("Jira Issue ID associated with the story."),
  story: z.string().describe("The initial user story text."),
  jiraImages: z.array(JiraImageSchema).optional().describe("Array of image data extracted and fetched from Jira description.").default([]),
  descriptionAdf: z.any().optional().describe("Full Jira description in Atlassian Document Format (ADF)."),
  enrichedStory: z.string().optional().describe("User story after enrichment."),
  
  // Update 'context' to ensure acceptanceCriteria is always an array
  context: z.object({
    repo: z.object({ owner: z.string().optional(), name: z.string().optional() }).optional(),
    projectKey: z.string().optional(),
    techStack: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    acceptanceCriteria: z.array(z.string()).optional().default([]), // Ensure this is always an array
  }).default({ acceptanceCriteria: [] }), // Default context with empty acceptanceCriteria array

  estimation: z.object({
    approach: z.string().optional(),
    LOE: z.object({
      FE: z.string().optional(), BE: z.string().optional(), QA: z.string().optional(), Review: z.string().optional()
    }).optional(),
  }).optional(),
  
  // Ensure decomposition and codingTasks schemas are correct based on previous updates
  decomposition: z.object({
    feTasks: z.array(z.object({ task: z.string(), solution: z.string() })).default([]),
    beTasks: z.array(z.object({ task: z.string(), solution: z.string() })).default([]),
    sharedTasks: z.array(z.object({ task: z.string(), solution: z.string() })).default([]),
    risks: z.array(z.string()).default([]),
  }).optional(),
  codingTasks: z.array(z.object({ type: z.string(), task: z.string(), solution: z.string() })).default([]),

  codePatches: z.object({ 
    files: z.record(z.string(), z.object({ action: z.enum(["create", "modify", "delete"]), content: z.string().optional() })) 
  }).optional(),
  commitFiles: z.array(z.object({ path: z.string(), action: z.enum(["create", "modify", "delete"]), content: z.string().optional() })).optional(),
  prUrl: z.string().url().optional(),

  // Update the 'tests' channel to use the new structured schema
  tests: TestingOutputSchema.optional(), // Use the structured schema here

  contextJson: z.any().optional().describe("General project context in JSON format."),
  projectFileMetadataJson: z.any().optional().describe("Metadata about project files in JSON format."),
  supervisorDecision: z.any().optional(),
  feedback: z.record(z.string(), z.string()).optional().default({}),
  logs: z.array(z.string()).optional().default([]),
});

// Helper to create a default state from partial input
export const defaultState = (partial) => {
    return StoryStateSchema.parse({
        logs: [],
        feedback: {},
        jiraImages: [],
        context: {
          acceptanceCriteria: [], // Ensure default context has this
          ...(partial.context || {})
        },
        ...partial
    });
};