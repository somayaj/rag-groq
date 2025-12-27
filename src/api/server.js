import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create Express API server for RAG engine
 * @param {RAGEngine} ragEngine - Initialized RAG engine
 * @param {Object} options - Server options
 * @returns {express.Application} - Express app
 */
export function createAPIServer(ragEngine, options = {}) {
  const app = express();
  
  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Serve static files from public directory
  const publicPath = join(__dirname, '../../public');
  app.use(express.static(publicPath));

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', options.corsOrigin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      initialized: ragEngine.initialized
    });
  });

  // Get engine stats
  app.get('/stats', async (req, res) => {
    try {
      const stats = await ragEngine.getStatsAsync();
      if (ragEngine.guardrails) {
        stats.guardrails = ragEngine.guardrails.getStats();
      }
      res.json(stats);
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get guardrails configuration
  app.get('/guardrails', (req, res) => {
    try {
      if (!ragEngine.guardrails) {
        return res.json({ enabled: false });
      }
      res.json(ragEngine.guardrails.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update guardrails policies
  app.put('/guardrails', (req, res) => {
    try {
      if (!ragEngine.guardrails) {
        return res.status(404).json({ error: 'Guardrails not enabled' });
      }
      ragEngine.guardrails.updatePolicies(req.body);
      res.json({ 
        message: 'Policies updated',
        stats: ragEngine.guardrails.getStats()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Query endpoint
  app.post('/query', async (req, res) => {
    try {
      const { query, topK, history, systemPrompt, temperature, mode, userId } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      // mode options: 'auto', 'rag', 'hybrid', 'llm'
      // - hybrid (default): Quote data first, then add LLM knowledge
      // - rag: Only use retrieved context
      // - llm: Direct LLM without context
      // - auto: Automatically decide based on relevance
      const result = await ragEngine.query(query, {
        topK,
        history,
        systemPrompt,
        temperature,
        mode: mode || 'hybrid',
        userId: userId || req.ip // Use IP as user ID if not provided
      });

      // Return 403 if blocked by guardrails
      if (result.blocked) {
        return res.status(403).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Streaming query endpoint
  app.post('/query/stream', async (req, res) => {
    try {
      const { query, topK, systemPrompt, temperature, mode } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = ragEngine.queryStream(query, {
        topK,
        systemPrompt,
        temperature,
        mode: mode || 'hybrid'
      });

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error('Stream error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search/retrieve endpoint (without LLM generation)
  app.post('/search', async (req, res) => {
    try {
      const { query, topK = 5 } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const results = await ragEngine.retrieve(query, topK);
      res.json({ results, query });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add document endpoint
  app.post('/documents', async (req, res) => {
    try {
      const { content, metadata, id } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const docId = await ragEngine.addDocument({ id, content, metadata });
      res.status(201).json({ id: docId, message: 'Document added successfully' });
    } catch (error) {
      console.error('Add document error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all documents endpoint
  app.get('/documents', (req, res) => {
    try {
      const documents = ragEngine.dataSource.getDocuments();
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      res.json({
        documents: documents.slice(offset, offset + limit),
        total: documents.length,
        limit,
        offset
      });
    } catch (error) {
      console.error('Get documents error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update configuration endpoint
  app.put('/config', (req, res) => {
    try {
      const { topK, similarityThreshold, llmConfig } = req.body;

      if (topK || similarityThreshold !== undefined) {
        ragEngine.updateConfig({ topK, similarityThreshold });
      }

      if (llmConfig) {
        ragEngine.llm.updateConfig(llmConfig);
      }

      res.json({ 
        message: 'Configuration updated',
        stats: ragEngine.getStats()
      });
    } catch (error) {
      console.error('Config update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh index endpoint
  app.post('/refresh', async (req, res) => {
    try {
      await ragEngine.refresh();
      const stats = await ragEngine.getStatsAsync();
      res.json({ 
        message: 'Index refreshed',
        documentCount: stats.documentCount
      });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}

/**
 * Start the API server
 * @param {express.Application} app - Express app
 * @param {number} port - Port number
 * @param {string} host - Host address
 * @returns {Promise<http.Server>} - HTTP server instance
 */
export function startServer(app, port = 3000, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`🚀 RAG API server running at http://${host}:${port}`);
      console.log(`🌐 Web UI: http://localhost:${port}`);
      console.log(`📚 API Endpoints:`);
      console.log(`   POST /query        - Ask a question`);
      console.log(`   POST /query/stream - Ask with streaming response`);
      console.log(`   POST /search       - Search documents`);
      console.log(`   GET  /documents    - List documents`);
      console.log(`   POST /documents    - Add a document`);
      console.log(`   GET  /stats        - Get engine statistics`);
      console.log(`   GET  /health       - Health check`);
      resolve(server);
    });
  });
}

