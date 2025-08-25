import dotenv from "dotenv";
dotenv.config();
import { ChromaClient } from "chromadb";
import { OpenAI } from "openai";
import fs from "fs";
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbeddings(texts) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts
    });
    console.log('text-embedding-ada-002 : '+response.data);
    return response.data.map(item => item.embedding);
}

// Minimal ChromaDB client for querying and upserting
export const chromaClient = {
  async query({ collection = 'sprint-pilot-docs', queryTexts = [], nResults = 5 }) {
    const client = new ChromaClient();
    const coll = await client.getOrCreateCollection({ name: collection });
    const queryEmbeddings = await getEmbeddings(queryTexts);
    return await coll.query({ queryEmbeddings, nResults });
  },
  async upsert({ collection = 'sprint-pilot-docs', documents = [], ids = [] }) {
    const client = new ChromaClient();
    const coll = await client.getOrCreateCollection({ name: collection });
    const embeddings = await getEmbeddings(documents);
    return await coll.upsert({ documents, ids, embeddings });
  }
};
