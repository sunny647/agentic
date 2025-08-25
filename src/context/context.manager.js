// src/context/context.manager.js
import { chromaClient } from '../db/chromadb.js';

export async function getContext(agentName, state) {
  const query = state.enrichedStory || state.story;

  // Query ChromaDB for top-k documents
  const results = await chromaClient.query({
    collection: 'architecture_docs',
    queryTexts: [query],
    nResults: 5,
  });

  return {
    documents: results.documents?.flat() || [],
    metadata: results.metadatas?.flat() || [],
    acceptanceCriteria: state.context?.acceptanceCriteria || [],
    codeRefs: state.context?.codeRefs || [], // optional GitHub pull
    source: 'chroma',
    agent: agentName,
  };
}
