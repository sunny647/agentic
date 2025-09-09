// ─────────────────────────────────────────────────────────────
// File: src/flow/story-flow.js
// ─────────────────────────────────────────────────────────────
import { StateGraph } from "@langchain/langgraph";
import { enrichmentAgent } from "../agents/enrichment.agent.js";
import { decompositionAgent } from "../agents/decomposition.agent.js";
import { estimationAgent } from "../agents/estimation.agent.js";
import { codingAgent } from "../agents/coding.agent.js";
import { testingAgent } from "../agents/testing.agent.js";
import { supervisorAgent } from "../agents/supervisor.agent.js";
import { defaultState } from "./schema.js";
import logger from '../logger.js';
import { commitFiles } from "../services/githubTools.js";


export function buildStoryFlow() {
  const workflow = new StateGraph({
    channels: {
      story: null,
      issueID: null,
      enrichedStory: null,
      decomposition: null,
      codingTasks: null, // <-- ensure codingTasks are part of state
      estimation: null,
      code: null,
      tests: null,
      prUrl: null,
      commitFiles: null,
      git: null,
      contextJson: null,
      projectFileMetadataJson: null,
      supervisorDecision: null,
      feedback: {},   // 🔹 new channel for feedback
      logs: [],
    },
  });

  // Register agents
  workflow.addNode("enrichment", enrichmentAgent);
  // Wrap decompositionAgent to merge codingTasks into state
  workflow.addNode("decompose", async (state) => {
    const result = await decompositionAgent(state);
    return {
      ...state,
      decomposition: result.decomposition,
      codingTasks: result.codingTasks,
    };
  });
  workflow.addNode("estimate", estimationAgent);
  workflow.addNode("coding", codingAgent);
  workflow.addNode("testing", testingAgent);
  workflow.addNode("supervisor", supervisorAgent);

  // Standard forward flow
  workflow.addEdge("enrichment", "decompose");
  workflow.addEdge("decompose", "estimate");
  workflow.addEdge("estimate", "coding");
  workflow.addEdge("coding", "testing");
  workflow.addEdge("testing", "supervisor");

  // Supervisor decision logic
  workflow.addConditionalEdges("supervisor", (state) => {
    const { supervisorDecision } = state;

    if (!supervisorDecision) return [];

    const { revisionNeeded = [], feedback = {} } = supervisorDecision;

    // Save feedback into state
    state.feedback = feedback;

    // Route back based on revisionNeeded
    if (revisionNeeded.includes("coding")) return ["coding"];
    if (revisionNeeded.includes("testing")) return ["testing"];
    if (revisionNeeded.includes("decompose")) return ["decompose"];
    if (revisionNeeded.includes("estimate")) return ["estimate"];

    return []; // all good, end workflow
  });

  workflow.addEdge("__start__", "enrichment");

  return workflow.compile();
}


export async function runPipeline(input) {
  const app = buildStoryFlow();
  // Load context.json and project_file_metadata.json synchronously
  const fs = await import('fs');
  const contextJson = JSON.parse(fs.readFileSync('meta/context.json', 'utf8'));
  const projectFileMetadataJson = JSON.parse(fs.readFileSync('meta/project_file_metadata.json', 'utf8'));

  // Inject into initial state
  const init = defaultState({
    ...input,
    contextJson,
    projectFileMetadataJson
  });
  logger.info('Initial State:', init);
  const result = await app.invoke(init);
  // Write logs to a file
  const logData = Array.isArray(result.logs) ? result.logs.join('\n') : String(result.logs);
  fs.writeFileSync('pipeline-logs.txt', logData, 'utf8');
  return result;
}
