import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { AtlasDatabase } from './database.js';
import { IndexingService } from './services/indexing.js';
import { SearchService } from './services/search.js';
import { FolderService } from './services/folder.js';
import { AIService } from './services/ai.js';
import { createLogger } from '@atlas/core';
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from both root and local
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const logger = createLogger('SERVER');

export class AtlasServer {
  private app: ReturnType<typeof fastify>;
  private db!: AtlasDatabase;
  private indexingService!: IndexingService;
  private searchService!: SearchService;
  private folderService!: FolderService;
  private aiService!: AIService;

  constructor() {
    this.app = fastify({
      logger: process.env.NODE_ENV === 'development'
    });
  }

  async initialize(): Promise<void> {
    await this.setupDatabase();
    this.setupServices();
    await this.setupMiddleware();
    await this.setupRoutes();
  }

  private async setupDatabase(): Promise<void> {
    const dbPath = process.env.DATABASE_PATH || './data/atlas.db';
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    this.db = new AtlasDatabase(dbPath);
    await this.db.initialize();
    logger.info('Database initialized');
  }

  private setupServices(): void {
    this.folderService = new FolderService(this.db);
    this.indexingService = new IndexingService(this.db, {
      enableOCR: process.env.ENABLE_OCR === 'true',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
      maxConcurrentProcessing: parseInt(process.env.MAX_CONCURRENT_PROCESSING || '3')
    });
    this.searchService = new SearchService(this.db);
    const defaultProvider = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'mock';
    this.aiService = new AIService(this.searchService, {
      provider: process.env.AI_PROVIDER || defaultProvider,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.AI_MODEL || 'openai/gpt-4o-mini',
      embeddingModel: process.env.EMBEDDING_MODEL || 'openai/text-embedding-ada-002'
    });

    logger.info('Services initialized');
  }

  private async setupMiddleware(): Promise<void> {
    // CORS
    await this.app.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    });

    // Multipart support for file uploads
    await this.app.register(multipart, {
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800')
      }
    });

    // Serve static files (for frontend)
    const publicPath = path.join(__dirname, '../../../apps/web/dist');
    if (await fs.access(publicPath).then(() => true).catch(() => false)) {
      await this.app.register(staticFiles, {
        root: publicPath,
        prefix: '/'
      });
    }

    // Global error handler
    this.app.setErrorHandler((error, request, reply) => {
      logger.error(`Request error: ${error.message}`, { 
        url: request.url,
        method: request.method,
        stack: error.stack 
      });

      const statusCode = error.statusCode || 500;
      reply.status(statusCode).send({
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message,
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }
      });
    });

    logger.info('Middleware configured');
  }

  private async setupRoutes(): Promise<void> {
    // Health check
    this.app.get('/api/health', async () => {
      const stats = this.db.getStats();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        stats
      };
    });

    // Register API routes
    await registerRoutes(this.app, {
      db: this.db,
      folderService: this.folderService,
      indexingService: this.indexingService,
      searchService: this.searchService,
      aiService: this.aiService
    });

    logger.info('Routes configured');
  }

  async start(port: number = 3000): Promise<void> {
    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      logger.info(`ATLAS server running on http://localhost:${port}`);
      logger.info(`API documentation available at http://localhost:${port}/api/health`);
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
    this.db.close();
    logger.info('Server stopped');
  }

  getApp() {
    return this.app;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AtlasServer();
  const port = parseInt(process.env.PORT || '3000');
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await server.stop();
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await server.stop();
  });

  // Initialize and start server
  server.initialize().then(() => {
    server.start(port);
  }).catch((error) => {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  });
}