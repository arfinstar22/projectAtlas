import { FastifyInstance } from 'fastify';
import { AtlasDatabase } from '../database.js';
import { FolderService } from '../services/folder.js';
import { IndexingService } from '../services/indexing.js';
import { SearchService } from '../services/search.js';
import { AIService } from '../services/ai.js';

export interface ServiceDependencies {
  db: AtlasDatabase;
  folderService: FolderService;
  indexingService: IndexingService;
  searchService: SearchService;
  aiService: AIService;
}

export async function registerRoutes(app: FastifyInstance, services: ServiceDependencies) {
  const { db, folderService, indexingService, searchService, aiService } = services;

  // Folder management routes
  await app.register(async (fastify) => {
    fastify.get('/folders', async (request, reply) => {
      const folders = folderService.getFolders();
      return { folders };
    });

    fastify.post('/folders', {
      schema: {
        body: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      const { path } = request.body as { path: string };
      
      try {
        const folder = await folderService.addFolder(path);
        
        // Scan folder for files first
        await folderService.scanFolder(folder.id);

        // Start indexing the folder
        const jobId = await indexingService.startFolderIndexing(folder.id);
        
        return { 
          folder,
          indexingJobId: jobId
        };
      } catch (error) {
        reply.status(400);
        return { 
          error: {
            code: 'FOLDER_ADD_FAILED',
            message: error.message
          }
        };
      }
    });

    fastify.delete('/folders/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      try {
        await folderService.removeFolder(id);
        return { success: true };
      } catch (error) {
        reply.status(404);
        return { 
          error: {
            code: 'FOLDER_NOT_FOUND',
            message: error.message
          }
        };
      }
    });

    fastify.post('/folders/:id/scan', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      try {
        const documents = await folderService.scanFolder(id);
        const jobId = await indexingService.startFolderIndexing(id);
        
        return { 
          documentsFound: documents.length,
          indexingJobId: jobId
        };
      } catch (error) {
        reply.status(404);
        return { 
          error: {
            code: 'FOLDER_SCAN_FAILED',
            message: error.message
          }
        };
      }
    });
  }, { prefix: '/api' });

  // Document management routes
  await app.register(async (fastify) => {
    fastify.get('/documents', async (request, reply) => {
      const { folderId, status, page = 1, limit = 20 } = request.query as {
        folderId?: string;
        status?: string;
        page?: number;
        limit?: number;
      };

      const documents = db.getDocuments(folderId, status as any);
      
      // Simple pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedDocs = documents.slice(startIndex, endIndex);

      return {
        data: paginatedDocs,
        total: documents.length,
        page,
        limit,
        hasMore: endIndex < documents.length
      };
    });

    fastify.get('/documents/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const document = db.getDocument(id);
      if (!document) {
        reply.status(404);
        return { 
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found'
          }
        };
      }

      const chunks = db.getChunks(id);
      
      return { 
        document,
        chunks: chunks.length,
        preview: chunks[0]?.text.slice(0, 500) || ''
      };
    });

    fastify.post('/documents/:id/reindex', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      try {
        const jobId = await indexingService.reindexDocument(id);
        return { indexingJobId: jobId };
      } catch (error) {
        reply.status(404);
        return { 
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: error.message
          }
        };
      }
    });

    fastify.get('/documents/:id/source', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const document = db.getDocument(id);
      if (!document) {
        reply.status(404);
        return { 
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found'
          }
        };
      }

      // Validate path access
      if (!folderService.validateFolderAccess(document.path)) {
        reply.status(403);
        return { 
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access to this file is not allowed'
          }
        };
      }

      return {
        path: document.path,
        name: document.name,
        size: document.size,
        mimeType: document.mimeType
      };
    });
  }, { prefix: '/api' });

  // Search routes
  await app.register(async (fastify) => {
    fastify.post('/search', {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            mode: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'] },
            limit: { type: 'number', minimum: 1, maximum: 100 },
            filters: {
              type: 'object',
              properties: {
                extensions: { type: 'array', items: { type: 'string' } },
                folderIds: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      const searchQuery = request.body as any;
      
      if (!searchQuery.mode) {
        searchQuery.mode = 'keyword';
      }

      try {
        const results = await searchService.search(searchQuery);
        return { 
          results,
          query: searchQuery.query,
          mode: searchQuery.mode,
          total: results.length
        };
      } catch (error) {
        reply.status(500);
        return { 
          error: {
            code: 'SEARCH_FAILED',
            message: error.message
          }
        };
      }
    });

    fastify.get('/search/stats', async (request, reply) => {
      return searchService.getSearchStats();
    });
  }, { prefix: '/api' });

  // Indexing routes
  await app.register(async (fastify) => {
    fastify.get('/indexing/jobs', async (request, reply) => {
      const { status } = request.query as { status?: string };
      const jobs = indexingService.getJobs(status as any);
      return { jobs };
    });

    fastify.get('/indexing/jobs/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const job = indexingService.getJob(id);
      if (!job) {
        reply.status(404);
        return { 
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Indexing job not found'
          }
        };
      }

      return { job };
    });

    fastify.post('/indexing/jobs/:id/cancel', async (request, reply) => {
      const { id } = request.params as { id: string };
      
      try {
        await indexingService.cancelJob(id);
        return { success: true };
      } catch (error) {
        reply.status(404);
        return { 
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or cannot be cancelled'
          }
        };
      }
    });

    fastify.get('/indexing/stats', async (request, reply) => {
      return indexingService.getIndexingStats();
    });
  }, { prefix: '/api' });

  // AI Chat routes
  await app.register(async (fastify) => {
    fastify.post('/chat', {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            conversationId: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      const { message, conversationId } = request.body as { message: string; conversationId?: string };
      
      try {
        const response = await aiService.processChat({
          message,
          conversationId
        });
        
        return response;
      } catch (error) {
        reply.status(500);
        return {
          error: {
            code: 'CHAT_FAILED',
            message: error.message
          }
        };
      }
    });

    fastify.get('/ai/status', async (request, reply) => {
      const providerInfo = aiService.getProviderInfo();
      return {
        provider: providerInfo.name,
        configured: providerInfo.configured,
        available: providerInfo.configured
      };
    });

    fastify.post('/ai/test', async (request, reply) => {
      try {
        const testResult = await aiService.testConnection();
        return testResult;
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
  }, { prefix: '/api' });

  // Statistics and system info
  await app.register(async (fastify) => {
    fastify.get('/stats', async (request, reply) => {
      const dbStats = db.getStats();
      const searchStats = searchService.getSearchStats();
      const indexingStats = indexingService.getIndexingStats();

      return {
        database: dbStats,
        search: searchStats,
        indexing: indexingStats,
        timestamp: new Date().toISOString()
      };
    });

    fastify.get('/system', async (request, reply) => {
      return {
        version: process.env.npm_package_version || '0.1.0',
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
    });
  }, { prefix: '/api' });
}