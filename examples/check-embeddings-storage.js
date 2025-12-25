/**
 * Check Where Embeddings Are Stored
 * 
 * This script demonstrates where embeddings are stored in the RAG system
 */

import 'dotenv/config';
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from '../src/index.js';

async function main() {
  console.log('🔍 Checking Where Embeddings Are Stored\n');
  
  // Setup
  const dataSource = new CSVDataSource({
    filePath: './data/sample.csv',
  });
  
  const llm = new GroqLLM({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
  });
  
  const embeddings = new LocalEmbeddings({ dimension: 384 });
  
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 3,
  });
  
  console.log('📊 Before Initialization:');
  console.log(`   documentVectors size: ${ragEngine.documentVectors.size}`);
  console.log(`   embeddings vocabulary size: ${embeddings.vocabulary.size}`);
  console.log(`   embeddings initialized: ${embeddings.initialized}\n`);
  
  await ragEngine.initialize();
  
  console.log('📊 After Initialization:');
  console.log(`   documentVectors size: ${ragEngine.documentVectors.size}`);
  console.log(`   embeddings vocabulary size: ${embeddings.vocabulary.size}`);
  console.log(`   embeddings initialized: ${embeddings.initialized}\n`);
  
  // Show where embeddings are stored
  console.log('📍 Storage Locations:\n');
  console.log('1. Document Embeddings (Vectors):');
  console.log('   Location: ragEngine.documentVectors (JavaScript Map)');
  console.log('   Type: In-memory only');
  console.log('   Persisted: ❌ NO - Recalculated on each initialization');
  console.log(`   Current count: ${ragEngine.documentVectors.size} documents\n`);
  
  console.log('2. TF-IDF Vocabulary:');
  console.log('   Location: embeddings.vocabulary (JavaScript Map)');
  console.log('   Type: In-memory only');
  console.log('   Persisted: ❌ NO - Rebuilt on each initialization');
  console.log(`   Current size: ${embeddings.vocabulary.size} terms\n`);
  
  console.log('3. IDF Values:');
  console.log('   Location: embeddings.idf (JavaScript Map)');
  console.log('   Type: In-memory only');
  console.log('   Persisted: ❌ NO - Recalculated on each initialization');
  console.log(`   Current size: ${embeddings.idf.size} terms\n`);
  
  // Show a sample embedding
  if (ragEngine.documentVectors.size > 0) {
    const firstDoc = Array.from(ragEngine.documentVectors.values())[0];
    console.log('📐 Sample Embedding Vector:');
    console.log(`   Document ID: ${firstDoc.id}`);
    console.log(`   Vector dimension: ${firstDoc.vector.length}`);
    console.log(`   Vector (first 10 values): [${firstDoc.vector.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   Vector type: Array<number> (in memory)\n`);
  }
  
  console.log('💡 Notes:');
  console.log('   - Embeddings are stored in RAM only (not on disk)');
  console.log('   - They are recalculated every time you initialize the RAG engine');
  console.log('   - For persistent storage, use Pinecone data source');
  console.log('   - The original documents are stored in your data source (CSV, files, etc.)\n');
  
  await ragEngine.close();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

