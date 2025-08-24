import { StateGraph } from '@langchain/langgraph';
import { defaultState } from './schema.js';
import { supervisorAgent } from '../agents/supervisor.agent.js';
import { estimationAgent } from '../agents/estimation.agent.js';
import { decompositionAgent } from '../agents/decomposition.agent.js';
import { codingAgent } from '../agents/coding.agent.js';
import { testingAgent } from '../agents/testing.agent.js';
// import { gitAgent } from '../agents/git.agent.js';

export function buildGraph() {
  const graph = new StateGraph({ channels: {} });

  graph.addNode('supervisor', supervisorAgent);
  graph.addNode('estimation', estimationAgent);
  graph.addNode('decomposition', decompositionAgent);
  graph.addNode('coding', codingAgent);
  graph.addNode('testing', testingAgent);
  // graph.addNode('git', gitAgent);

  graph.addEdge('supervisor', 'estimation');
  graph.addEdge('estimation', 'decomposition');
  graph.addEdge('decomposition', 'coding');
  graph.addEdge('coding', 'testing');
  //graph.addEdge('testing', 'git');

  graph.setEntryPoint('supervisor');
  graph.setFinishPoint('testing');

  return graph.compile();
}

export async function runPipeline(input) {
  const app = buildGraph();
  const init = defaultState(input);
  return await app.invoke(init);
}
