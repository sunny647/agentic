// ─────────────────────────────────────────────────────────────
// File: src/flow/story-flow.js
// ─────────────────────────────────────────────────────────────
import { StateGraph } from "@langchain/langgraph";
import { enrichmentAgent } from "../agents/enrichment.agent.js";
import { decompositionAgent } from "../agents/decomposition.agent.js";
import { estimationAgent } from "../agents/estimation.agent.js";
import { codingAgent } from "../agents/coding.agent.js";
import { testingAgent } from "../agents/testing.agent.js";
import { gitAgent } from "../agents/git.agent.js";
import { supervisorAgent } from "../agents/supervisor.agent.js";

export function buildStoryFlow() {
  const workflow = new StateGraph({
    channels: {
      story: null,
      decomposition: null,
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
  workflow.addNode("decomposition", decompositionAgent);
  workflow.addNode("estimation", estimationAgent);
  workflow.addNode("coding", codingAgent);
  workflow.addNode("testing", testingAgent);
  workflow.addNode("git", gitAgent);
  workflow.addNode("supervisor", supervisorAgent);

  // Standard forward flow
  workflow.addEdge("decomposition", "estimation");
  workflow.addEdge("estimation", "coding");
  workflow.addEdge("coding", "testing");
  workflow.addEdge("testing", "git");
  workflow.addEdge("git", "supervisor");

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
    if (revisionNeeded.includes("decomposition")) return ["decomposition"];
    if (revisionNeeded.includes("estimation")) return ["estimation"];
    if (revisionNeeded.includes("git")) return ["git"];

    return []; // all good, end workflow
  });

  workflow.setEntryPoint("enrichment");

  return workflow.compile();
}


export async function runPipeline(input) {
  const app = buildStoryFlow();
  const init = defaultState(input);
  return await app.invoke(init);
}
