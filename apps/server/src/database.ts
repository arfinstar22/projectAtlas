import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { 
  Document, 
  Folder, 
  DocumentChunk, 
  IndexingJob, 
  DocumentStatus,
  JobStatus,
  IndexingJobType,
  ChunkMetadata
} from '@atlas/core';
import { createLogger } from '@atlas/core';
import path from 'path';

const logger = createLogger('DATABASE');

export class AtlasDatabase {
  private db!: Database;
  private initialized = false;

  constructor(private dbPath: string) {
    // Constructor now just stores the path
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec('PRAGMA foreign_keys = ON');
    await this.db.exec('PRAGMA journal_mode = WAL');
    
    await this.initializeSchema();
    this.initialized = true;
    logger.info('Database initialized');
  }

  private async initializeSchema() {
    // Folders table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        added_at TEXT NOT NULL,
        last_scanned TEXT,
        document_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Documents table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        modified_at TEXT NOT NULL,
        hash TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        indexed_at TEXT,
        page_count INTEGER,
        sheet_count INTEGER,
        author TEXT,
        title TEXT,
        subject TEXT,
        keywords TEXT,
        language TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
      )
    `);

    // Chunks table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        page INTEGER,
        sheet TEXT,
        section TEXT,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )
    `);

    // Embeddings table (for vector search)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding TEXT,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks (id) ON DELETE CASCADE
      )
    `);

    // Indexing jobs table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexing_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        folder_id TEXT,
        document_id TEXT,
        progress INTEGER DEFAULT 0,
        total_items INTEGER DEFAULT 0,
        processed_items INTEGER DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents (folder_id);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
      CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents (hash);
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON indexing_jobs (status);
    `);

    // Enable FTS for text search
    await this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        chunk_id UNINDEXED,
        text
      );
    `);
  }

  // Folder operations
  async addFolder(folder: Omit<Folder, 'documentCount'>): Promise<void> {
    await this.db.run(
      `INSERT INTO folders (id, path, name, added_at, is_active) VALUES (?, ?, ?, ?, ?)`,
      [folder.id, folder.path, folder.name, folder.addedAt.toISOString(), folder.isActive ? 1 : 0]
    );
  }

  async getFolders(): Promise<Folder[]> {
    const rows = await this.db.all('SELECT * FROM folders WHERE is_active = 1 ORDER BY added_at DESC');
    return rows.map(this.mapFolder);
  }

  async updateFolderScanTime(folderId: string, scanTime: Date): Promise<void> {
    await this.db.run('UPDATE folders SET last_scanned = ? WHERE id = ?', [scanTime.toISOString(), folderId]);
  }

  async removeFolder(folderId: string): Promise<void> {
    await this.db.run('DELETE FROM folders WHERE id = ?', [folderId]);
  }

  // Document operations
  async addDocument(document: Document): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO documents (
        id, name, path, extension, size, created_at, modified_at,
        hash, mime_type, folder_id, status, indexed_at,
        page_count, sheet_count, author, title, subject, keywords, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        document.id, document.name, document.path, document.extension, document.size,
        document.createdAt.toISOString(), document.modifiedAt.toISOString(),
        document.hash, document.mimeType, document.folderId, document.status,
        document.indexedAt?.toISOString(),
        document.metadata?.pageCount, document.metadata?.sheetCount,
        document.metadata?.author, document.metadata?.title, document.metadata?.subject,
        document.metadata?.keywords?.join(','), document.metadata?.language
      ]
    );
  }

  async getDocument(id: string): Promise<Document | null> {
    const row = await this.db.get('SELECT * FROM documents WHERE id = ?', [id]);
    return row ? this.mapDocument(row) : null;
  }

  async getDocumentByPath(path: string): Promise<Document | null> {
    const row = await this.db.get('SELECT * FROM documents WHERE path = ?', [path]);
    return row ? this.mapDocument(row) : null;
  }

  async getDocuments(folderId?: string, status?: DocumentStatus): Promise<Document[]> {
    let query = 'SELECT * FROM documents';
    const params: any[] = [];

    if (folderId || status) {
      query += ' WHERE';
      const conditions: string[] = [];
      
      if (folderId) {
        conditions.push('folder_id = ?');
        params.push(folderId);
      }
      
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }
      
      query += ' ' + conditions.join(' AND ');
    }

    query += ' ORDER BY modified_at DESC';
    const rows = await this.db.all(query, params);
    return rows.map(this.mapDocument);
  }

  async updateDocumentStatus(id: string, status: DocumentStatus, indexedAt?: Date): Promise<void> {
    await this.db.run(
      'UPDATE documents SET status = ?, indexed_at = ? WHERE id = ?',
      [status, indexedAt?.toISOString(), id]
    );
  }

  // Chunk operations
  async addChunk(chunk: DocumentChunk): Promise<void> {
    await this.db.run(
      `INSERT INTO chunks (
        id, document_id, chunk_index, text, page, sheet, section,
        start_offset, end_offset, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chunk.id, chunk.documentId, chunk.chunkIndex, chunk.text,
        chunk.metadata.page, chunk.metadata.sheet, chunk.metadata.section,
        chunk.metadata.startOffset, chunk.metadata.endOffset,
        chunk.createdAt.toISOString()
      ]
    );

    // Add to FTS
    await this.db.run(
      'INSERT INTO chunks_fts(chunk_id, text) VALUES (?, ?)',
      [chunk.id, chunk.text]
    );
  }

  async getChunks(documentId: string): Promise<DocumentChunk[]> {
    const rows = await this.db.all(
      'SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index',
      [documentId]
    );
    return rows.map(this.mapChunk);
  }

  async searchChunks(query: string, limit: number = 10): Promise<DocumentChunk[]> {
    // Sanitize query for FTS5 - remove special characters that cause syntax errors
    const sanitizedQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitizedQuery) {
      return [];
    }

    try {
      const rows = await this.db.all(
        `SELECT c.* FROM chunks c
         JOIN chunks_fts fts ON c.id = fts.chunk_id
         WHERE chunks_fts MATCH ?
         ORDER BY bm25(chunks_fts)
         LIMIT ?`,
        [sanitizedQuery, limit]
      );
      return rows.map(this.mapChunk);
    } catch (error) {
      logger.error('FTS search error:', error);
      // Fallback to simple LIKE query if FTS fails
      const fallbackRows = await this.db.all(
        `SELECT * FROM chunks 
         WHERE text LIKE ? 
         LIMIT ?`,
        [`%${sanitizedQuery}%`, limit]
      );
      return fallbackRows.map(this.mapChunk);
    }
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    // Remove from FTS first
    await this.db.run(
      'DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)',
      [documentId]
    );
    // Remove chunks
    await this.db.run('DELETE FROM chunks WHERE document_id = ?', [documentId]);
  }

  // Job operations
  async addJob(job: IndexingJob): Promise<void> {
    await this.db.run(
      `INSERT INTO indexing_jobs (
        id, type, status, folder_id, document_id, progress,
        total_items, processed_items, started_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id, job.type, job.status, job.folderId, job.documentId,
        job.progress, job.totalItems, job.processedItems,
        job.startedAt.toISOString(), job.error
      ]
    );
  }

  async updateJob(id: string, updates: Partial<IndexingJob>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    const columnMap: Record<string, string> = {
      completedAt: 'completed_at',
      processedItems: 'processed_items',
      totalItems: 'total_items',
      startedAt: 'started_at',
      folderId: 'folder_id',
      documentId: 'document_id'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbColumn = columnMap[key] || key;
        fields.push(`${dbColumn} = ?`);
        values.push(value instanceof Date ? value.toISOString() : value);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    await this.db.run(`UPDATE indexing_jobs SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async getJobs(status?: JobStatus): Promise<IndexingJob[]> {
    let query = 'SELECT * FROM indexing_jobs';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC';
    const rows = await this.db.all(query, params);
    return rows.map(this.mapJob);
  }

  // Statistics
  getStats() {
    return Promise.all([
      this.db.get('SELECT COUNT(*) as count FROM folders WHERE is_active = 1'),
      this.db.get('SELECT COUNT(*) as count FROM documents'),
      this.db.get('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['indexed']),
      this.db.get('SELECT COUNT(*) as count FROM chunks')
    ]).then(([folderCount, docCount, indexedCount, chunkCount]) => ({
      folders: folderCount.count,
      documents: docCount.count,
      indexed: indexedCount.count,
      chunks: chunkCount.count
    }));
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
  }

  // Mapping functions
  private mapFolder(row: any): Folder {
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      addedAt: new Date(row.added_at),
      lastScanned: row.last_scanned ? new Date(row.last_scanned) : undefined,
      documentCount: row.document_count,
      isActive: row.is_active === 1
    };
  }

  private mapDocument(row: any): Document {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      extension: row.extension,
      size: row.size,
      createdAt: new Date(row.created_at),
      modifiedAt: new Date(row.modified_at),
      hash: row.hash,
      mimeType: row.mime_type,
      folderId: row.folder_id,
      status: row.status as DocumentStatus,
      indexedAt: row.indexed_at ? new Date(row.indexed_at) : undefined,
      metadata: {
        pageCount: row.page_count,
        sheetCount: row.sheet_count,
        author: row.author,
        title: row.title,
        subject: row.subject,
        keywords: row.keywords ? row.keywords.split(',') : undefined,
        language: row.language
      }
    };
  }

  private mapChunk(row: any): DocumentChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      text: row.text,
      metadata: {
        page: row.page,
        sheet: row.sheet,
        section: row.section,
        startOffset: row.start_offset,
        endOffset: row.end_offset
      },
      createdAt: new Date(row.created_at)
    };
  }

  private mapJob(row: any): IndexingJob {
    return {
      id: row.id,
      type: row.type as IndexingJobType,
      status: row.status as JobStatus,
      folderId: row.folder_id,
      documentId: row.document_id,
      progress: row.progress,
      totalItems: row.total_items,
      processedItems: row.processed_items,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error
    };
  }
}