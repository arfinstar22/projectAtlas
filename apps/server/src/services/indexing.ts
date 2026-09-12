import { AtlasDatabase } from '../database.js';
import { 
  Document, 
  DocumentChunk, 
  IndexingJob, 
  DocumentStatus, 
  JobStatus, 
  IndexingJobType,
  generateId, 
  chunkText, 
  AsyncQueue, 
  createLogger 
} from '@atlas/core';
import { DocumentProcessor, ProcessingOptions } from '@atlas/document';

const logger = createLogger('INDEXING_SERVICE');

export interface IndexingServiceOptions extends ProcessingOptions {
  chunkSize: number;
  chunkOverlap: number;
  maxConcurrentProcessing: number;
}

export class IndexingService {
  private db: AtlasDatabase;
  private processor: DocumentProcessor;
  private queue: AsyncQueue;
  private options: IndexingServiceOptions;
  private activeJobs: Map<string, IndexingJob> = new Map();

  constructor(db: AtlasDatabase, options: IndexingServiceOptions) {
    this.db = db;
    this.options = options;
    this.processor = new DocumentProcessor({
      enableOCR: options.enableOCR,
      maxFileSize: options.maxFileSize,
      ocrLanguages: ['eng', 'ind'] // English + Indonesian
    });
    this.queue = new AsyncQueue(options.maxConcurrentProcessing);

    // Resume any pending jobs on startup
    this.resumePendingJobs();
  }

  async startFolderIndexing(folderId: string): Promise<string> {
    const documents = await this.db.getDocuments(folderId, DocumentStatus.PENDING);
    
    const job: IndexingJob = {
      id: generateId(),
      type: IndexingJobType.FOLDER_SCAN,
      status: JobStatus.QUEUED,
      folderId,
      progress: 0,
      totalItems: documents.length,
      processedItems: 0,
      startedAt: new Date()
    };

    this.db.addJob(job);
    this.activeJobs.set(job.id, job);

    // Process documents in background
    this.processDocumentsInJob(job.id, documents);

    logger.info(`Started indexing job for folder ${folderId}: ${job.id}`);
    return job.id;
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
      for (const document of documents) {
        await this.queue.add(() => this.processDocument(document, jobId));
      }

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
      // Update document status
      this.db.updateDocumentStatus(document.id, DocumentStatus.PROCESSING);

      // Remove existing chunks if re-processing
      this.db.deleteDocumentChunks(document.id);

      // Process document content
      const processed = await this.processor.processDocument(document.path);

      // Update document with extracted metadata
      if (processed.metadata) {
        document.metadata = processed.metadata;
        this.db.addDocument(document);
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
    this.db.getJobs(JobStatus.RUNNING).then(pendingJobs => {
      for (const job of pendingJobs) {
        // Reset running jobs to queued on startup
        this.db.updateJob(job.id, { status: JobStatus.QUEUED });
        
        // Restart the job
        if (job.folderId) {
          this.startFolderIndexing(job.folderId);
        } else if (job.documentId) {
          this.startDocumentIndexing(job.documentId);
        }
      }

      if (pendingJobs.length > 0) {
        logger.info(`Resumed ${pendingJobs.length} pending indexing jobs`);
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