import { AtlasDatabase } from '../database.js';
import { 
  Document, 
  DocumentChunk, 
  IndexingJob, 
  DocumentStatus, 
  JobStatus, 
  IndexingJobType,
  QuickIndexProgress,
  classifyFile,
  quickIndexPriority,
  generateId, 
  chunkText, 
  AsyncQueue, 
  createLogger 
} from '@atlas/core';
import { DocumentProcessor, ProcessingOptions } from '@atlas/document';
import { promises as fs } from 'fs';
import path from 'path';

const logger = createLogger('INDEXING_SERVICE');

export interface IndexingServiceOptions extends ProcessingOptions {
  chunkSize: number;
  chunkOverlap: number;
  maxConcurrentProcessing: number;
  batchSize?: number;
}

export class IndexingService {
  private db: AtlasDatabase;
  private processor: DocumentProcessor;
  private queue: AsyncQueue;
  private options: IndexingServiceOptions;
  private activeJobs: Map<string, IndexingJob> = new Map();
  private quickIndexProgress: Map<string, QuickIndexProgress> = new Map();
  private cancelledJobs: Set<string> = new Set();
  private folderJobIds: Map<string, string> = new Map();
  private batchSize: number;

  constructor(db: AtlasDatabase, options: IndexingServiceOptions) {
    this.db = db;
    this.options = options;
    this.batchSize = options.batchSize || 100;
    this.processor = new DocumentProcessor({
      enableOCR: options.enableOCR,
      maxFileSize: options.maxFileSize,
      ocrLanguages: ['eng', 'ind'] // English + Indonesian
    });
    this.queue = new AsyncQueue(options.maxConcurrentProcessing);

    // Resume any pending jobs on startup
    this.resumePendingJobs();
  }

  async startQuickIndex(folderId: string): Promise<string> {
    const reserved = this.folderJobIds.get(folderId);
    if (reserved && (this.activeJobs.has(reserved) || this.quickIndexProgress.has(reserved))) {
      return reserved;
    }

    const jobId = generateId();
    this.folderJobIds.set(folderId, jobId);

    const progress: QuickIndexProgress = {
      jobId,
      folderId,
      status: JobStatus.QUEUED,
      total: 0,
      queued: 0,
      processing: 0,
      indexed: 0,
      skipped: 0,
      failed: 0,
      bytesProcessed: 0
    };
    this.quickIndexProgress.set(jobId, progress);

    // Run in background
    this.runQuickIndex(jobId, folderId).catch(err => {
      logger.error(`Quick Index ${jobId} failed:`, err);
    });

    return jobId;
  }

  // Quick Index: DISCOVERY from FILESYSTEM (not DB)
  private async quickIndexDiscovery(folderId: string): Promise<string[]> {
    const folders = await this.db.getFolders();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) throw new Error('Folder not found');
    const discovered: string[] = [];
    const queue: string[] = [folder.path];
    const visited = new Set<string>();
    const SUPPORTED = new Set(['.pdf','.docx','.xlsx','.xls','.txt','.md','.markdown','.csv','.jpg','.jpeg','.png','.webp']);
    while (queue.length > 0) {
      const dir = queue.shift()!;
      if (visited.has(dir)) continue;
      visited.add(dir);
      let entries: import('fs').Dirent[];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { queue.push(full); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!SUPPORTED.has(ext)) continue;
        discovered.push(full);
      }
    }
    return discovered;
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private async runQuickIndex(jobId: string, folderId: string): Promise<void> {
    const progress = this.quickIndexProgress.get(jobId)!;
    progress.status = JobStatus.RUNNING;

    try {
      // DISCOVERY from FILESYSTEM (not DB)
      const discovered = await this.quickIndexDiscovery(folderId);
      logger.info(`[QUICK_INDEX] discovered=${discovered.length} files in folder ${folderId}`);
      if (discovered.length === 0) { progress.total = 0; progress.status = JobStatus.COMPLETED; return; }

      // Incremental: classify & filter unchanged via size+mtime
      const docsToProcess: Document[] = [];
      let skipped = 0;
      for (const full of discovered) {
        let stats: import('fs').Stats;
        try { stats = await fs.stat(full); } catch { continue; }
        const ext = path.extname(full).toLowerCase();
        const existing = await this.db.getDocumentByPath(full);
        if (existing) {
          if (existing.size === stats.size && new Date(existing.modifiedAt).getTime() === stats.mtime.getTime()) {
            skipped++;
            continue;
          }
          existing.size = stats.size;
          existing.modifiedAt = stats.mtime;
          existing.status = DocumentStatus.PENDING;
          await this.db.addDocument(existing);
          docsToProcess.push(existing);
        } else {
          const extStr = ext;
          const doc: Document = {
            id: generateId(),
            name: path.basename(full),
            path: full,
            extension: extStr,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            hash: '',
            mimeType: this.getMimeType(extStr),
            folderId,
            status: DocumentStatus.PENDING
          };
          await this.db.addDocument(doc);
          docsToProcess.push(doc);
        }
      }
      progress.total = discovered.length;
      progress.skipped = skipped;
      progress.queued = docsToProcess.length;
      if (docsToProcess.length === 0) { progress.status = JobStatus.COMPLETED; return; }

      const sortedDocs = docsToProcess.sort((a, b) => {
        const catA = classifyFile(a.extension);
        const catB = classifyFile(b.extension);
        return quickIndexPriority(catA) - quickIndexPriority(catB);
      });

      const tasks = sortedDocs.map(doc => this.queue.add(async () => {
        if (this.cancelledJobs.has(jobId)) return;
        progress.queued--;
        progress.processing++;
        try {
          await this.db.updateDocumentStatus(doc.id, DocumentStatus.PROCESSING);
          const processed = await this.processor.processDocument(doc.path);
          if (processed.metadata) await this.db.updateDocumentMetadata(doc.id, processed.metadata);
          const chunks = await this.createChunks(doc.id, processed.text);
          await this.db.deleteDocumentChunks(doc.id);
          await this.db.batchAddChunks(chunks);
          await this.db.updateDocumentStatus(doc.id, DocumentStatus.INDEXED, new Date());
          progress.indexed++;
          progress.bytesProcessed += doc.size;
        } catch (error) {
          logger.error(`Quick Index failed for ${doc.path}:`, error);
          progress.failed++;
          await this.db.updateDocumentStatus(doc.id, DocumentStatus.ERROR);
        } finally {
          progress.processing--;
        }
      }));

      await Promise.allSettled(tasks);
      progress.status = JobStatus.COMPLETED;
      
    } catch (error: any) {
      progress.status = JobStatus.FAILED;
      progress.error = error.message;
      logger.error(`Quick Index ${jobId} fatal error:`, error);
    }
  }

  getQuickIndexProgress(jobId: string): QuickIndexProgress | undefined {
    return this.quickIndexProgress.get(jobId);
  }

  getFolderQuickIndexJobId(folderId: string): string | undefined {
    return this.folderJobIds.get(folderId);
  }

  async startFolderIndexing(folderId: string): Promise<string> {
    // One active job per folder, reserved ATOMICALLY: the Map.set below runs
    // synchronously before the first await, so two concurrent scan requests
    // for the same folder can never both create a job (no check-then-act gap).
    const reserved = this.folderJobIds.get(folderId);
    if (reserved && this.activeJobs.has(reserved)) {
      return reserved;
    }
    if (reserved) {
      // Stale reservation from a completed job: replace it below.
      this.folderJobIds.delete(folderId);
    }

    const job: IndexingJob = {
      id: generateId(),
      type: IndexingJobType.FOLDER_SCAN,
      status: JobStatus.QUEUED,
      folderId,
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      startedAt: new Date()
    };

    this.folderJobIds.set(folderId, job.id);

    try {
      const documents = await this.db.getDocuments(folderId, DocumentStatus.PENDING);
      job.totalItems = documents.length;

      this.db.addJob(job);
      this.activeJobs.set(job.id, job);

      // Process documents in background
      this.processDocumentsInJob(job.id, documents);

      logger.info(`Started indexing job for folder ${folderId}: ${job.id}`);
      return job.id;
    } catch (error) {
      this.folderJobIds.delete(folderId);
      throw error;
    }
  }

  async startDocumentIndexing(documentId: string): Promise<string> {
    const document = await this.db.getDocument(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const job: IndexingJob = {
      id: generateId(),
      type: IndexingJobType.DOCUMENT_PROCESS,
      status: JobStatus.QUEUED,
      documentId,
      progress: 0,
      totalItems: 1,
      processedItems: 0,
      startedAt: new Date()
    };

    this.db.addJob(job);
    this.activeJobs.set(job.id, job);

    // Process single document
    this.processDocumentsInJob(job.id, [document]);

    logger.info(`Started indexing job for document ${documentId}: ${job.id}`);
    return job.id;
  }

  private async processDocumentsInJob(jobId: string, documents: Document[]): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // Update job status
    job.status = JobStatus.RUNNING;
    this.db.updateJob(jobId, { status: JobStatus.RUNNING });

    try {
      // Enqueue every pending document at once. The shared worker pool
      // (AsyncQueue) bounds actual concurrency to maxConcurrentProcessing.
      const tasks = documents.map((document) =>
        this.queue.add(() => this.processDocument(document, jobId))
      );
      await Promise.allSettled(tasks);

      // Job completed
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      job.progress = 100;
      this.db.updateJob(jobId, {
        status: JobStatus.COMPLETED,
        completedAt: job.completedAt,
        progress: 100
      });

      logger.info(`Indexing job completed: ${jobId}`);
    } catch (error) {
      // Job failed
      job.status = JobStatus.FAILED;
      job.error = (error as Error).message;
      job.completedAt = new Date();
      this.db.updateJob(jobId, {
        status: JobStatus.FAILED,
        error: (error as Error).message,
        completedAt: job.completedAt
      });

      logger.error(`Indexing job failed: ${jobId}`, error);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async processDocument(document: Document, jobId: string): Promise<void> {
    logger.info(`Processing document: ${document.path}`);

    try {
      if (this.cancelledJobs.has(jobId)) {
        logger.info(`Job ${jobId} cancelled, skipping document ${document.path}`);
        return;
      }

      // Update document status
      this.db.updateDocumentStatus(document.id, DocumentStatus.PROCESSING);

      // Remove existing chunks if re-processing
      this.db.deleteDocumentChunks(document.id);

      // Process document content
      const processed = await this.processor.processDocument(document.path);

      // Update document with extracted metadata (status untouched)
      if (processed.metadata) {
        this.db.updateDocumentMetadata(document.id, processed.metadata);
      }

      // Create chunks
      const chunks = await this.createChunks(document.id, processed.text);

      // Store chunks
      for (const chunk of chunks) {
        this.db.addChunk(chunk);
      }

      // Update document status
      this.db.updateDocumentStatus(document.id, DocumentStatus.INDEXED, new Date());

      // Update job progress
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.processedItems++;
        job.progress = Math.round((job.processedItems / job.totalItems) * 100);
        this.db.updateJob(jobId, {
          processedItems: job.processedItems,
          progress: job.progress
        });
      }

      logger.info(`Successfully processed document: ${document.name}`);

    } catch (error) {
      logger.error(`Error processing document ${document.path}:`, error);
      
      // Update document status to error
      this.db.updateDocumentStatus(document.id, DocumentStatus.ERROR);
      
      // Don't fail the entire job for one document
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.processedItems++;
        job.progress = Math.round((job.processedItems / job.totalItems) * 100);
        this.db.updateJob(jobId, {
          processedItems: job.processedItems,
          progress: job.progress
        });
      }
    }
  }

  private async createChunks(documentId: string, text: string): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    // Try semantic chunking first, fall back to simple chunking if it fails
    let semanticChunks;
    try {
      // Import the enhanced chunking function
      const coreModule = await import('@atlas/core');
      const { chunkTextSemantically } = coreModule as any;
      
      if (chunkTextSemantically) {
        semanticChunks = chunkTextSemantically(text, this.options.chunkSize, this.options.chunkOverlap);
      } else {
        throw new Error('chunkTextSemantically not available');
      }
    } catch (error) {
      logger.warn('Semantic chunking failed, falling back to simple chunking:', error);
      // Fallback to simple chunking
      const textChunks = chunkText(text, this.options.chunkSize, this.options.chunkOverlap);
      let startOffset = 0;

      textChunks.forEach((chunkText, index) => {
        const endOffset = startOffset + chunkText.length;

        const chunk: DocumentChunk = {
          id: generateId(),
          documentId,
          chunkIndex: index,
          text: chunkText,
          metadata: {
            startOffset,
            endOffset
          },
          createdAt: new Date()
        };

        chunks.push(chunk);
        startOffset = endOffset - this.options.chunkOverlap;
      });

      return chunks;
    }

    // Process semantic chunks
    semanticChunks.forEach((semanticChunk: any, index: number) => {
      const chunk: DocumentChunk = {
        id: generateId(),
        documentId,
        chunkIndex: index,
        text: semanticChunk.text,
        metadata: {
          startOffset: semanticChunk.metadata.startOffset,
          endOffset: semanticChunk.metadata.endOffset,
          section: semanticChunk.metadata.headingText,
          // Store additional semantic metadata as extended properties
          ...(semanticChunk.metadata.hasHeading && { hasHeading: semanticChunk.metadata.hasHeading }),
          ...(semanticChunk.metadata.sentenceCount && { sentenceCount: semanticChunk.metadata.sentenceCount }),
          ...(semanticChunk.metadata.paragraphIndex && { paragraphIndex: semanticChunk.metadata.paragraphIndex })
        },
        createdAt: new Date()
      };

      chunks.push(chunk);
    });

    logger.info(`Created ${chunks.length} semantic chunks for document ${documentId}`);
    return chunks;
  }

  async reindexDocument(documentId: string): Promise<string> {
    const document = await this.db.getDocument(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Reset document status
    document.status = DocumentStatus.PENDING;
    this.db.addDocument(document);

    return this.startDocumentIndexing(documentId);
  }

  async reindexFolder(folderId: string): Promise<string> {
    const documents = await this.db.getDocuments(folderId);
    
    // Reset all documents to pending
    for (const document of documents) {
      document.status = DocumentStatus.PENDING;
      this.db.addDocument(document);
    }

    return this.startFolderIndexing(folderId);
  }

  getJob(jobId: string): IndexingJob | null {
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      return activeJob;
    }

    return null;
  }

  async getJobs(status?: JobStatus): Promise<IndexingJob[]> {
    return this.db.getJobs(status);
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === JobStatus.RUNNING) {
      job.status = JobStatus.CANCELLED;
      this.db.updateJob(jobId, { status: JobStatus.CANCELLED, completedAt: new Date() });
      this.activeJobs.delete(jobId);
      logger.info(`Cancelled job: ${jobId}`);
    }
  }

  private resumePendingJobs(): void {
    Promise.all([
      // Requeue docs stuck in 'processing' (server restarted mid-file)
      this.db.resetStuckProcessingDocuments(),
      // Auto-resume folders that still have pending docs
      this.db.getFoldersWithPendingDocuments(),
      this.db.getJobs(JobStatus.RUNNING)
    ]).then(async ([, foldersWithPending, runningJobs]) => {
      for (const folderId of foldersWithPending) {
        this.startFolderIndexing(folderId);
      }
      if (foldersWithPending.length > 0) {
        logger.info(`Resuming index jobs for ${foldersWithPending.length} folder(s) with pending documents`);
      }

      for (const job of runningJobs) {
        // Reset running jobs to queued on startup
        this.db.updateJob(job.id, { status: JobStatus.QUEUED });

        // Restart the job
        if (job.folderId) {
          this.startFolderIndexing(job.folderId);
        } else if (job.documentId) {
          this.startDocumentIndexing(job.documentId);
        }
      }

      if (runningJobs.length > 0) {
        logger.info(`Resumed ${runningJobs.length} running indexing jobs`);
      }
    }).catch(error => {
      logger.error('Error resuming pending jobs:', error);
    });
  }

  async getIndexingStats() {
    const stats = await this.db.getStats();
    const activeJobCount = this.activeJobs.size;
    const queuedJobs = (await this.db.getJobs(JobStatus.QUEUED)).length;

    return {
      ...stats,
      activeJobs: activeJobCount,
      queuedJobs,
      processingCapacity: this.options.maxConcurrentProcessing
    };
  }

  async cleanup(): Promise<void> {
    // Cancel all active jobs
    for (const [jobId] of this.activeJobs) {
      await this.cancelJob(jobId);
    }
    logger.info('Indexing service cleaned up');
  }
}