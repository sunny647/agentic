import { z } from 'zod';

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
});

export const defaultState = (partial) => ({
  logs: [],
  issueID: partial.issueID || '',
  ...partial
});
