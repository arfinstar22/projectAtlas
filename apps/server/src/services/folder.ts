import { promises as fs } from 'fs';
import path from 'path';
import { watch } from 'chokidar';
import { AtlasDatabase } from '../database.js';
import { 
  Folder, 
  Document, 
  DocumentStatus,
  generateId, 
  isPathSafe, 
  getFileHash,
  createLogger 
} from '@atlas/core';

const logger = createLogger('FOLDER_SERVICE');

export class FolderService {
  private db: AtlasDatabase;
  private watchers: Map<string, any> = new Map();

  constructor(db: AtlasDatabase) {
    this.db = db;
  }

  async addFolder(folderPath: string): Promise<Folder> {
    // Normalize and validate path
    const normalizedPath = path.resolve(folderPath);
    
    // Check if folder exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
    } catch (error: any) {
      throw new Error(`Cannot access folder: ${error.message}`);
    }

    // Check if folder is already added
    const existingFolders = await this.db.getFolders();
    const existing = existingFolders.find(f => f.path === normalizedPath);
    if (existing) {
      throw new Error('Folder already added');
    }

    const folder: Folder = {
      id: generateId(),
      path: normalizedPath,
      name: path.basename(normalizedPath),
      addedAt: new Date(),
      documentCount: 0,
      isActive: true
    };

    await this.db.addFolder(folder);
    
    // Start watching for file changes
    this.startWatcher(folder.id, normalizedPath);
    
    logger.info(`Added folder: ${normalizedPath}`);
    return folder;
  }

  async removeFolder(folderId: string): Promise<void> {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Stop watching
    this.stopWatcher(folderId);
    
    // Remove from database (cascades to documents and chunks)
    await this.db.removeFolder(folderId);
    
    logger.info(`Removed folder: ${folder.path}`);
  }

  async getFolders(): Promise<Folder[]> {
    return await this.db.getFolders();
  }

  async getFolderById(id: string): Promise<Folder | null> {
    const folders = await this.db.getFolders();
    return folders.find(f => f.id === id) || null;
  }

  async scanFolder(folderId: string): Promise<Document[]> {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      throw new Error('Folder not found');
    }

    logger.info(`Scanning folder: ${folder.path}`);
    const documents = await this.scanDirectory(folder.path, folder.id);
    
    // Update scan time
    await this.db.updateFolderScanTime(folderId, new Date());
    
    return documents;
  }

  private async scanDirectory(dirPath: string, folderId: string): Promise<Document[]> {
    const documents: Document[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subDocs = await this.scanDirectory(fullPath, folderId);
          documents.push(...subDocs);
        } else if (entry.isFile()) {
          const doc = await this.processFileEntry(fullPath, folderId);
          if (doc) {
            documents.push(doc);
          }
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dirPath}:`, error);
    }
    
    return documents;
  }

  private async processFileEntry(filePath: string, folderId: string): Promise<Document | null> {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      // Check if it's a supported file type
      const supportedExtensions = ['.pdf', '.docx', '.txt', '.md', '.markdown', '.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.webp'];
      if (!supportedExtensions.includes(extension)) {
        return null;
      }

      // Check if document already exists
      const existing = await this.db.getDocumentByPath(filePath);
      if (existing) {
        // Check if file has been modified
        const currentHash = await getFileHash(filePath);
        if (existing.hash === currentHash) {
          // File unchanged, skip
          return existing;
        } else {
          // File modified, mark for reprocessing
          existing.hash = currentHash;
          existing.modifiedAt = stats.mtime;
          existing.status = DocumentStatus.PENDING;
          await this.db.addDocument(existing);
          return existing;
        }
      }

      // Create new document entry
      const hash = await getFileHash(filePath);
      const document: Document = {
        id: generateId(),
        name: path.basename(filePath),
        path: filePath,
        extension,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        hash,
        mimeType: this.getMimeType(extension),
        folderId,
        status: DocumentStatus.PENDING
      };

      this.db.addDocument(document);
      logger.debug(`Found new document: ${filePath}`);
      
      return document;
    } catch (error) {
      logger.error(`Error processing file ${filePath}:`, error);
      return null;
    }
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

  private startWatcher(folderId: string, folderPath: string): void {
    if (this.watchers.has(folderId)) {
      return; // Already watching
    }

    const watcher = watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 10, // Reasonable depth limit
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.*', // Hidden files
        '**/*.tmp',
        '**/*.temp'
      ]
    });

    watcher.on('add', (filePath) => {
      logger.debug(`File added: ${filePath}`);
      this.handleFileChange(filePath, folderId, 'added');
    });

    watcher.on('change', (filePath) => {
      logger.debug(`File changed: ${filePath}`);
      this.handleFileChange(filePath, folderId, 'changed');
    });

    watcher.on('unlink', (filePath) => {
      logger.debug(`File deleted: ${filePath}`);
      this.handleFileDelete(filePath);
    });

    watcher.on('error', (error) => {
      logger.error(`Watcher error for ${folderPath}:`, error);
    });

    this.watchers.set(folderId, watcher);
    logger.info(`Started watching: ${folderPath}`);
  }

  private stopWatcher(folderId: string): void {
    const watcher = this.watchers.get(folderId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderId);
      logger.info(`Stopped watching folder: ${folderId}`);
    }
  }

  private async handleFileChange(filePath: string, folderId: string, type: 'added' | 'changed'): Promise<void> {
    try {
      // Debounce rapid changes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const doc = await this.processFileEntry(filePath, folderId);
      if (doc) {
        logger.info(`File ${type}: ${filePath}`);
        // Trigger indexing if needed
        // This would be handled by the indexing service
      }
    } catch (error) {
      logger.error(`Error handling file change ${filePath}:`, error);
    }
  }

  private handleFileDelete(filePath: string): void {
    this.db.getDocumentByPath(filePath).then(document => {
      if (document) {
        this.db.deleteDocumentChunks(document.id);
        this.db.updateDocumentStatus(document.id, DocumentStatus.ERROR);
        logger.info(`File deleted: ${filePath}`);
      }
    });
  }

  async validateFolderAccess(filePath: string): Promise<boolean> {
    const folders = await this.db.getFolders();
    const allowedPaths = folders.map(f => f.path);
    return isPathSafe(filePath, allowedPaths);
  }

  async cleanup(): Promise<void> {
    // Stop all watchers
    for (const [folderId, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    logger.info('Folder service cleaned up');
  }
}