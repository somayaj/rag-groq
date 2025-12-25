/**
 * rag-groq Custom Data Source Example
 * 
 * This example shows how to use different data sources:
 * - CSV files
 * - SQLite database
 * - PostgreSQL database
 * - Pinecone vector database
 * - Elasticsearch
 * 
 * Run with: node examples/custom-datasource.js
 */

import { 
  RAGEngine, 
  CSVDataSource, 
  SQLiteDataSource, 
  PostgresDataSource,
  PineconeDataSource,
  ElasticsearchDataSource,
  GroqLLM, 
  LocalEmbeddings 
} from '../src/index.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your-groq-api-key';

// ===== DATA SOURCE CONFIGURATIONS =====

/**
 * Example 1: CSV Data Source
 * Best for: Small to medium datasets, quick prototyping
 */
function createCSVDataSource() {
  return new CSVDataSource({
    filePath: './data/sample.csv',
    contentColumn: 'content',    // Column with main text (optional)
    idColumn: 'id',              // Column for unique IDs (optional)
    delimiter: ','               // CSV delimiter (default: ',')
  });
}

/**
 * Example 2: SQLite Data Source
 * Best for: Local applications, single-user scenarios
 */
function createSQLiteDataSource() {
  return new SQLiteDataSource({
    dbPath: './data/knowledge.sqlite',  // Path to SQLite file
    tableName: 'documents',              // Table name
    contentColumn: 'content',            // Column with text
    idColumn: 'id'                       // Primary key column
  });
}

/**
 * Example 3: PostgreSQL Data Source
 * Best for: Production applications, multi-user scenarios
 */
function createPostgresDataSource() {
  return new PostgresDataSource({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || 'ragdb',
    tableName: 'documents',
    contentColumn: 'content',
    idColumn: 'id'
  });
}

/**
 * Example 4: Pinecone Data Source
 * Best for: Large-scale production, high-performance vector search
 */
function createPineconeDataSource(embeddings) {
  const dataSource = new PineconeDataSource({
    apiKey: process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX_NAME || 'rag-index',
    namespace: 'documents'
  });
  
  // Pinecone requires an embedding function for text-to-vector conversion
  dataSource.setEmbeddingFunction(async (text) => {
    return await embeddings.embed(text);
  });
  
  return dataSource;
}

/**
 * Example 5: Elasticsearch Data Source
 * Best for: Full-text search + vector search, production applications
 */
function createElasticsearchDataSource(embeddings) {
  const dataSource = new ElasticsearchDataSource({
    node: process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    indexName: process.env.ELASTICSEARCH_INDEX_NAME || 'rag-documents',
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
    apiKey: process.env.ELASTICSEARCH_API_KEY,
    cloudId: process.env.ELASTICSEARCH_CLOUD_ID,
    dimension: 384,
    contentField: 'content',
    idField: 'id'
  });
  
  // Elasticsearch can use embedding function for vector search
  dataSource.setEmbeddingFunction(async (text) => {
    return await embeddings.embed(text);
  });
  
  return dataSource;
}

// ===== MAIN FUNCTION =====

async function main() {
  console.log('🚀 rag-groq Custom Data Source Example\n');
  
  // Choose which data source to use
  const DATA_SOURCE_TYPE = process.env.DATASOURCE_TYPE || 'csv';
  
  console.log(`📦 Using data source: ${DATA_SOURCE_TYPE.toUpperCase()}\n`);
  
  // Create embeddings (needed for all data sources)
  const embeddings = new LocalEmbeddings({ dimension: 384 });
  
  // Create the appropriate data source
  let dataSource;
  switch (DATA_SOURCE_TYPE.toLowerCase()) {
    case 'csv':
      dataSource = createCSVDataSource();
      break;
    case 'sqlite':
      dataSource = createSQLiteDataSource();
      break;
    case 'postgres':
      dataSource = createPostgresDataSource();
      break;
    case 'pinecone':
      dataSource = createPineconeDataSource(embeddings);
      break;
    case 'elasticsearch':
    case 'es':
      dataSource = createElasticsearchDataSource(embeddings);
      break;
    default:
      throw new Error(`Unknown data source type: ${DATA_SOURCE_TYPE}`);
  }
  
  // Create LLM
  const llm = new GroqLLM({
    apiKey: GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile'
  });
  
  // Create and initialize RAG engine
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 5
  });
  
  await ragEngine.initialize();
  console.log(`✅ Loaded ${ragEngine.getStats().documentCount} documents\n`);
  
  // Test query
  const result = await ragEngine.query('What topics are covered in the documents?');
  console.log('📝 Query: What topics are covered in the documents?\n');
  console.log('💡 Answer:', result.answer);
  
  await ragEngine.close();
}

main().catch(console.error);

