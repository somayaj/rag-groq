/**
 * rag-groq Basic Usage Example
 * 
 * This example demonstrates how to use rag-groq programmatically
 * to query your data and get LLM-powered answers.
 * 
 * Run with: node examples/basic-usage.js
 */

import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from '../src/index.js';

// Configuration - Replace with your Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your-groq-api-key-here';

/**
 * Helper function to ask a question and display the result
 */
async function askQuestion(ragEngine, question) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📝 QUESTION: ${question}`);
  console.log('─'.repeat(60));
  
  const startTime = Date.now();
  const result = await ragEngine.query(question);
  const elapsed = Date.now() - startTime;
  
  console.log(`\n💡 ANSWER:\n`);
  console.log(result.answer);
  
  console.log(`\n📚 SOURCES USED (${result.sources.length} documents):`);
  result.sources.forEach((source, i) => {
    const score = (source.score * 100).toFixed(0);
    const title = source.metadata?.title || source.id;
    console.log(`   ${i + 1}. [${score}% match] ${title}`);
  });
  
  console.log(`\n⏱️  Response time: ${elapsed}ms`);
  
  return result;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 rag-groq Basic Usage Example\n');
  
  // ===== STEP 1: Create Data Source =====
  console.log('📂 Step 1: Setting up CSV data source...');
  const dataSource = new CSVDataSource({
    filePath: './data/sample.csv',
    // contentColumn: 'content',  // Uncomment to use specific column
    // idColumn: 'id',            // Uncomment to use specific ID column
  });
  
  // ===== STEP 2: Create LLM =====
  console.log('🤖 Step 2: Configuring Groq LLM...');
  const llm = new GroqLLM({
    apiKey: GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 1024,
    // Custom system prompt (optional)
    systemPrompt: `You are a knowledgeable assistant that answers questions based on the provided context.
    Be concise but thorough. If the context doesn't contain enough information, say so.`
  });
  
  // ===== STEP 3: Create Embeddings =====
  console.log('🔍 Step 3: Setting up local embeddings...');
  const embeddings = new LocalEmbeddings({
    dimension: 384
  });
  
  // ===== STEP 4: Create RAG Engine =====
  console.log('⚙️  Step 4: Creating RAG engine...');
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 3,                  // Number of documents to retrieve
    similarityThreshold: 0.2  // Minimum similarity score
  });
  
  // ===== STEP 5: Initialize =====
  console.log('🔄 Step 5: Initializing RAG engine...');
  await ragEngine.initialize();
  
  const stats = ragEngine.getStats();
  console.log(`\n✅ RAG Engine Ready!`);
  console.log(`   Documents indexed: ${stats.documentCount}`);
  console.log(`   LLM Model: ${stats.llmModel}`);
  console.log(`   Top-K: ${stats.topK}`);
  
  // ===== STEP 6: Query =====
  console.log('\n🎯 Step 6: Querying the RAG system...');
  
  // Example questions
  await askQuestion(ragEngine, 'What is machine learning?');
  await askQuestion(ragEngine, 'What Python libraries are good for data analysis?');
  await askQuestion(ragEngine, 'Explain database design principles');
  
  // ===== STEP 7: Search Only (No LLM) =====
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🔎 BONUS: Search without LLM generation');
  console.log('─'.repeat(60));
  
  const searchResults = await ragEngine.retrieve('neural networks', 3);
  console.log('\nTop 3 documents matching "neural networks":');
  searchResults.forEach((doc, i) => {
    console.log(`   ${i + 1}. [${(doc.score * 100).toFixed(0)}%] ${doc.metadata?.title || doc.id}`);
    console.log(`      ${doc.content.substring(0, 100)}...`);
  });
  
  // ===== Cleanup =====
  console.log('\n🧹 Cleaning up...');
  await ragEngine.close();
  console.log('👋 Done!\n');
}

// Run the example
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

