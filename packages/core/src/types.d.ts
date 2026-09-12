export interface Document {
    id: string;
    name: string;
    path: string;
    extension: string;
    size: number;
    createdAt: Date;
    modifiedAt: Date;
    hash: string;
    mimeType: string;
    folderId: string;
    status: DocumentStatus;
    indexedAt?: Date;
    metadata?: DocumentMetadata;
}
export declare enum DocumentStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    INDEXED = "indexed",
    ERROR = "error"
}
export interface DocumentMetadata {
    pageCount?: number;
    sheetCount?: number;
    author?: string;
    title?: string;
    subject?: string;
    keywords?: string[];
    language?: string;
}
export interface Folder {
    id: string;
    path: string;
    name: string;
    addedAt: Date;
    lastScanned?: Date;
    documentCount: number;
    isActive: boolean;
}
export interface DocumentChunk {
    id: string;
    documentId: string;
    chunkIndex: number;
    text: string;
    metadata: ChunkMetadata;
    embedding?: number[];
    createdAt: Date;
}
export interface ChunkMetadata {
    page?: number;
    sheet?: string;
    section?: string;
    startOffset: number;
    endOffset: number;
}
export interface SearchResult {
    documentId: string;
    chunkId: string;
    score: number;
    snippet: string;
    metadata: ChunkMetadata;
    document: Document;
}
export interface SearchQuery {
    query: string;
    limit?: number;
    filters?: SearchFilters;
    mode: SearchMode;
}
export declare enum SearchMode {
    KEYWORD = "keyword",
    SEMANTIC = "semantic",
    HYBRID = "hybrid"
}
export interface SearchFilters {
    extensions?: string[];
    folderIds?: string[];
    dateRange?: {
        start?: Date;
        end?: Date;
    };
}
export interface AIQuery {
    question: string;
    context: SearchResult[];
    conversationId?: string;
}
export interface AIResponse {
    answer: string;
    sources: AISource[];
    confidence?: number;
}
export interface AISource {
    documentId: string;
    chunkId: string;
    page?: number;
    sheet?: string;
    snippet: string;
}
export interface IndexingJob {
    id: string;
    type: IndexingJobType;
    status: JobStatus;
    folderId?: string;
    documentId?: string;
    progress: number;
    totalItems: number;
    processedItems: number;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
}
export declare enum IndexingJobType {
    FOLDER_SCAN = "folder_scan",
    DOCUMENT_PROCESS = "document_process",
    REINDEX = "reindex"
}
export declare enum JobStatus {
    QUEUED = "queued",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export interface Configuration {
    ai: AIConfiguration;
    indexing: IndexingConfiguration;
    security: SecurityConfiguration;
}
export interface AIConfiguration {
    provider: string;
    apiKey?: string;
    model: string;
    embeddingModel: string;
    maxTokens: number;
    temperature: number;
}
export interface IndexingConfiguration {
    chunkSize: number;
    chunkOverlap: number;
    maxFileSize: number;
    supportedExtensions: string[];
    maxConcurrentProcessing: number;
    enableOCR: boolean;
}
export interface SecurityConfiguration {
    allowedPaths: string[];
    maxPathDepth: number;
    preventPathTraversal: boolean;
}
export interface APIError {
    code: string;
    message: string;
    details?: any;
}
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
