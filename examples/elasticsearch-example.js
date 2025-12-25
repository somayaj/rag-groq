/**
 * rag-groq Elasticsearch Data Source Example
 * 
 * This example demonstrates how to use Elasticsearch as a data source
 * for RAG queries with both text and vector search capabilities.
 * 
 * Prerequisites:
 * 1. Install Elasticsearch (or use Elastic Cloud)
 * 2. Install @elastic/elasticsearch: npm install @elastic/elasticsearch
 * 3. Set up your Elasticsearch connection details in .env file
 * 
 * Run with: node examples/elasticsearch-example.js
 */

import 'dotenv/config';
import { 
  RAGEngine, 
  ElasticsearchDataSource,
  GroqLLM, 
  LocalEmbeddings 
} from '../src/index.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your-groq-api-key';

async function main() {
  console.log('🔍 rag-groq Elasticsearch Data Source Example\n');
  
  // ===== STEP 1: Create Embeddings =====
  console.log('🔍 Step 1: Setting up local embeddings...');
  const embeddings = new LocalEmbeddings({ dimension: 384 });
  
  // ===== STEP 2: Create Elasticsearch Data Source =====
  console.log('📦 Step 2: Setting up Elasticsearch data source...');
  const dataSource = new ElasticsearchDataSource({
    // Connection options (choose one):
    node: process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    
    // For Elastic Cloud:
    // cloudId: process.env.ELASTICSEARCH_CLOUD_ID,
    
    // Authentication (choose one):
    // Option 1: Username/Password
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
    
    // Option 2: API Key
    // apiKey: process.env.ELASTICSEARCH_API_KEY,
    
    // Index configuration
    indexName: process.env.ELASTICSEARCH_INDEX_NAME || 'rag-documents',
    dimension: 384,
    contentField: 'content',
    idField: 'id'
  });
  
  // Set embedding function for vector search
  dataSource.setEmbeddingFunction(async (text) => {
    return await embeddings.embed(text);
  });
  
  // ===== STEP 3: Initialize Data Source =====
  console.log('🔄 Step 3: Initializing Elasticsearch connection...');
  try {
    await dataSource.initialize();
    console.log('✅ Connected to Elasticsearch successfully!\n');
  } catch (error) {
    console.error('❌ Failed to connect to Elasticsearch:', error.message);
    console.error('\n💡 Make sure Elasticsearch is running and accessible.');
    console.error('   For local setup: docker run -p 9200:9200 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:8.15.0');
    process.exit(1);
  }
  
  // ===== STEP 4: Add Sample Documents =====
  console.log('📝 Step 4: Adding sample documents to Elasticsearch...');
  
  const sampleDocuments = [
    {
      id: 'doc1',
      content: 'Machine Learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.',
      metadata: { title: 'Introduction to ML', category: 'technology' }
    },
    {
      id: 'doc2',
      content: 'Deep Learning is part of a broader family of machine learning methods based on artificial neural networks. It uses multiple layers to progressively extract higher-level features from raw input.',
      metadata: { title: 'Deep Learning Fundamentals', category: 'technology' }
    },
    {
      id: 'doc3',
      content: 'Natural Language Processing (NLP) is a field of AI that gives machines the ability to read, understand, and derive meaning from human languages.',
      metadata: { title: 'NLP Overview', category: 'technology' }
    }
  ];
  
  for (const doc of sampleDocuments) {
    await dataSource.addDocument(doc);
    console.log(`   ✓ Added: ${doc.metadata.title}`);
  }
  console.log('');
  
  // ===== STEP 5: Create LLM =====
  console.log('🤖 Step 5: Configuring Groq LLM...');
  const llm = new GroqLLM({
    apiKey: GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile'
  });
  
  // ===== STEP 6: Create RAG Engine =====
  console.log('⚙️  Step 6: Creating RAG engine...');
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 3
  });
  
  await ragEngine.initialize();
  console.log('✅ RAG Engine ready!\n');
  
  // ===== STEP 7: Test Queries =====
  console.log('🎯 Step 7: Testing RAG queries...\n');
  
  const queries = [
    'What is machine learning?',
    'Explain deep learning',
    'What is NLP?'
  ];
  
  for (const query of queries) {
    console.log(`📝 Query: "${query}"`);
    console.log('─'.repeat(60));
    
    const result = await ragEngine.query(query);
    
    console.log(`💡 Answer: ${result.answer}`);
    console.log(`📚 Sources: ${result.sources.length} documents found`);
    result.sources.forEach((source, i) => {
      console.log(`   ${i + 1}. [${(source.score * 100).toFixed(1)}%] ${source.metadata?.title || source.id}`);
    });
    console.log('');
  }
  
  // ===== STEP 8: Show Elasticsearch Stats =====
  console.log('📊 Step 8: Elasticsearch Index Statistics:');
  const stats = await dataSource.getStats();
  console.log(`   Documents: ${stats.documentCount}`);
  console.log(`   Health: ${stats.health}`);
  console.log(`   Index: ${stats.indexName}\n`);
  
  // ===== Cleanup =====
  console.log('🧹 Cleaning up...');
  await ragEngine.close();
  console.log('👋 Done!\n');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  if (error.message.includes('MODULE_NOT_FOUND')) {
    console.error('\n💡 Install Elasticsearch client: npm install @elastic/elasticsearch');
  }
  process.exit(1);
});

