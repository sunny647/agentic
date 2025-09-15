import { z } from 'zod';

// Define schema for a single image, now storing base64
const JiraImageSchema = z.object({
  url: z.string().url().describe("The URL of the image in Jira."),
  base64: z.string().describe("Base64 encoded string of the image (data URI format)."),
  filename: z.string().optional().describe("Original filename of the image, if available."),
});

// Zod schemas for solution architect agent output
const SolutionDesignOutputSchema = z.object({
  title: z.string().describe("Concise title for the Confluence solution design page."),
  solutionDesign: z.string().describe("Detailed solution design, including architecture overview, key components, data flow, and API considerations. Use Markdown format for readability (headings, bullet points, bold)."),
  diagramCode: z.string().optional().describe("Mermaid or PlantUML code for a block diagram, sequence diagram, or data flow diagram. Can be empty if no diagram is generated."),
  diagramType: z.enum(['mermaid', 'plantuml', 'none']).default('none').describe("Type of diagram generated: 'mermaid', 'plantuml', or 'none'."),
  confluenceSpaceKey: z.string().describe("The Confluence space key where the page should be created (e.g., 'SP', 'DEV')."),
  parentPageTitle: z.string().optional().describe("Optional title of a parent Confluence page under which this design should be nested. Leave undefined if no parent page is desired."),
});

export const StoryStateSchema = z.object({
  requestId: z.string(),
  issueID: z.string().optional(),
  story: z.string(),
  enrichedStory: z.string().optional(),
  context: z
    .object({
      repo: z.object({ owner: z.string().optional(), name: z.string().optional() }).optional(),
      projectKey: z.string().optional(),
      techStack: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
    })
    .default({}),
  solutionDesign: SolutionDesignOutputSchema.optional(), // NEW CHANNEL
  estimation: z
    .object({ storyPoints: z.number().optional(), confidence: z.number().optional(), notes: z.string().optional() })
    .optional(),
  decomposition: z
    .object({
      feTasks: z.array(z.string()).default([]),
      beTasks: z.array(z.string()).default([]),
      sharedTasks: z.array(z.string()).default([]),
      risks: z.array(z.string()).default([]),
    })
    .optional(),
  code: z
    .object({
      files: z.record(z.string(), z.string()).default({}),
      instructions: z.array(z.string()).default([]),
    })
    .optional(),
  codingTasks: z.array(z.object({ type: z.string(), task: z.string() })).default([]),
  tests: z
    .object({ scenarios: z.array(z.string()).default([]), cases: z.array(z.string()).default([]) })
    .optional(),
  contextJson: z.any().optional(),
  projectFileMetadataJson: z.any().optional(),
  commitFiles: z.array(z.object({ path: z.string(), action: z.string(), content: z.string().optional() })).default([]),
  prUrl: z.string().optional(),
  jiraImages: z.array(JiraImageSchema).optional().describe("Array of image data extracted and fetched from Jira description.").default([]),
});

export const defaultState = (partial) => ({
  logs: [],
  issueID: partial.issueID || '',
  jiraImages: [], // Default empty array for images
  ...partial
});
