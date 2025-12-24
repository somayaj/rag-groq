/**
 * rag-groq API Client Example
 * 
 * This example shows how to interact with the rag-groq REST API
 * from any JavaScript/Node.js application.
 * 
 * First, start the server: npm start
 * Then run: node examples/api-client.js
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

/**
 * Query the RAG API
 */
async function query(question, options = {}) {
  const response = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: question,
      topK: options.topK || 5,
      temperature: options.temperature,
      systemPrompt: options.systemPrompt
    })
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Search documents without LLM
 */
async function search(query, topK = 5) {
  const response = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK })
  });
  
  return response.json();
}

/**
 * Get all documents
 */
async function getDocuments(limit = 100, offset = 0) {
  const response = await fetch(`${API_BASE}/documents?limit=${limit}&offset=${offset}`);
  return response.json();
}

/**
 * Add a new document
 */
async function addDocument(content, metadata = {}) {
  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, metadata })
  });
  
  return response.json();
}

/**
 * Get API stats
 */
async function getStats() {
  const response = await fetch(`${API_BASE}/stats`);
  return response.json();
}

/**
 * Stream a query response
 */
async function queryStream(question, onChunk) {
  const response = await fetch(`${API_BASE}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value);
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        onChunk(data);
      }
    }
  }
}

// ===== MAIN =====

async function main() {
  console.log('🚀 rag-groq API Client Example\n');
  console.log(`📡 Connecting to: ${API_BASE}\n`);
  
  try {
    // Check API status
    const stats = await getStats();
    console.log('📊 API Stats:', stats);
    console.log('');
    
    // List documents
    console.log('📄 Documents in database:');
    const docs = await getDocuments(5);
    docs.documents.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.metadata?.title || doc.id}`);
    });
    console.log(`   ... (${docs.total} total)\n`);
    
    // Query with RAG
    console.log('📝 Querying: "What is machine learning?"\n');
    const result = await query('What is machine learning?');
    console.log('💡 Answer:', result.answer.substring(0, 200) + '...\n');
    console.log(`📚 Used ${result.sources.length} sources\n`);
    
    // Search only (no LLM)
    console.log('🔍 Searching: "Python data"\n');
    const searchResult = await search('Python data', 3);
    searchResult.results.forEach((r, i) => {
      console.log(`   ${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.metadata?.title || r.id}`);
    });
    console.log('');
    
    // Streaming example
    console.log('🌊 Streaming query: "Explain deep learning briefly"\n');
    console.log('Response: ');
    await queryStream('Explain deep learning briefly', (chunk) => {
      if (chunk.type === 'content') {
        process.stdout.write(chunk.content);
      } else if (chunk.type === 'done') {
        console.log('\n');
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Make sure the server is running: npm start');
  }
}

main();

