/**
 * RAG Datasource API
 * A comprehensive RAG solution with multiple data source support and Groq LLM integration
 */

import { RAGEngine } from './rag/engine.js';
import { CSVDataSource } from './datasources/csv.js';
import { FileDataSource } from './datasources/file.js';
import { SQLiteDataSource } from './datasources/sqlite.js';
import { PostgresDataSource } from './datasources/postgres.js';
import { PineconeDataSource } from './datasources/pinecone.js';
import { GroqLLM } from './llm/groq.js';
import { LocalEmbeddings } from './embeddings/local.js';
import { Guardrails } from './guardrails/policies.js';
import { createAPIServer } from './api/server.js';

export {
  RAGEngine,
  CSVDataSource,
  FileDataSource,
  SQLiteDataSource,
  PostgresDataSource,
  PineconeDataSource,
  GroqLLM,
  LocalEmbeddings,
  Guardrails,
  createAPIServer
};

/**
 * Quick setup function to create a RAG API with minimal configuration
 * @param {Object} config - Configuration object
 * @returns {Object} - Express app and RAG engine
 */
export async function createRAGAPI(config) {
  const {
    groqApiKey,
    dataSource,
    port = 3000,
    topK = 5,
    model = 'llama-3.3-70b-versatile',
    guardrails = null
  } = config;

  if (!groqApiKey) {
    throw new Error('Groq API key is required');
  }

  if (!dataSource) {
    throw new Error('Data source is required');
  }

  // Initialize LLM
  const llm = new GroqLLM({ apiKey: groqApiKey, model });

  // Initialize embeddings
  const embeddings = new LocalEmbeddings();

  // Create RAG engine
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK,
    guardrails
  });

  // Initialize the engine
  await ragEngine.initialize();

  // Create API server
  const app = createAPIServer(ragEngine);

  return { app, ragEngine, port };
}

/**
 * Helper function to create a data source from type
 * @param {string} type - Data source type (file, csv, sqlite, postgres, pinecone)
 * @param {Object} config - Data source configuration
 * @returns {Object} - Data source instance
 */
export function createDataSource(type, config) {
  switch (type.toLowerCase()) {
    case 'file':
    case 'files':
    case 'directory':
    case 'folder':
      return new FileDataSource(config);
    case 'csv':
      return new CSVDataSource(config);
    case 'sqlite':
      return new SQLiteDataSource(config);
    case 'postgres':
      return new PostgresDataSource(config);
    case 'pinecone':
      return new PineconeDataSource(config);
    default:
      throw new Error(`Unknown data source type: ${type}`);
  }
}

