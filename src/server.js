/**
 * rag-groq Server Entry Point
 * Standalone server that can be configured via environment variables
 */

import 'dotenv/config';
import { createRAGAPI, createDataSource, Guardrails } from './index.js';
import { startServer } from './api/server.js';

async function main() {
  console.log('🔧 Initializing rag-groq Server...\n');

  // Get configuration from environment
  const groqApiKey = process.env.GROQ_API_KEY;
  const port = parseInt(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const dataSourceType = process.env.DATASOURCE_TYPE || 'csv';
  // Auto-adjust topK based on document count (min 5, max 20)
  const topK = parseInt(process.env.TOP_K_RESULTS) || 10;

  if (!groqApiKey) {
    console.error('❌ Error: GROQ_API_KEY environment variable is required');
    console.error('   Set it in .env file or export GROQ_API_KEY=your_key');
    process.exit(1);
  }

  // Create data source based on type
  let dataSource;
  
  try {
    switch (dataSourceType.toLowerCase()) {
      case 'file':
      case 'files':
      case 'directory':
      case 'folder':
        const filePath = process.env.DATA_PATH || process.env.FILE_PATH || './data';
        const watchEnabled = process.env.WATCH !== 'false'; // Enable by default
        dataSource = createDataSource('file', {
          path: filePath,
          recursive: process.env.RECURSIVE === 'true',
          chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
          watch: watchEnabled
        });
        console.log(`📁 Data source: Files (${filePath})${watchEnabled ? ' [auto-refresh]' : ''}`);
        break;

      case 'csv':
        const csvPath = process.env.CSV_FILE_PATH;
        if (!csvPath) {
          console.error('❌ Error: CSV_FILE_PATH is required for CSV data source');
          process.exit(1);
        }
        dataSource = createDataSource('csv', {
          filePath: csvPath,
          contentColumn: process.env.CSV_CONTENT_COLUMN,
          idColumn: process.env.CSV_ID_COLUMN
        });
        console.log(`📄 Data source: CSV (${csvPath})`);
        break;

      case 'sqlite':
        const sqlitePath = process.env.SQLITE_DB_PATH || './data/database.sqlite';
        dataSource = createDataSource('sqlite', {
          dbPath: sqlitePath,
          tableName: process.env.SQLITE_TABLE_NAME || 'documents',
          contentColumn: process.env.SQLITE_CONTENT_COLUMN || 'content',
          idColumn: process.env.SQLITE_ID_COLUMN || 'id'
        });
        console.log(`🗄️  Data source: SQLite (${sqlitePath})`);
        break;

      case 'postgres':
        dataSource = createDataSource('postgres', {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT) || 5432,
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD,
          database: process.env.POSTGRES_DATABASE,
          tableName: process.env.POSTGRES_TABLE_NAME || 'documents',
          contentColumn: process.env.POSTGRES_CONTENT_COLUMN || 'content',
          idColumn: process.env.POSTGRES_ID_COLUMN || 'id'
        });
        console.log(`🐘 Data source: PostgreSQL (${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT})`);
        break;

      case 'pinecone':
        const pineconeApiKey = process.env.PINECONE_API_KEY;
        const pineconeIndex = process.env.PINECONE_INDEX_NAME;
        
        if (!pineconeApiKey || !pineconeIndex) {
          console.error('❌ Error: PINECONE_API_KEY and PINECONE_INDEX_NAME are required');
          process.exit(1);
        }
        
        dataSource = createDataSource('pinecone', {
          apiKey: pineconeApiKey,
          indexName: pineconeIndex,
          namespace: process.env.PINECONE_NAMESPACE || ''
        });
        console.log(`🌲 Data source: Pinecone (${pineconeIndex})`);
        break;

      case 'elasticsearch':
      case 'es':
        const esNode = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
        const esIndex = process.env.ELASTICSEARCH_INDEX_NAME || 'rag-documents';
        const esUsername = process.env.ELASTICSEARCH_USERNAME;
        const esPassword = process.env.ELASTICSEARCH_PASSWORD;
        const esApiKey = process.env.ELASTICSEARCH_API_KEY;
        const esCloudId = process.env.ELASTICSEARCH_CLOUD_ID;
        
        dataSource = createDataSource('elasticsearch', {
          node: esNode,
          indexName: esIndex,
          username: esUsername,
          password: esPassword,
          apiKey: esApiKey,
          cloudId: esCloudId,
          dimension: parseInt(process.env.ELASTICSEARCH_DIMENSION) || 384
        });
        console.log(`🔍 Data source: Elasticsearch (${esIndex} at ${esNode})`);
        break;

      default:
        console.error(`❌ Error: Unknown data source type: ${dataSourceType}`);
        console.error('   Supported types: csv, sqlite, postgres, pinecone, elasticsearch');
        process.exit(1);
    }

    // Create guardrails (if enabled)
    let guardrails = null;
    if (process.env.GUARDRAILS_ENABLED !== 'false') {
      guardrails = new Guardrails({
        enabled: true,
        blockedTerms: process.env.BLOCKED_TERMS?.split(',').map(t => t.trim()) || [],
        sensitiveTopics: process.env.SENSITIVE_TOPICS?.split(',').map(t => t.trim()) || [],
        maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH) || 2000,
        maxResponseLength: parseInt(process.env.MAX_RESPONSE_LENGTH) || 10000,
        rateLimit: process.env.RATE_LIMIT ? {
          requests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
          window: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000
        } : null
      });
    }

    // Create RAG API
    const { app, ragEngine } = await createRAGAPI({
      groqApiKey,
      dataSource,
      topK,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      guardrails
    });

    console.log(`\n📊 Loaded ${ragEngine.getStats().documentCount} documents`);
    console.log(`🤖 LLM Model: ${ragEngine.llm.model}`);
    console.log(`🎯 Top-K: ${topK}\n`);

    // Start file watching if enabled
    if (dataSource.startWatching && dataSource.watch) {
      dataSource.onRefresh = async (docCount, eventType, filePath) => {
        // Refresh the RAG engine's vector index
        try {
          await ragEngine.refresh();
          console.log(`🔄 RAG index rebuilt with ${ragEngine.getStats().documentCount} documents`);
        } catch (error) {
          console.error('Error refreshing RAG index:', error.message);
        }
      };
      await dataSource.startWatching();
    }

    // Start server
    const server = await startServer(app, port, host);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down gracefully...');
      server.close();
      await ragEngine.close();
      console.log('👋 Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();

