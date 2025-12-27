import { BaseDataSource } from './base.js';

/**
 * Elasticsearch Data Source
 * Connects to Elasticsearch for RAG queries with support for both text and vector search
 */
export class ElasticsearchDataSource extends BaseDataSource {
  constructor(config = {}) {
    super(config);
    this.node = config.node || config.url || 'http://localhost:9200';
    this.indexName = config.indexName || 'rag-documents';
    this.username = config.username;
    this.password = config.password;
    this.apiKey = config.apiKey;
    this.cloudId = config.cloudId;
    this.dimension = config.dimension || 384;
    this.client = null;
    this.embeddingFunction = null;
    this.contentField = config.contentField || 'content';
    this.idField = config.idField || 'id';
    this._cachedDocumentCount = 0;
    this.maxNumCandidates = config.maxNumCandidates || 10000; // Elasticsearch limit
    this.numCandidatesMultiplier = config.numCandidatesMultiplier || 10; // Default: limit * 10
  }

  async initialize() {
    try {
      const { Client } = await import('@elastic/elasticsearch');
      
      // Build client configuration
      const clientConfig = {};
      
      if (this.cloudId) {
        clientConfig.cloud = { id: this.cloudId };
      } else {
        clientConfig.node = this.node;
      }
      
      if (this.apiKey) {
        clientConfig.auth = { apiKey: this.apiKey };
      } else if (this.username && this.password) {
        clientConfig.auth = {
          username: this.username,
          password: this.password
        };
      }
      
      this.client = new Client(clientConfig);
      
      // Test connection
      await this.client.ping();
      
      // Ensure index exists with proper mapping
      await this.ensureIndex();
      
      this.initialized = true;
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('@elastic/elasticsearch is required. Install it with: npm install @elastic/elasticsearch');
      }
      throw error;
    }
  }

  /**
   * Ensure the index exists with proper mapping for text and vector search
   */
  async ensureIndex() {
    const exists = await this.client.indices.exists({ index: this.indexName });
    
    if (!exists) {
      // Create index with mapping for both text and vector search
      await this.client.indices.create({
        index: this.indexName,
        mappings: {
          properties: {
            [this.contentField]: {
              type: 'text',
              analyzer: 'standard',
              fields: {
                keyword: {
                  type: 'keyword'
                }
              }
            },
            embedding: {
              type: 'dense_vector',
              dims: this.dimension,
              index: true,
              similarity: 'cosine'
            },
            metadata: {
              type: 'object',
              enabled: true
            }
          }
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        }
      });
    } else {
      // Check if embedding field exists, if not update mapping
      const mapping = await this.client.indices.getMapping({ index: this.indexName });
      const indexMapping = mapping[this.indexName]?.mappings?.properties;
      
      if (!indexMapping?.embedding) {
        await this.client.indices.putMapping({
          index: this.indexName,
          properties: {
            embedding: {
              type: 'dense_vector',
              dims: this.dimension,
              index: true,
              similarity: 'cosine'
            }
          }
        });
      }
    }
  }

  async loadDocuments() {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          query: { match_all: {} },
          size: 10000 // Adjust based on your needs
        }
      });

      const documents = response.hits.hits.map(hit => ({
        id: hit._id,
        content: hit._source[this.contentField] || '',
        metadata: hit._source.metadata || {},
        ...hit._source
      }));

      // Cache the document count
      this._cachedDocumentCount = documents.length;

      return documents;
    } catch (error) {
      console.error('Error loading documents from Elasticsearch:', error.message);
      this._cachedDocumentCount = 0;
      return [];
    }
  }

  /**
   * Search using vector similarity (kNN search)
   * @param {Array<number>} vector - Query vector
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} - Search results
   */
  async searchByVector(vector, limit = 5) {
    try {
      // Calculate num_candidates: limit * multiplier, but cap at maxNumCandidates
      const numCandidates = Math.min(
        limit * this.numCandidatesMultiplier,
        this.maxNumCandidates
      );
      
      const response = await this.client.search({
        index: this.indexName,
        body: {
          knn: {
            field: 'embedding',
            query_vector: vector,
            k: limit,
            num_candidates: numCandidates
          },
          _source: {
            includes: [this.contentField, 'metadata', '*']
          }
        }
      });

      return response.hits.hits.map(hit => ({
        id: hit._id,
        content: hit._source[this.contentField] || '',
        metadata: hit._source.metadata || {},
        score: hit._score
      }));
    } catch (error) {
      // Fallback to text search if vector search fails
      console.warn('Vector search failed, falling back to text search:', error.message);
      return [];
    }
  }

  /**
   * Text-based search using Elasticsearch full-text search
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} - Search results
   */
  async search(query, limit = 5) {
    // If embedding function is available, try vector search first
    if (this.embeddingFunction) {
      try {
        const vector = await this.embeddingFunction(query);
        const vectorResults = await this.searchByVector(vector, limit);
        if (vectorResults.length > 0) {
          return vectorResults;
        }
      } catch (error) {
        // Fall through to text search
      }
    }

    // Fallback to text search
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            multi_match: {
              query: query,
              fields: [this.contentField, `${this.contentField}.keyword`],
              type: 'best_fields',
              fuzziness: 'AUTO'
            }
          },
          size: limit,
          _source: {
            includes: [this.contentField, 'metadata', '*']
          }
        }
      });

      return response.hits.hits.map(hit => ({
        id: hit._id,
        content: hit._source[this.contentField] || '',
        metadata: hit._source.metadata || {},
        score: hit._score
      }));
    } catch (error) {
      console.error('Error searching Elasticsearch:', error.message);
      return [];
    }
  }

  /**
   * Add a document with its vector embedding
   * @param {Object} document - Document with content and metadata
   * @param {Array<number>} vector - Vector embedding
   * @returns {Promise<string>} - Document ID
   */
  async addDocumentWithVector(document, vector) {
    const id = document.id || document[this.idField] || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const doc = {
      [this.contentField]: document.content,
      metadata: document.metadata || {},
      embedding: vector
    };

    // Add any additional fields from document
    Object.keys(document).forEach(key => {
      if (key !== 'id' && key !== 'content' && key !== 'metadata' && key !== this.idField) {
        doc[key] = document[key];
      }
    });

    await this.client.index({
      index: this.indexName,
      id: id,
      body: doc
    });

    // Refresh index to make document searchable immediately
    await this.client.indices.refresh({ index: this.indexName });

    // Increment cached count
    this._cachedDocumentCount++;

    return id;
  }

  /**
   * Add a document (requires embedding function to be set for vector search)
   * @param {Object} document - Document to add
   * @returns {Promise<string>} - Document ID
   */
  async addDocument(document) {
    const id = document.id || document[this.idField] || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const doc = {
      [this.contentField]: document.content,
      metadata: document.metadata || {}
    };

    // Add any additional fields from document
    Object.keys(document).forEach(key => {
      if (key !== 'id' && key !== 'content' && key !== 'metadata' && key !== this.idField) {
        doc[key] = document[key];
      }
    });

    // If embedding function is available, add vector
    if (this.embeddingFunction) {
      const vector = await this.embeddingFunction(document.content);
      doc.embedding = vector;
    }

    await this.client.index({
      index: this.indexName,
      id: id,
      body: doc
    });

    // Refresh index to make document searchable immediately
    await this.client.indices.refresh({ index: this.indexName });

    // Increment cached count
    this._cachedDocumentCount++;

    return id;
  }

  /**
   * Set the embedding function for text-to-vector conversion
   * @param {Function} fn - Async function that converts text to vector
   */
  setEmbeddingFunction(fn) {
    this.embeddingFunction = fn;
  }

  /**
   * Delete documents by IDs
   * @param {Array<string>} ids - Document IDs to delete
   */
  async deleteDocuments(ids) {
    if (ids.length === 0) return;
    
    await this.client.bulk({
      body: ids.flatMap(id => [
        { delete: { _index: this.indexName, _id: id } }
      ])
    });

    await this.client.indices.refresh({ index: this.indexName });
  }

  /**
   * Delete all documents in index
   */
  async deleteAll() {
    await this.client.deleteByQuery({
      index: this.indexName,
      body: {
        query: { match_all: {} }
      }
    });

    await this.client.indices.refresh({ index: this.indexName });
  }

  async close() {
    this.client = null;
    await super.close();
  }

  async getDocuments() {
    return await this.loadDocuments();
  }

  getDocumentCount() {
    // Return cached count if available
    return this._cachedDocumentCount || 0;
  }

  /**
   * Get index statistics
   * @returns {Promise<Object>} - Index stats
   */
  async getStats() {
    try {
      const stats = await this.client.count({ index: this.indexName });
      const health = await this.client.cluster.health({ index: this.indexName });
      
      // Update cached count
      this._cachedDocumentCount = stats.count;
      
      return {
        documentCount: stats.count,
        health: health.status,
        indexName: this.indexName
      };
    } catch (error) {
      return {
        documentCount: this._cachedDocumentCount || 0,
        health: 'unknown',
        indexName: this.indexName,
        error: error.message
      };
    }
  }
}

