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
import dotenv from 'dotenv'; // For environment variables
dotenv.config();

// Helper to parse LOE string (e.g., "8h" to 8)
function parseLoeHours(loeString) {
  if (!loeString || loeString.toLowerCase() === 'n/a') {
    return 0;
  }
  const match = String(loeString).match(/(\d+)\s*h/i); // Ensure loeString is treated as a string
  return match ? parseInt(match[1], 10) : 0; // Default to 0 if format doesn't match
}

// Helper to calculate total LOE hours from estimation object
function calculateTotalLOEHours(estimation) {
  if (!estimation || !estimation.LOE) {
    return 0;
  }
  const { FE, BE } = estimation.LOE;
  return parseLoeHours(FE) + parseLoeHours(BE);
}

// --- Define the threshold from environment variable ---
// If total hours are <= this, the Solution Architect will be skipped.
const SOLUTION_DESIGN_MIN_LOE_HOURS = parseInt(process.env.SOLUTION_DESIGN_MIN_LOE_HOURS || '40', 10); // Default to 40 hours

export function buildStoryFlow() {
  const workflow = new StateGraph({
    channels: {
      story: null,
      issueID: null,
      jiraImages: null,
      enrichedStory: null,
      decomposition: null,
      codingTasks: null, // <-- ensure codingTasks are part of state
      estimation: null,
      solutionDesign: null, // NEW CHANNEL for solution design output
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
  workflow.addNode("solutionArchitect", solutionArchitectAgent); // NEW NODE
  workflow.addNode("coding", codingAgent);
  workflow.addNode("testing", testingAgent);
  workflow.addNode("supervisor", supervisorAgent);

  // Standard forward flow
  workflow.addEdge("enrichment", "decompose");
  workflow.addEdge("decompose", "estimate");
  // --- NEW CONDITIONAL EDGE AFTER ESTIMATION ---
  workflow.addConditionalEdges(
    "estimate",
    (state) => {
      const totalLoeHours = calculateTotalLOEHours(state.estimation);
      logger.info({ issueID: state.issueID, totalLoeHours, minLoeForDesign: SOLUTION_DESIGN_MIN_LOE_HOURS }, `Total LOE for solution design decision.`);
      if (totalLoeHours > SOLUTION_DESIGN_MIN_LOE_HOURS) {
        logger.info({ issueID: state.issueID, decision: "call_solution_architect" }, "Total LOE is above threshold, calling Solution Architect.");
        return "solutionArchitect";
      } else {
        logger.info({ issueID: state.issueID, decision: "skip_solution_architect" }, "Total LOE is below or equal to threshold, skipping Solution Architect and going to Coding.");
        return "coding"; // Skip Solution Architect, go directly to coding
      }
    }
  );

  workflow.addEdge("solutionArchitect", "coding"); // From Solution Architect to Coding
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
    if (revisionNeeded.includes("solutionArchitect")) return ["solutionArchitect"]; // NEW REVISION PATH


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
