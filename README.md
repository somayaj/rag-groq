# RAG-JS

A **Retrieval-Augmented Generation (RAG)** package for Node.js that integrates multiple data sources with Groq's lightning-fast LLM API for intelligent question-answering.

## Features

- 🚀 **Multiple Data Sources**: CSV files, SQLite, PostgreSQL, and Pinecone vector database
- ⚡ **Groq LLM Integration**: Ultra-fast inference with Llama 3.3, Mixtral, and more
- 🔍 **Smart Retrieval**: TF-IDF based local embeddings with cosine similarity search
- 🌐 **REST API**: Ready-to-use Express server with streaming support
- 📦 **Modular Design**: Use as a library or standalone server
- 🔧 **Highly Configurable**: Customize every aspect of the RAG pipeline

## Installation

```bash
npm install @somayajulaas/rag-js
```

Or clone and install locally:

```bash
git clone <repository-url>
cd rag-js
npm install
```

## Quick Start

### 1. Set up environment variables

Create a `.env` file:

```env
GROQ_API_KEY=your_groq_api_key_here
DATASOURCE_TYPE=csv
CSV_FILE_PATH=./data/sample.csv
PORT=3000
```

### 2. Start the server

```bash
npm start
```

### 3. Query your data

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?"}'
```

## Usage as a Library

### Quick Setup (Recommended)

```javascript
import { createRAGAPI, createDataSource } from '@somayajulaas/rag-js';

// 1. Create a data source (CSV, SQLite, PostgreSQL, or Pinecone)
const dataSource = createDataSource('csv', {
  filePath: './data/mydata.csv',
  contentColumn: 'text'  // Column containing the text to search
});

// 2. Create the RAG API with your Groq API key
const { app, ragEngine } = await createRAGAPI({
  groqApiKey: 'your-groq-api-key',
  dataSource,
  topK: 5,                           // Number of documents to retrieve
  model: 'llama-3.3-70b-versatile'   // Groq LLM model
});

// 3. Start the server
app.listen(3000, () => {
  console.log('RAG API running on http://localhost:3000');
});
```

### Programmatic Usage (Without Server)

Use the RAG engine directly in your Node.js application without starting a server:

```javascript
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from '@somayajulaas/rag-js';

async function main() {
  // Step 1: Configure your data source
  const dataSource = new CSVDataSource({
    filePath: './data/knowledge.csv',
    contentColumn: 'content',  // Which column contains the searchable text
    idColumn: 'id'             // Which column is the unique identifier
  });

  // Step 2: Configure the Groq LLM
  const llm = new GroqLLM({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,      // Higher = more creative, Lower = more focused
    maxTokens: 2048        // Maximum response length
  });

  // Step 3: Configure embeddings for semantic search
  const embeddings = new LocalEmbeddings({ 
    dimension: 384  // Vector dimension for similarity matching
  });

  // Step 4: Create the RAG engine
  const ragEngine = new RAGEngine({
    dataSource,
    llm,
    embeddings,
    topK: 5,                  // Retrieve top 5 most relevant documents
    similarityThreshold: 0.3  // Minimum similarity score (0-1)
  });

  // Step 5: Initialize (loads documents, builds index)
  await ragEngine.initialize();
  console.log(`Loaded ${ragEngine.getStats().documentCount} documents`);

  // Step 6: Query and get LLM analysis
  const result = await ragEngine.query('What is machine learning?');
  
  // The result contains:
  console.log('Answer:', result.answer);        // LLM-generated response
  console.log('Sources:', result.sources);      // Retrieved documents used
  console.log('Query:', result.query);          // Original question

  // Clean up when done
  await ragEngine.close();
}

main();
```

### Understanding the RAG Pipeline

The RAG (Retrieval-Augmented Generation) process works in 3 steps:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  1. QUERY   │────▶│  2. RETRIEVE │────▶│ 3. GENERATE │
│             │     │              │     │             │
│ User asks   │     │ Find similar │     │ LLM creates │
│ a question  │     │ documents    │     │ answer from │
│             │     │ using        │     │ context     │
│             │     │ embeddings   │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

**Example Response Structure:**

```javascript
{
  // The LLM-generated answer based on retrieved context
  answer: "Machine learning is a subset of AI that enables systems to learn...",
  
  // Documents that were retrieved and used as context
  sources: [
    {
      id: "doc_1",
      content: "Machine Learning is a subset of artificial intelligence...",
      metadata: { title: "ML Introduction", category: "technology" },
      score: 0.85  // Similarity score (0-1, higher is more relevant)
    },
    // ... more sources
  ],
  
  // The original question
  query: "What is machine learning?"
}
```

### Retrieve Without LLM (Search Only)

If you only want to search documents without LLM analysis:

```javascript
// Get relevant documents without generating an LLM response
const documents = await ragEngine.retrieve('machine learning', 5);

documents.forEach(doc => {
  console.log(`[${doc.score.toFixed(2)}] ${doc.content}`);
});
```

### Complete Example Script

Create a file `example.js`:

```javascript
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from '@somayajulaas/rag-js';

const GROQ_API_KEY = 'your-groq-api-key';

async function askQuestion(ragEngine, question) {
  console.log(`\n📝 Question: ${question}`);
  console.log('─'.repeat(50));
  
  const result = await ragEngine.query(question);
  
  console.log(`\n💡 Answer:\n${result.answer}`);
  
  console.log(`\n📚 Sources used (${result.sources.length}):`);
  result.sources.forEach((source, i) => {
    console.log(`  ${i + 1}. [Score: ${(source.score * 100).toFixed(0)}%] ${source.metadata?.title || source.id}`);
  });
  
  return result;
}

async function main() {
  // Initialize RAG with CSV data
  const ragEngine = new RAGEngine({
    dataSource: new CSVDataSource({
      filePath: './data/sample.csv',
      contentColumn: 'content'
    }),
    llm: new GroqLLM({
      apiKey: GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile'
    }),
    embeddings: new LocalEmbeddings(),
    topK: 3
  });

  await ragEngine.initialize();
  console.log('✅ RAG Engine initialized');

  // Ask multiple questions
  await askQuestion(ragEngine, 'What is deep learning?');
  await askQuestion(ragEngine, 'What Python libraries are used for data analysis?');
  await askQuestion(ragEngine, 'Explain database design principles');

  await ragEngine.close();
}

main().catch(console.error);
```

Run with:
```bash
node example.js
```

### Advanced: Custom System Prompts for LLM

Control how the LLM analyzes and responds:

```javascript
const llm = new GroqLLM({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile',
  systemPrompt: `You are a technical documentation expert.
    
    When answering questions:
    - Be precise and cite specific information from the context
    - Use bullet points for clarity
    - If the context doesn't contain the answer, say so
    - Provide code examples when relevant`
});

// Or override per-query:
const result = await ragEngine.query('How do I use pandas?', {
  systemPrompt: 'You are a Python expert. Provide code examples.',
  temperature: 0.3  // More focused responses
});
```

### Advanced: Adding Documents at Runtime

```javascript
// Add new documents dynamically
await ragEngine.addDocument({
  content: 'GraphQL is a query language for APIs...',
  metadata: { 
    title: 'GraphQL Introduction',
    category: 'technology',
    author: 'John Doe'
  }
});

// Refresh the index to include new documents
await ragEngine.refresh();

// Now queries will include the new document
const result = await ragEngine.query('What is GraphQL?');
```

### Advanced: Streaming Responses

For real-time response streaming:

```javascript
// Stream the response as it's generated
for await (const chunk of ragEngine.queryStream('Explain neural networks')) {
  if (chunk.type === 'sources') {
    console.log('Retrieved sources:', chunk.sources.length);
  } else if (chunk.type === 'content') {
    process.stdout.write(chunk.content);  // Print without newline
  } else if (chunk.type === 'done') {
    console.log('\n\nStream complete!');
  }
}
```

## Data Sources

### CSV

```javascript
import { CSVDataSource } from '@somayajulaas/rag-js';

const dataSource = new CSVDataSource({
  filePath: './data/documents.csv',
  contentColumn: 'text',      // Column containing main content
  idColumn: 'id',             // Column for document IDs
  delimiter: ','              // CSV delimiter
});
```

### SQLite

```javascript
import { SQLiteDataSource } from '@somayajulaas/rag-js';

const dataSource = new SQLiteDataSource({
  dbPath: './data/knowledge.sqlite',
  tableName: 'documents',
  contentColumn: 'content',
  idColumn: 'id'
});
```

### PostgreSQL

```javascript
import { PostgresDataSource } from '@somayajulaas/rag-js';

const dataSource = new PostgresDataSource({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'ragdb',
  tableName: 'documents',
  contentColumn: 'content'
});
```

### Pinecone

```javascript
import { PineconeDataSource } from '@somayajulaas/rag-js';

const dataSource = new PineconeDataSource({
  apiKey: process.env.PINECONE_API_KEY,
  indexName: 'my-index',
  namespace: 'documents'
});

// Set embedding function for text-to-vector conversion
dataSource.setEmbeddingFunction(async (text) => {
  // Return vector array
  return await embeddings.embed(text);
});
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/query` | Ask a question with RAG |
| POST | `/query/stream` | Streaming response |
| POST | `/search` | Search documents without LLM |
| GET | `/documents` | List all documents |
| POST | `/documents` | Add a new document |
| GET | `/stats` | Get engine statistics |
| PUT | `/config` | Update configuration |
| POST | `/refresh` | Refresh document index |
| GET | `/health` | Health check |

### Query Request

```json
{
  "query": "What is machine learning?",
  "topK": 5,
  "temperature": 0.7,
  "systemPrompt": "You are a helpful assistant..."
}
```

### Query Response

```json
{
  "answer": "Machine learning is a subset of artificial intelligence...",
  "sources": [
    {
      "id": "1",
      "content": "Machine Learning is a subset...",
      "metadata": { "category": "technology" },
      "score": 0.85
    }
  ],
  "query": "What is machine learning?"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key (required) | - |
| `PORT` | Server port | 3000 |
| `HOST` | Server host | 0.0.0.0 |
| `DATASOURCE_TYPE` | Data source type | csv |
| `CSV_FILE_PATH` | Path to CSV file | - |
| `CSV_CONTENT_COLUMN` | Content column name | - |
| `CSV_ID_COLUMN` | ID column name | - |
| `SQLITE_DB_PATH` | SQLite database path | ./data/database.sqlite |
| `POSTGRES_HOST` | PostgreSQL host | localhost |
| `POSTGRES_PORT` | PostgreSQL port | 5432 |
| `POSTGRES_USER` | PostgreSQL user | postgres |
| `POSTGRES_PASSWORD` | PostgreSQL password | - |
| `POSTGRES_DATABASE` | PostgreSQL database | - |
| `PINECONE_API_KEY` | Pinecone API key | - |
| `PINECONE_INDEX_NAME` | Pinecone index name | - |
| `TOP_K_RESULTS` | Number of documents to retrieve | 5 |
| `GROQ_MODEL` | Groq model to use | llama-3.3-70b-versatile |

### Groq Models

Available models include:
- `llama-3.3-70b-versatile` (recommended)
- `llama-3.1-70b-versatile`
- `llama-3.1-8b-instant`
- `mixtral-8x7b-32768`
- `gemma2-9b-it`

## Custom System Prompts

```javascript
const llm = new GroqLLM({
  apiKey: 'your-key',
  systemPrompt: `You are a technical expert assistant.
    Always provide code examples when relevant.
    Be concise but thorough.`
});
```

## Streaming Responses

```javascript
// Using the API
const response = await fetch('http://localhost:3000/query/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'Explain neural networks' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'content') {
        process.stdout.write(data.content);
      }
    }
  }
}
```

```javascript
// Using the library directly
for await (const chunk of ragEngine.queryStream('Explain neural networks')) {
  if (chunk.type === 'content') {
    process.stdout.write(chunk.content);
  }
}
```

## Adding Documents Dynamically

```javascript
// Via API
await fetch('http://localhost:3000/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'New document content here...',
    metadata: { source: 'manual', category: 'tech' }
  })
});

// Via library
await ragEngine.addDocument({
  content: 'New document content here...',
  metadata: { source: 'manual' }
});
```

## Web UI

RAG-JS includes a built-in web interface for querying your data:

1. Start the server: `npm start`
2. Open `http://localhost:3000` in your browser
3. Ask questions in the chat interface

Features:
- 💬 Conversational chat interface
- 📚 Source panel showing retrieved documents with relevance scores
- 📊 Real-time stats display
- 🎨 Modern dark theme with glassmorphism design

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        RAG-JS                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   API       │  │  RAG Engine │  │    Data Sources     │  │
│  │   Server    │──│             │──│  ┌───┐ ┌───┐ ┌───┐  │  │
│  │  (Express)  │  │  Retrieve   │  │  │CSV│ │DB │ │PC │  │  │
│  └─────────────┘  │  + Generate │  │  └───┘ └───┘ └───┘  │  │
│                   └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Embeddings  │  │  Groq LLM   │  │     Web UI          │  │
│  │  (TF-IDF)   │  │  (Llama 3)  │  │   (Tailwind CSS)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

