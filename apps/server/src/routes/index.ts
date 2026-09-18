import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { AtlasDatabase } from '../database.js';
import { FolderService } from '../services/folder.js';
import { IndexingService } from '../services/indexing.js';
import { SearchService } from '../services/search.js';
import { AIService } from '../services/ai.js';
import { FilesystemAccessService } from '../services/filesystem.js';

export interface ServiceDependencies {
  db: AtlasDatabase;
  folderService: FolderService;
  indexingService: IndexingService;
  searchService: SearchService;
  aiService: AIService;
  filesystemAccess: FilesystemAccessService;
}

export async function registerRoutes(app: FastifyInstance, services: ServiceDependencies) {
  const { db, folderService, indexingService, searchService, aiService, filesystemAccess } = services;

  // Give the indexing pipeline access to the embedding provider so newly
  // indexed chunks get vectors for semantic search.
  indexingService.setAiService(aiService);

  // Folder management routes
  await app.register(async (fastify) => {
    fastify.get('/folders', async () => {
      // Must await: getFolders() is async — without it Fastify serializes the
      // Promise as {} and the sidebar's connected-folders list is empty.
      const folders = await folderService.getFolders();
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
        
        // Lazy filesystem: update allowlist so new folder is immediately
        // searchable without auto-indexing. No content scan/parsing.
        const allFolders = await folderService.getFolders();
        filesystemAccess.setAllowlistedRoots(allFolders.map(f => f.path).filter(Boolean));
        
        return { 
          folder,
          message: `Folder "${folder.name}" berhasil terhubung. Eksplorasi filesystem siap digunakan.`
        };
      } catch (error: any) {
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
        // Keep the FS allowlist in sync: a removed folder must immediately
        // lose direct-read/discovery access (security guarantee made in UI).
        const allFolders = await folderService.getFolders();
        filesystemAccess.setAllowlistedRoots(allFolders.map(f => f.path).filter(Boolean));
        return { success: true };
      } catch (error: any) {
        reply.status(404);
        return {
          error: {
            code: 'FOLDER_NOT_FOUND',
            message: error.message
          }
        };
      }
    });

    // Remove ALL folders and their indexed data (sidebar "Hapus Semua").
    fastify.delete('/folders', async () => {
      await folderService.removeAllFolders();
      const allFolders = await folderService.getFolders();
      filesystemAccess.setAllowlistedRoots(allFolders.map(f => f.path).filter(Boolean));
      return { success: true };
    });

    // Browser-folder upload fallback: receives files from the webkitdirectory
    // input and writes them under <data-dir>/uploads/<folderName>/ so the
    // normal indexing pipeline can process them like any local folder.
    fastify.post('/folders/upload', async (request, reply) => {
      try {
        // parts() (not files()) so the leading 'folderName' text field is
        // visible in the same stream.
        const files: Array<{ buffer: Buffer; relPath: string }> = [];
        let folderName = '';

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            const buffer = await part.toBuffer();
            // The webkitdirectory input passes "root/sub/dir/file.ext" as the
            // filename — strip the leading root segment so relative structure
            // inside the upload folder is preserved.
            const relPath = part.filename && part.filename.includes('/')
              ? part.filename.split('/').slice(1).join('/')
              : (part.filename || '');
            files.push({ buffer, relPath });
          } else if (part.fieldname === 'folderName') {
            folderName = String((part as any).value ?? '');
          }
        }

        const safeName = path.basename(folderName || 'uploaded-folder').replace(/[\r\n]/g, '');
        if (!safeName || safeName === '.' || safeName === '..') {
          reply.status(400);
          return { error: { code: 'INVALID_FOLDER_NAME', message: 'Nama folder tidak valid.' } };
        }
        if (files.length === 0) {
          reply.status(400);
          return { error: { code: 'NO_FILES', message: 'Tidak ada file yang diunggah.' } };
        }

        // Store uploads inside the server data dir (keeps everything local).
        const dataDir = process.env.DATABASE_PATH
          ? path.dirname(path.resolve(process.env.DATABASE_PATH))
          : path.resolve('./data');
        const targetDir = path.join(dataDir, 'uploads', safeName);
        await fs.mkdir(targetDir, { recursive: true });

        let written = 0;
        for (const file of files) {
          const rel = file.relPath.replace(/\.\./g, '').replace(/^[a-zA-Z]:[\\/]/, '');
          const dest = path.resolve(targetDir, rel);
          if (!dest.startsWith(path.resolve(targetDir) + path.sep) && dest !== path.resolve(targetDir)) {
            continue; // Path traversal guard.
          }
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, file.buffer);
          written++;
        }

        if (written === 0) {
          reply.status(400);
          return { error: { code: 'NO_FILES_WRITTEN', message: 'Gagal menulis file unggahan.' } };
        }

        const folder = await folderService.addFolder(targetDir);
        const allFolders = await folderService.getFolders();
        filesystemAccess.setAllowlistedRoots(allFolders.map(f => f.path).filter(Boolean));

        return { folder, message: `Folder "${folder.name}" berhasil ditambahkan dari unggahan.` };
      } catch (error: any) {
        reply.status(400);
        return {
          error: {
            code: 'FOLDER_UPLOAD_FAILED',
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
      } catch (error: any) {
        reply.status(404);
        return { 
          error: {
            code: 'FOLDER_SCAN_FAILED',
            message: error.message
          }
        };
      }
    });

    fastify.post('/folders/:id/quick-index', {
      schema: { body: { type: 'object' } },
      handler: async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
          const jobId = await indexingService.startQuickIndex(id);
          return { indexingJobId: jobId };
        } catch (error: any) {
          reply.status(404);
          return { 
            error: {
              code: 'FOLDER_QUICK_INDEX_FAILED',
              message: error.message
            }
          };
        }
      }
    });

    fastify.get('/folders/:id/quick-index/progress', async (request, reply) => {
      const { id } = request.params as { id: string };
      const jobId = indexingService.getFolderQuickIndexJobId(id);
      if (!jobId) {
        reply.status(404);
        return { error: 'Job not found' };
      }
      const progress = indexingService.getQuickIndexProgress(jobId);
      if (!progress) {
        reply.status(404);
        return { error: 'Progress not found' };
      }
      return { progress };
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

      const documents = await db.getDocuments(folderId, status as any);
      
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
      
      const document = await db.getDocument(id);
      if (!document) {
        reply.status(404);
        return { 
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found'
          }
        };
      }

      const chunks = await db.getChunks(id);
      
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
      } catch (error: any) {
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
      
      const document = await db.getDocument(id);
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
      if (!await folderService.validateFolderAccess(document.path)) {
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
      } catch (error: any) {
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
      return await searchService.getSearchStats();
    });
  }, { prefix: '/api' });

  // Indexing routes
  await app.register(async (fastify) => {
    fastify.get('/indexing/jobs', async (request) => {
      const { status } = request.query as { status?: string };
      const jobs = await indexingService.getJobs(status as any);
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
      return await indexingService.getIndexingStats();
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
      } catch (error: any) {
        reply.status(500);
        return {
          error: {
            code: 'CHAT_FAILED',
            message: error.message
          }
        };
      }
    });

    fastify.get('/ai/status', async () => {
      const providerInfo = aiService.getProviderInfo();
      return {
        provider: providerInfo.provider,
        providerId: providerInfo.providerId,
        configured: providerInfo.configured,
        available: providerInfo.configured,
        hasApiKey: providerInfo.hasApiKey,
        model: providerInfo.model,
        embeddingModel: providerInfo.embeddingModel,
        autoFallback: providerInfo.autoFallback
      };
    });

    // Model catalog for the Settings dropdowns.
    fastify.get('/ai/models', async (request, reply) => {
      try {
        const { apiKey } = (request.query || {}) as { apiKey?: string };
        const models = await aiService.listModels(apiKey);
        return { success: true, chat: models.chat, embedding: models.embedding };
      } catch (error: any) {
        reply.status(502);
        return { success: false, message: error.message };
      }
    });

    // Persist runtime AI configuration (Settings "Simpan Pengaturan").
    fastify.post('/ai/config', async (request, reply) => {
      const { provider, apiKey, model, embeddingModel, autoFallback } = (request.body || {}) as {
        provider?: string;
        apiKey?: string;
        model?: string;
        embeddingModel?: string;
        autoFallback?: boolean;
      };

      // Ignore the masked placeholder the frontend sends back untouched.
      const isMasked = typeof apiKey === 'string' && apiKey.includes('•');
      const effectiveApiKey = isMasked ? undefined : apiKey;

      if (provider === undefined && effectiveApiKey === undefined && model === undefined && embeddingModel === undefined && autoFallback === undefined) {
        reply.status(400);
        return { error: { code: 'EMPTY_CONFIG', message: 'Tidak ada pengaturan yang dikirim.' } };
      }

      try {
        aiService.updateConfig({
          ...(provider !== undefined ? { provider } : {}),
          ...(effectiveApiKey !== undefined ? { apiKey: effectiveApiKey } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(embeddingModel !== undefined ? { embeddingModel } : {}),
          ...(autoFallback !== undefined ? { autoFallback } : {})
        });

        // Persist server-side so config survives restarts (restored in index.ts).
        await db.setSetting('ai_config', JSON.stringify(aiService.getEffectiveConfig()));

        const info = aiService.getProviderInfo();
        return {
          success: true,
          hasApiKey: info.hasApiKey,
          model: info.model,
          embeddingModel: info.embeddingModel,
          provider: info.provider,
          providerId: info.providerId,
          configured: info.configured
        };
      } catch (error: any) {
        reply.status(400);
        return { error: { code: 'CONFIG_SAVE_FAILED', message: error.message } };
      }
    });

    // Connection test. Accepts an optional API key to test BEFORE saving it.
    fastify.post('/ai/test', async (request) => {
      try {
        const { apiKey } = (request.body || {}) as { apiKey?: string };
        const masked = typeof apiKey === 'string' && apiKey.includes('•');
        const testResult = await aiService.testConnection(masked ? undefined : apiKey);
        return testResult;
      } catch (error: any) {
        return {
          success: false,
          code: 'UNKNOWN',
          message: error.message
        };
      }
    });
  }, { prefix: '/api' });

  // Statistics and system info
  await app.register(async (fastify) => {
    fastify.get('/stats', async (request, reply) => {
      const dbStats = await db.getStats();
      const searchStats = await searchService.getSearchStats();
      const indexingStats = await indexingService.getIndexingStats();

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

    // Filesystem explorer listing for the Documents page.
    // Bounded single-level listing; enforced against the connected-folder
    // allowlist (same rule as direct reads). Never reads file contents.
    fastify.get('/fs/browse', async (request, reply) => {
      const { path: requestedPath } = request.query as { path?: string };

      try {
        if (!requestedPath) {
          const start = await filesystemAccess.getDefaultBrowsePath();
          const listing = await filesystemAccess.browseDirectory(start);
          return {
            ...listing,
            quickLocations: buildQuickLocations(),
            files: listing.files.map(toExplorerFile)
          };
        }

        const listing = await filesystemAccess.browseDirectory(requestedPath);
        return {
          ...listing,
          quickLocations: buildQuickLocations(),
          files: listing.files.map(toExplorerFile)
        };
      } catch (error: any) {
        const isDenied = String(error.message || '').includes('ditolak');
        reply.status(isDenied ? 403 : 400);
        return {
          error: {
            code: isDenied ? 'ACCESS_DENIED' : 'BROWSE_FAILED',
            message: error.message
          }
        };
      }
    });

    // Native OS folder picker. Only meaningful when ATLAS runs on the user's
    // desktop (Electron); the browser build reports unsupported and the UI
    // falls back to manual path or the webkitdirectory upload.
    fastify.post('/fs/browse-dialog', async (_request, reply) => {
      reply.send({ success: false, unsupported: true });
    });

    // Shared helpers for the /fs/browse response shape expected by DocumentsPage
function buildQuickLocations(): Array<{ id: string; label: string; icon: string; path: string }> {
  const home = os.homedir();
  return [
    { id: 'home', label: 'Home', icon: '🏠', path: home },
    { id: 'documents', label: 'Documents', icon: '📄', path: path.join(home, 'Documents') },
    { id: 'downloads', label: 'Downloads', icon: '⬇️', path: path.join(home, 'Downloads') },
    { id: 'desktop', label: 'Desktop', icon: '🖥️', path: path.join(home, 'Desktop') }
  ];
}

function toExplorerFile(file: { name: string; path: string; extension: string; size: number; modifiedAt: Date; isSupported: boolean }) {
  return {
    name: file.name,
    path: file.path,
    extension: file.extension.replace('.', ''),
    size: file.size,
    modified_at: file.modifiedAt.toISOString(),
    isSupported: file.isSupported,
    isIndexed: false
  };
}

// Filesystem security - path traversal protection
    fastify.get('/fs/explore', async (request, reply) => {
      const { path: requestedPath } = request.query as { path?: string };
      if (!requestedPath) {
        reply.status(400);
        return { error: { code: 'INVALID_PATH', message: 'Path parameter required' } };
      }
      
      const isAllowed = await folderService.validateFolderAccess(requestedPath);
      if (!isAllowed) {
        reply.status(403);
        return { error: { code: 'ACCESS_DENIED', message: 'Access to this path is not allowed' } };
      }
      
      return { allowed: true, path: requestedPath };
    });
  }, { prefix: '/api' });
}