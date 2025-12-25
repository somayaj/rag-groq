/**
 * RAG Engine
 * Orchestrates the retrieval-augmented generation pipeline
 */
export class RAGEngine {
  constructor(config = {}) {
    this.dataSource = config.dataSource;
    this.llm = config.llm;
    this.embeddings = config.embeddings;
    this.guardrails = config.guardrails; // Guardrails instance
    this.topK = config.topK || 10;
    this.similarityThreshold = config.similarityThreshold || 0.15; // Lower threshold for better recall
    this.smartRouting = config.smartRouting ?? true; // Enable smart routing by default
    this.routingThreshold = config.routingThreshold || 0.25; // Min score to use RAG
    this.documentVectors = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the RAG engine
   */
  async initialize() {
    if (!this.dataSource) {
      throw new Error('Data source is required');
    }

    if (!this.llm) {
      throw new Error('LLM is required');
    }

    // Initialize data source
    if (!this.dataSource.initialized) {
      await this.dataSource.initialize();
    }

    // Initialize LLM
    await this.llm.initialize();

    // Initialize embeddings and build index
    if (this.embeddings) {
      const documents = this.dataSource.getDocuments();
      const texts = documents.map(d => d.content);
      
      await this.embeddings.initialize(texts);
      
      // Generate embeddings for all documents
      await this.buildVectorIndex();
    }

    this.initialized = true;
  }

  /**
   * Build vector index for all documents
   */
  async buildVectorIndex() {
    const documents = this.dataSource.getDocuments();
    
    for (const doc of documents) {
      const vector = await this.embeddings.embed(doc.content);
      this.documentVectors.set(doc.id, {
        ...doc,
        vector
      });
    }
  }

  /**
   * Add a document to the index
   * @param {Object} document - Document to add
   * @returns {Promise<string>} - Document ID
   */
  async addDocument(document) {
    const id = await this.dataSource.addDocument(document);
    
    if (this.embeddings) {
      const vector = await this.embeddings.embed(document.content);
      this.documentVectors.set(id, {
        id,
        content: document.content,
        metadata: document.metadata || {},
        vector
      });
    }
    
    return id;
  }

  /**
   * Retrieve relevant documents for a query
   * @param {string} query - Search query
   * @param {number} topK - Number of documents to retrieve
   * @returns {Promise<Array>} - Retrieved documents with scores
   */
  async retrieve(query, topK = this.topK) {
    // Use vector similarity if embeddings are available
    if (this.embeddings && this.documentVectors.size > 0) {
      return this.retrieveByVector(query, topK);
    }
    
    // Fallback to data source's search
    return this.dataSource.search(query, topK);
  }

  /**
   * Retrieve documents using vector similarity
   * @param {string} query - Search query
   * @param {number} topK - Number of documents to retrieve
   * @returns {Promise<Array>} - Retrieved documents with scores
   */
  async retrieveByVector(query, topK) {
    const queryVector = await this.embeddings.embed(query);
    
    const documents = Array.from(this.documentVectors.values());
    const similarities = this.embeddings.findSimilar(
      queryVector,
      documents,
      topK * 2 // Get more candidates for filtering
    );

    // Filter by threshold and limit
    const results = [];
    for (const { id, score } of similarities) {
      if (score >= this.similarityThreshold && results.length < topK) {
        const doc = this.documentVectors.get(id);
        results.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          score
        });
      }
    }

    // If no results pass threshold, return top results anyway
    if (results.length === 0 && similarities.length > 0) {
      for (const { id, score } of similarities.slice(0, topK)) {
        const doc = this.documentVectors.get(id);
        results.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          score
        });
      }
    }

    return results;
  }

  /**
   * Determine if query should use RAG or direct LLM
   * @param {string} query - User's question
   * @returns {Promise<Object>} - Routing decision with reason
   */
  async routeQuery(query) {
    // Get top matches and check their scores
    const retrievedDocs = await this.retrieve(query, this.topK);
    
    if (retrievedDocs.length === 0) {
      return { useRAG: false, reason: 'no_documents', docs: [] };
    }

    const topScore = retrievedDocs[0]?.score || 0;
    const avgScore = retrievedDocs.reduce((sum, d) => sum + d.score, 0) / retrievedDocs.length;

    // If top document score is below threshold, likely a general question
    if (topScore < this.routingThreshold) {
      return { 
        useRAG: false, 
        reason: 'low_relevance', 
        topScore,
        avgScore,
        docs: retrievedDocs 
      };
    }

    return { 
      useRAG: true, 
      reason: 'relevant_content', 
      topScore,
      avgScore,
      docs: retrievedDocs 
    };
  }

  /**
   * Query the RAG system with smart routing
   * Automatically decides whether to use RAG, hybrid, or direct LLM
   * @param {string} query - User's question
   * @param {Object} options - Query options
   * @param {string} options.mode - Force mode: 'auto', 'rag', 'hybrid', 'llm'
   * @returns {Promise<Object>} - Response with answer and sources
   */
  async query(query, options = {}) {
    if (!this.initialized) {
      throw new Error('RAG engine not initialized. Call initialize() first.');
    }

    const topK = options.topK || this.topK;
    const requestedMode = options.mode || 'hybrid'; // Default to hybrid mode
    
    let retrievedDocs = [];
    let mode = requestedMode;
    let routingInfo = null;

    // Always retrieve documents first (except for pure LLM mode)
    if (mode !== 'llm') {
      retrievedDocs = await this.retrieve(query, topK);
      routingInfo = {
        topScore: retrievedDocs[0]?.score || 0,
        avgScore: retrievedDocs.length > 0 
          ? retrievedDocs.reduce((sum, d) => sum + d.score, 0) / retrievedDocs.length 
          : 0,
        docCount: retrievedDocs.length
      };
    }

    // Determine system prompt based on mode
    let systemPrompt = options.systemPrompt;
    if (!systemPrompt) {
      switch (mode) {
        case 'hybrid':
          // Hybrid: quote data first, then add LLM knowledge
          systemPrompt = this.getHybridPrompt();
          break;
        case 'rag':
          // Pure RAG: only use retrieved context
          systemPrompt = null; // Use default RAG prompt from LLM
          break;
        case 'llm':
          // Pure LLM: no context
          systemPrompt = this.getDirectLLMPrompt();
          retrievedDocs = [];
          break;
        case 'auto':
        default:
          // Auto: decide based on relevance scores
          if (routingInfo && routingInfo.topScore >= this.routingThreshold) {
            systemPrompt = this.getHybridPrompt();
            mode = 'hybrid';
          } else {
            systemPrompt = this.getDirectLLMPrompt();
            mode = 'llm';
            // Keep docs for reference but don't use as context
          }
          break;
      }
    }

    // Apply guardrails to query
    let validation = { allowed: true, sanitized: query };
    if (this.guardrails) {
      validation = this.guardrails.validateQuery(query, options.userId);
      if (!validation.allowed) {
        return {
          answer: `I cannot process this query: ${validation.reason}`,
          sources: [],
          query: validation.sanitized || query,
          mode,
          routing: routingInfo,
          blocked: true,
          reason: validation.reason
        };
      }
      query = validation.sanitized;
    }

    // Filter retrieved documents through guardrails
    let filteredDocs = retrievedDocs;
    if (this.guardrails) {
      filteredDocs = retrievedDocs.filter(doc => {
        const docValidation = this.guardrails.validateDocument(doc.content);
        return docValidation.allowed;
      });
    }

    // Generate response
    const answer = await this.llm.generateResponse(
      query, 
      mode === 'llm' ? [] : filteredDocs, 
      {
        history: options.history,
        systemPrompt,
        temperature: options.temperature
      }
    );

    // Apply guardrails to response
    let finalAnswer = answer;
    if (this.guardrails) {
      const responseValidation = this.guardrails.validateResponse(answer);
      if (!responseValidation.allowed) {
        finalAnswer = `Response blocked: ${responseValidation.reason}`;
      } else {
        finalAnswer = responseValidation.sanitized;
        // Apply response policies (disclaimers, etc.)
        finalAnswer = this.guardrails.applyResponsePolicies(finalAnswer, query);
      }
    }

    return {
      answer: finalAnswer,
      sources: filteredDocs.map(doc => ({
        id: doc.id,
        content: doc.content, // Full content for display
        preview: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
        metadata: doc.metadata,
        score: doc.score
      })),
      query: validation.sanitized || query,
      mode,
      routing: routingInfo,
      warnings: validation.warnings || null
    };
  }

  /**
   * Get system prompt for direct LLM mode (no RAG context)
   * @returns {string} - System prompt
   */
  getDirectLLMPrompt() {
    return `You are a helpful AI assistant. Answer the user's question to the best of your knowledge.
If you don't know something, say so. Be concise and accurate.`;
  }

  /**
   * Get system prompt for hybrid mode (RAG + LLM enhancement)
   * @returns {string} - System prompt
   */
  getHybridPrompt() {
    return `You are a knowledgeable AI assistant. You MUST follow this EXACT response format:

**REQUIRED FORMAT:**

From your data:
[Quote relevant information from the provided context. Use quotation marks for direct quotes. Cite the source if available.]

Additional information:
[Add your own knowledge to expand on the topic. Provide useful context, examples, or explanations that go beyond what's in the data.]

**RULES:**
- ALWAYS use both sections "From your data:" and "Additional information:" in your response
- The "From your data:" section MUST contain quotes or paraphrased content from the context provided
- The "Additional information:" section MUST add value beyond just the context
- If the context is not relevant, say "No directly relevant information found in your data" then provide general knowledge
- Be comprehensive and helpful`;
  }

  /**
   * Force RAG mode regardless of smart routing
   * @param {string} query - User's question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Response with answer and sources
   */
  async queryWithRAG(query, options = {}) {
    return this.query(query, { ...options, smartRouting: false });
  }

  /**
   * Force direct LLM mode (no retrieval)
   * @param {string} query - User's question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Response without sources
   */
  async queryDirectLLM(query, options = {}) {
    if (!this.initialized) {
      throw new Error('RAG engine not initialized. Call initialize() first.');
    }

    const answer = await this.llm.generateResponse(query, [], {
      history: options.history,
      systemPrompt: options.systemPrompt || this.getDirectLLMPrompt(),
      temperature: options.temperature
    });

    return {
      answer,
      sources: [],
      query,
      mode: 'llm',
      routing: { reason: 'forced_llm' }
    };
  }

  /**
   * Query with streaming response
   * @param {string} query - User's question
   * @param {Object} options - Query options
   * @returns {AsyncGenerator} - Stream of response chunks
   */
  async *queryStream(query, options = {}) {
    if (!this.initialized) {
      throw new Error('RAG engine not initialized. Call initialize() first.');
    }

    const topK = options.topK || this.topK;
    
    // Retrieve relevant documents
    const retrievedDocs = await this.retrieve(query, topK);

    // Yield sources first
    yield {
      type: 'sources',
      sources: retrievedDocs.map(doc => ({
        id: doc.id,
        content: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
        metadata: doc.metadata,
        score: doc.score
      }))
    };

    // Stream response
    const stream = this.llm.generateStreamingResponse(query, retrievedDocs, options);
    
    for await (const chunk of stream) {
      yield { type: 'content', content: chunk };
    }

    yield { type: 'done' };
  }

  /**
   * Get engine statistics
   * @returns {Object} - Engine stats
   */
  getStats() {
    return {
      initialized: this.initialized,
      documentCount: this.documentVectors.size || this.dataSource?.getDocumentCount() || 0,
      topK: this.topK,
      similarityThreshold: this.similarityThreshold,
      dataSourceType: this.dataSource?.constructor.name,
      llmModel: this.llm?.model,
      embeddingDimension: this.embeddings?.getDimension()
    };
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    if (config.topK) this.topK = config.topK;
    if (config.similarityThreshold !== undefined) {
      this.similarityThreshold = config.similarityThreshold;
    }
  }

  /**
   * Refresh the index (reload documents from data source)
   */
  async refresh() {
    await this.dataSource.loadDocuments();
    
    if (this.embeddings) {
      const documents = this.dataSource.getDocuments();
      const texts = documents.map(d => d.content);
      await this.embeddings.buildVocabulary(texts);
      await this.buildVectorIndex();
    }
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.dataSource) {
      await this.dataSource.close();
    }
    this.initialized = false;
  }
}

