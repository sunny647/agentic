import { z } from 'zod';

// Define schema for a single image, now storing base64
const JiraImageSchema = z.object({
  url: z.string().url().describe("The URL of the image in Jira."),
  base64: z.string().describe("Base64 encoded string of the image (data URI format)."),
  filename: z.string().optional().describe("Original filename of the image, if available."),
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
