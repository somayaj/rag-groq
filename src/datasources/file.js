import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, join, basename } from 'path';
import { parse } from 'csv-parse/sync';
import { BaseDataSource } from './base.js';

/**
 * File Data Source
 * Loads and indexes multiple file types: CSV, TXT, PDF, XLS/XLSX
 * Can load all files from a directory
 * Supports auto-refresh when files change
 */
export class FileDataSource extends BaseDataSource {
  constructor(config = {}) {
    super(config);
    this.path = config.path || config.filePath; // File or directory path
    this.recursive = config.recursive ?? false; // Recursively scan directories
    this.extensions = config.extensions || ['.csv', '.txt', '.pdf', '.xlsx', '.xls', '.json', '.md'];
    this.chunkSize = config.chunkSize || 1000; // Characters per chunk for large files
    this.chunkOverlap = config.chunkOverlap || 200; // Overlap between chunks
    this.watch = config.watch ?? false; // Enable file watching
    this.watchDebounce = config.watchDebounce || 2000; // Debounce time in ms
    this.documents = [];
    this.watcher = null;
    this.onRefresh = config.onRefresh || null; // Callback when files are refreshed
    this._refreshTimeout = null;
  }

  async initialize() {
    if (!this.path) {
      throw new Error('File or directory path is required');
    }

    if (!existsSync(this.path)) {
      throw new Error(`Path not found: ${this.path}`);
    }

    await this.loadDocuments();
    this.initialized = true;
  }

  async loadDocuments() {
    this.documents = [];
    
    const stats = await import('fs').then(fs => fs.promises.stat(this.path));
    
    if (stats.isDirectory()) {
      // Load all files from directory
      await this.loadDirectory(this.path);
    } else {
      // Load single file
      await this.loadFile(this.path);
    }

    return this.documents;
  }

  async loadDirectory(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory() && this.recursive) {
        await this.loadDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (this.extensions.includes(ext)) {
          try {
            await this.loadFile(fullPath);
          } catch (error) {
            console.warn(`Warning: Could not load ${fullPath}: ${error.message}`);
          }
        }
      }
    }
  }

  async loadFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    const fileName = basename(filePath);
    
    switch (ext) {
      case '.csv':
        await this.loadCSV(filePath);
        break;
      case '.txt':
      case '.md':
        await this.loadText(filePath);
        break;
      case '.pdf':
        await this.loadPDF(filePath);
        break;
      case '.xlsx':
      case '.xls':
        await this.loadExcel(filePath);
        break;
      case '.json':
        await this.loadJSON(filePath);
        break;
      default:
        // Try as text
        await this.loadText(filePath);
    }
  }

  async loadCSV(filePath) {
    const fileContent = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    records.forEach((record, index) => {
      // Combine all columns into content
      const content = Object.entries(record)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      this.documents.push({
        id: `${fileName}_row_${index}`,
        content,
        metadata: {
          ...record,
          source: filePath,
          fileName,
          fileType: 'csv',
          rowIndex: index
        }
      });
    });
  }

  async loadText(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);
    
    // Chunk large text files
    const chunks = this.chunkText(content);
    
    chunks.forEach((chunk, index) => {
      this.documents.push({
        id: `${fileName}_chunk_${index}`,
        content: chunk,
        metadata: {
          source: filePath,
          fileName,
          fileType: 'text',
          chunkIndex: index,
          totalChunks: chunks.length
        }
      });
    });
  }

  async loadPDF(filePath) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const dataBuffer = await readFile(filePath);
      const fileName = basename(filePath);
      
      const data = await pdfParse(dataBuffer);
      const content = data.text;
      
      // Chunk the PDF content
      const chunks = this.chunkText(content);
      
      chunks.forEach((chunk, index) => {
        this.documents.push({
          id: `${fileName}_chunk_${index}`,
          content: chunk,
          metadata: {
            source: filePath,
            fileName,
            fileType: 'pdf',
            pages: data.numpages,
            chunkIndex: index,
            totalChunks: chunks.length
          }
        });
      });
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('pdf-parse is required for PDF files. Install it with: npm install pdf-parse');
      }
      throw error;
    }
  }

  async loadExcel(filePath) {
    try {
      const XLSX = (await import('xlsx')).default;
      const fileName = basename(filePath);
      
      const workbook = XLSX.readFile(filePath);
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const records = XLSX.utils.sheet_to_json(sheet);
        
        records.forEach((record, index) => {
          const content = Object.entries(record)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

          this.documents.push({
            id: `${fileName}_${sheetName}_row_${index}`,
            content,
            metadata: {
              ...record,
              source: filePath,
              fileName,
              fileType: 'excel',
              sheetName,
              rowIndex: index
            }
          });
        });
      }
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('xlsx is required for Excel files. Install it with: npm install xlsx');
      }
      throw error;
    }
  }

  async loadJSON(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);
    const data = JSON.parse(content);
    
    if (Array.isArray(data)) {
      // Array of objects
      data.forEach((item, index) => {
        const itemContent = typeof item === 'string' 
          ? item 
          : JSON.stringify(item, null, 2);
        
        this.documents.push({
          id: `${fileName}_item_${index}`,
          content: itemContent,
          metadata: {
            source: filePath,
            fileName,
            fileType: 'json',
            index
          }
        });
      });
    } else {
      // Single object
      this.documents.push({
        id: `${fileName}`,
        content: JSON.stringify(data, null, 2),
        metadata: {
          source: filePath,
          fileName,
          fileType: 'json'
        }
      });
    }
  }

  /**
   * Clean text by removing code artifacts, HTML, SVG, and other noise
   */
  cleanText(text) {
    if (!text) return '';
    
    let cleaned = text
      // Remove SVG and HTML tags
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      // Remove SVG path/attribute fragments
      .replace(/\b(stroke|fill|viewBox|stroke-linecap|stroke-linejoin|stroke-width|xmlns|d)="[^"]*"/gi, '')
      .replace(/\b(none|currentColor|round)\b(?=\s*(stroke|fill|"|=))/gi, '')
      // Remove path data (SVG d attribute content)
      .replace(/\bd="[^"]*"/gi, '')
      .replace(/M[\d\s.,LlHhVvCcSsQqTtAaZz-]+/g, '')
      // Remove HTML entities
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/&#\d+;/gi, ' ')
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      // Remove common code artifacts
      .replace(/\b(class|className|onClick|onSubmit|onChange|style)="[^"]*"/gi, '')
      .replace(/\b(id|name|type|value|placeholder)="[^"]*"/gi, '')
      // Remove hex colors
      .replace(/#[0-9a-fA-F]{3,8}\b/g, '')
      // Remove CSS-like properties
      .replace(/[a-z-]+:\s*[^;{]+;/gi, ' ')
      // Remove multiple special characters in a row
      .replace(/[<>{}[\]()\/\\|]+/g, ' ')
      // Remove lines that are mostly numbers/symbols (likely code or tables)
      .replace(/^[\d\s.,;:|\-+*/=]+$/gm, '')
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
    
    return cleaned;
  }

  /**
   * Split text into chunks with overlap
   */
  chunkText(text) {
    // Clean the text first
    const cleanedText = this.cleanText(text);
    
    if (cleanedText.length <= this.chunkSize) {
      return [cleanedText.trim()];
    }

    const chunks = [];
    let start = 0;

    while (start < cleanedText.length) {
      let end = start + this.chunkSize;
      
      // Try to break at a sentence or paragraph boundary
      if (end < cleanedText.length) {
        const breakPoints = ['\n\n', '\n', '. ', '! ', '? '];
        for (const bp of breakPoints) {
          const lastBreak = cleanedText.lastIndexOf(bp, end);
          if (lastBreak > start + this.chunkSize / 2) {
            end = lastBreak + bp.length;
            break;
          }
        }
      }

      const chunk = cleanedText.slice(start, end).trim();
      // Only add chunks with meaningful content (at least 50 chars of real text)
      if (chunk.length > 50) {
        chunks.push(chunk);
      }
      start = end - this.chunkOverlap;
    }

    return chunks.filter(c => c.length > 0);
  }

  async search(query, limit = 5) {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = this.documents.map(doc => {
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      // Exact phrase match
      if (contentLower.includes(queryLower)) {
        score += 10;
      }

      // Individual term matches
      for (const term of queryTerms) {
        if (term.length > 2) {
          const regex = new RegExp(term, 'gi');
          const matches = contentLower.match(regex);
          if (matches) {
            score += matches.length;
          }
        }
      }

      return { ...doc, score };
    });

    return scored
      .filter(doc => doc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async addDocument(document) {
    const id = document.id || `doc_${this.documents.length}`;
    this.documents.push({
      id,
      content: document.content,
      metadata: { ...document.metadata }
    });
    return id;
  }

  getDocuments() {
    return this.documents;
  }

  getDocumentCount() {
    return this.documents.length;
  }

  /**
   * Get summary of loaded files
   */
  getSummary() {
    const byType = {};
    const byFile = {};
    
    for (const doc of this.documents) {
      const type = doc.metadata?.fileType || 'unknown';
      const file = doc.metadata?.fileName || 'unknown';
      
      byType[type] = (byType[type] || 0) + 1;
      byFile[file] = (byFile[file] || 0) + 1;
    }
    
    return {
      totalDocuments: this.documents.length,
      byType,
      byFile,
      watching: !!this.watcher
    };
  }

  /**
   * Start watching for file changes
   */
  async startWatching() {
    if (this.watcher) {
      return; // Already watching
    }

    try {
      const chokidar = (await import('chokidar')).default;
      
      // Build glob patterns for watched extensions
      const patterns = this.extensions.map(ext => 
        this.recursive 
          ? join(this.path, '**', `*${ext}`)
          : join(this.path, `*${ext}`)
      );

      this.watcher = chokidar.watch(patterns, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100
        }
      });

      const handleChange = (eventType, filePath) => {
        // Debounce refreshes
        if (this._refreshTimeout) {
          clearTimeout(this._refreshTimeout);
        }
        
        this._refreshTimeout = setTimeout(async () => {
          console.log(`📁 File ${eventType}: ${basename(filePath)}, refreshing index...`);
          const oldCount = this.documents.length;
          await this.loadDocuments();
          const newCount = this.documents.length;
          console.log(`✅ Index refreshed: ${oldCount} → ${newCount} documents`);
          
          if (this.onRefresh) {
            this.onRefresh(this.documents.length, eventType, filePath);
          }
        }, this.watchDebounce);
      };

      this.watcher
        .on('add', (path) => handleChange('added', path))
        .on('change', (path) => handleChange('changed', path))
        .on('unlink', (path) => handleChange('removed', path));

      console.log(`👁️  Watching for file changes in ${this.path}`);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('Warning: chokidar not installed. File watching disabled. Install with: npm install chokidar');
      } else {
        throw error;
      }
    }
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log('👁️  Stopped watching for file changes');
    }
  }

  /**
   * Close the data source and stop watching
   */
  async close() {
    await this.stopWatching();
    await super.close();
  }
}

