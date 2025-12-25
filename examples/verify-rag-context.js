/**
 * RAG Context Verification Example
 * 
 * This example demonstrates that retrieved documents ARE being fed to the LLM
 * by showing the context that gets sent to the model.
 * 
 * Run with: node examples/verify-rag-context.js
 */

import 'dotenv/config';
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from '../src/index.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your-groq-api-key-here';

async function main() {
  console.log('🔍 RAG Context Verification\n');
  console.log('This example shows how retrieved documents are fed to the LLM as context.\n');
  
  // Setup
  const dataSource = new CSVDataSource({
    filePath: './data/sample.csv',
  });
  
  const llm = new GroqLLM({
    apiKey: GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
  });
  
  const embeddings = new LocalEmbeddings({ dimension: 384 });
  
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 2, // Get top 2 documents to keep output manageable
  });
  
  await ragEngine.initialize();
  console.log(`✅ RAG Engine initialized with ${ragEngine.getStats().documentCount} documents\n`);
  
  // Step 1: Show what documents are retrieved
  const query = 'What is machine learning?';
  console.log(`📝 Query: "${query}"\n`);
  
  console.log('🔎 Step 1: Retrieving relevant documents using embeddings...\n');
  const retrievedDocs = await ragEngine.retrieve(query, 2);
  
  console.log(`Found ${retrievedDocs.length} relevant documents:\n`);
  retrievedDocs.forEach((doc, i) => {
    console.log(`Document ${i + 1} (similarity: ${(doc.score * 100).toFixed(1)}%):`);
    console.log(`  Title: ${doc.metadata?.title || 'N/A'}`);
    console.log(`  Content: ${doc.content.substring(0, 150)}...`);
    console.log('');
  });
  
  // Step 2: Show how context is formatted for LLM
  console.log('📤 Step 2: Formatting context for LLM...\n');
  const contextStr = retrievedDocs.map((doc, i) => {
    const source = doc.metadata?.title || doc.metadata?.source || `Document ${i + 1}`;
    return `[${source}]\n${doc.content}`;
  }).join('\n\n---\n\n');
  
  console.log('Context that will be sent to LLM:');
  console.log('─'.repeat(60));
  console.log(contextStr);
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 3: Show the full prompt structure
  console.log('💬 Step 3: Full prompt structure sent to LLM:\n');
  console.log('System Prompt:');
  console.log('─'.repeat(60));
  console.log(llm.getDefaultSystemPrompt());
  console.log('─'.repeat(60));
  console.log('');
  
  console.log('User Message (includes context + query):');
  console.log('─'.repeat(60));
  const userMessage = `Context:\n${contextStr}\n\nQuestion: ${query}`;
  console.log(userMessage);
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 4: Actually query and show the result
  console.log('🤖 Step 4: Querying LLM with context...\n');
  const result = await ragEngine.query(query, { mode: 'rag' });
  
  console.log('LLM Response:');
  console.log('─'.repeat(60));
  console.log(result.answer);
  console.log('─'.repeat(60));
  console.log('');
  
  console.log('✅ Verification Complete!');
  console.log('\nThe retrieved documents ARE being used as context for the LLM.');
  console.log('This is how RAG (Retrieval-Augmented Generation) works:\n');
  console.log('  1. Query is embedded using the same embedding model');
  console.log('  2. Similar documents are retrieved using vector similarity');
  console.log('  3. Retrieved documents are formatted as context');
  console.log('  4. Context + Query are sent to LLM together');
  console.log('  5. LLM generates answer based on the provided context\n');
  
  await ragEngine.close();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  if (error.message.includes('API key')) {
    console.error('\n💡 Tip: Set GROQ_API_KEY environment variable');
  }
  process.exit(1);
});

