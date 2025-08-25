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

export function buildStoryFlow() {
  const workflow = new StateGraph({
    channels: {
      story: null,
      enrichedStory: null,
      decomposition: null,
      codingTasks: null, // <-- ensure codingTasks are part of state
      estimation: null,
      code: null,
      tests: null,
      git: null,
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

  workflow.setEntryPoint("enrichment");

  return workflow.compile();
}


export async function runPipeline(input) {
  const app = buildStoryFlow();
  const init = defaultState(input);
  const result = await app.invoke(init);
  // Write logs to a file
  import('fs').then(fs => {
    const logData = Array.isArray(result.logs) ? result.logs.join('\n') : String(result.logs);
    fs.writeFileSync('pipeline-logs.txt', logData, 'utf8');
  });
  return result;
}
