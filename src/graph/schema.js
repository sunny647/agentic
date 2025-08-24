import { z } from 'zod';

export const StoryStateSchema = z.object({
  requestId: z.string(),
  story: z.string(),
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
  tests: z
    .object({ scenarios: z.array(z.string()).default([]), cases: z.array(z.string()).default([]) })
    .optional(),
  git: z
    .object({ branch: z.string().optional(), prUrl: z.string().optional(), commitSha: z.string().optional() })
    .optional(),
  logs: z.array(z.string()).default([]),
});

export const defaultState = (partial) => ({ logs: [], ...partial });
