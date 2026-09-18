import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DocumentProcessor, ProcessedDocument } from '@atlas/document';
import { isPathSafe, createLogger } from '@atlas/core';

const logger = createLogger('FS_ACCESS');

const MAX_DEPTH_DEFAULT = 8;
const MAX_CANDIDATES = 30;
const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB, matches DocumentProcessor default
const MAX_CACHE_SIZE = 64;
// Mirrors the SUPPORTED set used by quick-index discovery so the explorer's
// "supported" badge matches what the indexer would actually accept.
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.xls', '.txt', '.md', '.markdown', '.csv',
  '.jpg', '.jpeg', '.png', '.webp'
]);

export interface FSCandidate {
  path: string;
  name: string;
  folderPath: string;
  folderId: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  isIndexed: boolean;
}

export interface DirectReadResult {
  path: string;
  name: string;
  extension: string;
  text: string;
  metadata: Record<string, any>;
  cacheHit: boolean;
}

export class FilesystemAccessService {
  private processor: DocumentProcessor;
  private allowlistRoots: string[] = [];
  private contentCache: Map<string, { text: string; metadata: Record<string, any> }> = new Map();

  constructor() {
    // Reuse the SAME processor the indexing pipeline uses — no second parser,
    // supports PDF/DOCX/TXT/MD/CSV/XLSX/XLS/images via existing extensions.
    this.processor = new DocumentProcessor({
      enableOCR: process.env.ENABLE_OCR === 'true',
      maxFileSize: MAX_READ_SIZE
    });
    logger.info('FilesystemAccessService initialized (lazy direct-read)');
  }

  /** Set the allowlist of connected folder roots. Direct reads only ever touch
      paths inside these roots (enforced by isPathSafe before every read). */
  setAllowlistedRoots(roots: string[]): void {
    this.allowlistRoots = roots.map((r) => path.resolve(r));
    logger.info(`FS allowlist updated: ${this.allowlistRoots.length} roots`);
  }

  getAllowlistRoots(): string[] {
    return [...this.allowlistRoots];
  }

  isPathAllowed(filePath: string): boolean {
    if (this.allowlistRoots.length === 0) return false;
    return isPathSafe(filePath, this.allowlistRoots);
  }

  /** Lazy metadata discovery over connected folders — filename/path only,
      never reads file contents at browse time. Bounded walk (max depth +
      max candidates) so browsing stays O(depth * direntries), never O(all files). */
  async discoverCandidates(
    keywords: string,
    limit: number = MAX_CANDIDATES
  ): Promise<FSCandidate[]> {
    if (this.allowlistRoots.length === 0) {
      logger.debug('[FS_DISCOVERY] no connected folders, skipping');
      return [];
    }

    const tokens = keywords
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return [];

    const candidates: FSCandidate[] = [];
    const seenPaths = new Set<string>();

    for (const root of this.allowlistRoots) {
      await this.walk(root, 0, tokens, candidates, seenPaths, limit);
      if (candidates.length >= limit) break;
    }

    logger.info(`[FS_DISCOVERY] candidates=${candidates.length} for keywords="${keywords}"`);
    return candidates.slice(0, limit);
  }

  private async walk(
    dir: string,
    depth: number,
    tokens: string[],
    out: FSCandidate[],
    seenPaths: Set<string>,
    limit: number
  ): Promise<void> {
    if (depth > MAX_DEPTH_DEFAULT || out.length >= limit) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (out.length >= limit) return;

      const fullPath = path.join(dir, entry.name);
      const isDir = entry.isDirectory();

      if (isDir) {
        await this.walk(fullPath, depth + 1, tokens, out, seenPaths, limit);
        continue;
      }

      // Metadata-only: match on filename/path tokens. No content read here.
      const lowerName = entry.name.toLowerCase();
      const isMatch = tokens.every((t) => lowerName.includes(t));
      if (!isMatch) continue;
      if (seenPaths.has(fullPath)) continue;

      seenPaths.add(fullPath);
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }

      out.push({
        path: fullPath,
        name: entry.name,
        folderPath: dir,
        folderId: '',
        extension: path.extname(entry.name).toLowerCase(),
        size: stats.size,
        modifiedAt: stats.mtime,
        isIndexed: false
      });
    }
  }

  /** DIRECT FILE READ — used ONLY when a query actually needs content and the
      FTS index has no answer. Reads the candidate(s) from disk via the SAME
      DocumentProcessor used by indexing (single parser, no duplication).
      Cache is keyed on path+size+mtime; raw file changes invalidate it. */
  async readFileDirect(
    filePath: string
  ): Promise<{ path: string; name: string; result: DirectReadResult }> {
    const resolved = path.resolve(filePath);
    if (!this.isPathAllowed(resolved)) {
      logger.warn(`[FS_DIRECT_READ] blocked path=${resolved} (outside allowlist)`);
      throw new Error('Akses ditolak: file berada di luar folder yang terhubung.');
    }

    const stats = await fs.stat(resolved);
    if (stats.size > MAX_READ_SIZE) {
      throw new Error('File terlalu besar untuk dibaca langsung.');
    }

    const cacheKey = `${resolved}::${stats.size}::${stats.mtimeMs}`;
    const cached = this.contentCache.get(cacheKey);
    if (cached) {
      logger.info(`[FS_DIRECT_READ] cacheHit=true path=${path.basename(resolved)}`);
      return {
        path: resolved,
        name: path.basename(resolved),
        result: {
          path: resolved,
          name: path.basename(resolved),
          extension: path.extname(resolved).toLowerCase(),
          text: cached.text,
          metadata: cached.metadata || {},
          cacheHit: true
        }
      };
    }

    logger.info(`[FS_DIRECT_READ] reading path=${path.basename(resolved)}`);
    const processed = await this.processor.processDocument(resolved);
    if (processed.text.length === 0) {
      throw new Error('File tidak memiliki teks yang bisa dibaca.');
    }

    const entry = {
      path: resolved,
      name: path.basename(resolved),
      extension: path.extname(resolved).toLowerCase(),
      text: processed.text,
      metadata: processed.metadata || {},
      cacheHit: false
    };

    if (this.contentCache.size >= MAX_CACHE_SIZE) {
      const oldest = this.contentCache.keys().next().value;
      if (oldest) this.contentCache.delete(oldest);
    }
    this.contentCache.set(cacheKey, entry);

    return { path: resolved, name: entry.name, result: entry };
  }

  /** Bounded single-level listing for the document explorer UI. Lists only
      entries directly inside `dir`; permission is enforced against the
      allowlist (same rule as readFileDirect). Never reads file contents. */
  async browseDirectory(dir: string): Promise<{
    currentPath: string;
    currentName: string;
    parentPath: string | null;
    directories: Array<{ name: string; path: string }>;
    files: Array<{ name: string; path: string; extension: string; size: number; modifiedAt: Date; isSupported: boolean }>;
  }> {
    const resolved = path.resolve(dir);
    if (!this.isPathAllowed(resolved)) {
      throw new Error('Akses ditolak: path berada di luar folder yang terhubung.');
    }

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(resolved, { withFileTypes: true });
    } catch {
      throw new Error('Folder tidak dapat dibaca.');
    }

    const directories: Array<{ name: string; path: string }> = [];
    const files: Array<{ name: string; path: string; extension: string; size: number; modifiedAt: Date; isSupported: boolean }> = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(resolved, entry.name);
      if (entry.isDirectory()) {
        directories.push({ name: entry.name, path: fullPath });
        continue;
      }
      if (!entry.isFile()) continue;

      let size = 0;
      let modifiedAt = new Date(0);
      try {
        const stats = await fs.stat(fullPath);
        size = stats.size;
        modifiedAt = stats.mtime;
      } catch {
        continue; // Unreadable entry: skip rather than render a broken row.
      }

      const extension = path.extname(entry.name).toLowerCase();
      const isSupported = SUPPORTED_EXTENSIONS.has(extension);
      files.push({ name: entry.name, path: fullPath, extension, size, modifiedAt, isSupported });
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(resolved);
    const parentAllowed = parentPath !== resolved && this.isPathAllowed(parentPath);

    return {
      currentPath: resolved,
      currentName: path.basename(resolved),
      parentPath: parentAllowed ? parentPath : null,
      directories,
      files
    };
  }

  /** Pick a default start directory for the native dialog: the first
      connected root that exists on disk, or the OS home directory. */
  async getDefaultBrowsePath(): Promise<string> {
    for (const root of this.allowlistRoots) {
      try {
        const stats = await fs.stat(root);
        if (stats.isDirectory()) return root;
      } catch {
        continue;
      }
    }
    return os.homedir();
  }

  async clearCache(): Promise<void> {
    this.contentCache.clear();
    logger.info('[FS_DIRECT_READ] cache cleared');
  }
}
