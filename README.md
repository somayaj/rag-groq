# rag-groq

A **Retrieval-Augmented Generation (RAG)** package for Node.js that integrates multiple data sources with Groq's lightning-fast LLM API for intelligent question-answering.

## Features

- 📁 **Multiple File Types**: CSV, TXT, PDF, Excel (XLSX/XLS), JSON, Markdown
- 🚀 **Multiple Data Sources**: Files/folders, SQLite, PostgreSQL, Pinecone vector database, and Elasticsearch
- ⚡ **Groq LLM Integration**: Ultra-fast inference with Llama 3.3, Mixtral, and more
- 🔍 **Smart Retrieval**: TF-IDF based local embeddings with cosine similarity search
- 🧠 **Hybrid Query Mode**: Quotes your data first, then supplements with LLM knowledge
- 🎯 **Smart Routing**: Automatically decides when to use RAG vs direct LLM
- 🌐 **REST API**: Ready-to-use Express server with streaming support
- 📦 **Modular Design**: Use as a library or standalone server
- 🔧 **Highly Configurable**: Customize every aspect of the RAG pipeline

## Installation

```bash
npm install rag-groq
```

Or clone and install locally:

```bash
git clone <repository-url>
cd rag-groq
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

## Query Modes

rag-groq supports multiple query modes to intelligently combine your data with LLM knowledge:

| Mode | Description | Use Case |
|------|-------------|----------|
| **`hybrid`** (default) | Quotes data first, then adds LLM knowledge | Best of both worlds |
| **`rag`** | Only uses retrieved context from your data | Strict data-only answers |
| **`llm`** | Direct LLM without any data context | General knowledge questions |
| **`auto`** | Smart routing based on relevance scores | Automatic optimization |

### Hybrid Mode (Default)

The hybrid mode first searches your data and quotes relevant information, then supplements with additional knowledge from the LLM:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?", "mode": "hybrid"}'
```

**Response format:**
```
From your data:
"Machine Learning is a subset of artificial intelligence that enables systems 
to learn and improve from experience without being explicitly programmed."

Additional information:
Machine learning has many real-world applications including image recognition,
natural language processing, recommendation systems, and autonomous vehicles...
```

### Pure RAG Mode

Only answers based on your data - no LLM supplementation:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?", "mode": "rag"}'
```

### Direct LLM Mode

Bypasses your data entirely for general knowledge questions:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the capital of France?", "mode": "llm"}'
```

### Auto Mode

Automatically decides the best mode based on how relevant your data is to the query:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about Python", "mode": "auto"}'
```

## Usage as a Library

### Quick Setup (Recommended)

```javascript
import { createRAGAPI, createDataSource } from 'rag-groq';

// 1. Create a data source (CSV, SQLite, PostgreSQL, Pinecone, or Elasticsearch)
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
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from 'rag-groq';

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
import { RAGEngine, CSVDataSource, GroqLLM, LocalEmbeddings } from 'rag-groq';

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

### Files & Folders (Recommended)

Load all supported files from a directory automatically:

```javascript
import { FileDataSource } from 'rag-groq';

// Load all files from a folder
const dataSource = new FileDataSource({
  path: './data',              // File or directory path
  recursive: false,            // Scan subdirectories
  extensions: ['.csv', '.txt', '.pdf', '.xlsx', '.xls', '.json', '.md'],
  chunkSize: 1000,             // Characters per chunk for large files
  chunkOverlap: 200            // Overlap between chunks
});
```

**Supported file types:**
| Extension | Description |
|-----------|-------------|
| `.csv` | Comma-separated values (each row becomes a document) |
| `.txt` | Plain text files (chunked automatically) |
| `.pdf` | PDF documents (requires `pdf-parse`) |
| `.xlsx`, `.xls` | Excel spreadsheets (each row becomes a document) |
| `.json` | JSON files (arrays become multiple documents) |
| `.md` | Markdown files (chunked automatically) |

**Environment variables:**
```env
DATASOURCE_TYPE=file
DATA_PATH=./data
RECURSIVE=false
CHUNK_SIZE=1000
WATCH=true
```

### Auto-Refresh (File Watching)

The server automatically watches for file changes and refreshes the index:

```bash
# Enabled by default
DATASOURCE_TYPE=file DATA_PATH=./data npm start

# Disable auto-refresh
WATCH=false npm start
```

When files are added, changed, or deleted:
```
📁 File added: newfile.txt, refreshing index...
✅ Index refreshed: 100 → 101 documents
🔄 RAG index rebuilt with 101 documents
```

**Programmatic usage:**
```javascript
import { FileDataSource } from 'rag-groq';

const dataSource = new FileDataSource({
  path: './data',
  watch: true,                    // Enable file watching
  watchDebounce: 2000,            // Wait 2s before refresh (handles batch changes)
  onRefresh: (docCount, event, file) => {
    console.log(`Refreshed: ${docCount} documents after ${event} on ${file}`);
  }
});

await dataSource.initialize();
await dataSource.startWatching();  // Start watching for changes
```

### CSV

```javascript
import { CSVDataSource } from 'rag-groq';

const dataSource = new CSVDataSource({
  filePath: './data/documents.csv',
  contentColumn: 'text',      // Column containing main content
  idColumn: 'id',             // Column for document IDs
  delimiter: ','              // CSV delimiter
});
```

### SQLite

```javascript
import { SQLiteDataSource } from 'rag-groq';

const dataSource = new SQLiteDataSource({
  dbPath: './data/knowledge.sqlite',
  tableName: 'documents',
  contentColumn: 'content',
  idColumn: 'id'
});
```

### PostgreSQL

```javascript
import { PostgresDataSource } from 'rag-groq';

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
import { PineconeDataSource } from 'rag-groq';

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

### Elasticsearch

Elasticsearch provides both full-text search and vector search capabilities:

```javascript
import { ElasticsearchDataSource } from 'rag-groq';

const dataSource = new ElasticsearchDataSource({
  node: 'http://localhost:9200',        // Elasticsearch node URL
  indexName: 'rag-documents',          // Index name
  dimension: 384,                       // Vector dimension
  contentField: 'content',              // Field containing document content
  idField: 'id',                       // Field for document IDs
  
  // Authentication (choose one):
  username: process.env.ELASTICSEARCH_USERNAME,
  password: process.env.ELASTICSEARCH_PASSWORD,
  // OR
  // apiKey: process.env.ELASTICSEARCH_API_KEY,
  // OR for Elastic Cloud:
  // cloudId: process.env.ELASTICSEARCH_CLOUD_ID
});

// Set embedding function for vector search (optional but recommended)
dataSource.setEmbeddingFunction(async (text) => {
  return await embeddings.embed(text);
});
```

**Features:**
- 🔍 **Hybrid Search**: Combines full-text search with vector similarity search
- 📊 **Automatic Index Management**: Creates index with proper mappings automatically
- 🔐 **Multiple Auth Methods**: Username/password, API key, or Cloud ID
- ⚡ **Production Ready**: Suitable for large-scale deployments

**Environment variables:**
```env
DATASOURCE_TYPE=elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX_NAME=rag-documents
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password
ELASTICSEARCH_DIMENSION=384
```

**Quick setup with Docker:**
```bash
# Start Elasticsearch locally
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  docker.elastic.co/elasticsearch/elasticsearch:8.15.0
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
| `ELASTICSEARCH_NODE` | Elasticsearch node URL | http://localhost:9200 |
| `ELASTICSEARCH_INDEX_NAME` | Elasticsearch index name | rag-documents |
| `ELASTICSEARCH_USERNAME` | Elasticsearch username | - |
| `ELASTICSEARCH_PASSWORD` | Elasticsearch password | - |
| `ELASTICSEARCH_API_KEY` | Elasticsearch API key | - |
| `ELASTICSEARCH_CLOUD_ID` | Elastic Cloud ID | - |
| `ELASTICSEARCH_DIMENSION` | Vector dimension | 384 |
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

rag-groq includes a built-in web interface for querying your data:

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
│                        rag-groq                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   API       │  │  RAG Engine │  │    Data Sources     │  │
│  │   Server    │──│             │──│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ │  │
│  │  (Express)  │  │  Retrieve   │  │  │CSV│ │DB │ │PC │ │ES │ │  │
│  └─────────────┘  │  + Generate │  │  └───┘ └───┘ └───┘ └───┘ │  │
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

