import { AtlasDatabase } from '../database.js';
import { 
  SearchQuery, 
  SearchResult, 
  SearchMode, 
  DocumentChunk,
  Document,
  extractSnippet,
  createLogger 
} from '@atlas/core';
import { QueryAnalyzer, QueryAnalysis, QueryIntent } from './query-analyzer.js';

const logger = createLogger('SEARCH_SERVICE');

export class SearchService {
  public db: AtlasDatabase; // Made public for AI service access
  private queryAnalyzer: QueryAnalyzer;

  constructor(db: AtlasDatabase) {
    this.db = db;
    this.queryAnalyzer = new QueryAnalyzer();
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    logger.info(`Searching: "${query.query}" (mode: ${query.mode})`);

    switch (query.mode) {
      case SearchMode.KEYWORD:
        return this.keywordSearch(query);
      case SearchMode.SEMANTIC:
        return this.semanticSearch(query);
      case SearchMode.HYBRID:
        return this.hybridSearch(query);
      default:
        return this.keywordSearch(query);
    }
  }

  // Enhanced search specifically for RAG context retrieval
  async searchForContext(query: string, maxChunks: number = 5): Promise<{
    chunks: DocumentChunk[];
    analysis: QueryAnalysis;
    strategy: any;
  }> {
    logger.info(`Searching for RAG context: "${query}"`);

    // Analyze the query first
    const analysis = this.queryAnalyzer.analyzeQuery(query);
    const strategy = this.queryAnalyzer.getRetrievalStrategy(analysis);

    logger.info(`Query analysis:`, { 
      intent: analysis.intent, 
      expandedTermsCount: analysis.expandedTerms.length,
      strategy 
    });

    // Use enhanced hybrid retrieval
    const chunks = await this.enhancedHybridRetrieval(
      analysis, 
      Math.min(maxChunks, strategy.maxChunks)
    );

    return {
      chunks,
      analysis,
      strategy
    };
  }

  private async keywordSearch(query: SearchQuery): Promise<SearchResult[]> {
    const chunks = this.db.searchChunks(query.query, query.limit || 20);
    return this.processChunksToResults(chunks, query.query);
  }

  private async semanticSearch(query: SearchQuery): Promise<SearchResult[]> {
    // For MVP, fall back to keyword search
    // TODO: Implement vector search when embedding service is ready
    logger.debug('Semantic search not yet implemented, falling back to keyword search');
    return this.keywordSearch(query);
  }

  private async hybridSearch(query: SearchQuery): Promise<SearchResult[]> {
    // For MVP, use keyword search
    // TODO: Implement hybrid scoring when embedding service is ready
    return this.keywordSearch(query);
  }

  // Enhanced hybrid retrieval for RAG
  private async enhancedHybridRetrieval(analysis: QueryAnalysis, maxChunks: number): Promise<DocumentChunk[]> {
    const allCandidates: Map<string, {chunk: DocumentChunk, score: number, reasons: string[]}> = new Map();

    // 1. Original query search
    const originalResults = await this.db.searchChunks(analysis.originalQuery, maxChunks * 3);
    for (const chunk of originalResults) {
      const score = this.calculateEnhancedScore(chunk.text, analysis.originalQuery, analysis);
      allCandidates.set(chunk.id, {
        chunk,
        score: score * 1.0, // Original query gets full weight
        reasons: ['original_query']
      });
    }

    // 2. Expanded terms search
    for (const expandedTerm of analysis.expandedTerms.slice(1, 6)) { // Limit to top 5 expansions
      const expandedResults = await this.db.searchChunks(expandedTerm, maxChunks);
      for (const chunk of expandedResults) {
        if (allCandidates.has(chunk.id)) {
          const existing = allCandidates.get(chunk.id)!;
          existing.score += this.calculateEnhancedScore(chunk.text, expandedTerm, analysis) * 0.7;
          existing.reasons.push('expanded_term');
        } else {
          const score = this.calculateEnhancedScore(chunk.text, expandedTerm, analysis);
          allCandidates.set(chunk.id, {
            chunk,
            score: score * 0.7, // Expanded terms get 70% weight
            reasons: ['expanded_term']
          });
        }
      }
    }

    // 3. Key entities search
    for (const entity of analysis.keyEntities.slice(0, 3)) { // Top 3 entities
      const entityResults = await this.db.searchChunks(entity, maxChunks);
      for (const chunk of entityResults) {
        if (allCandidates.has(chunk.id)) {
          const existing = allCandidates.get(chunk.id)!;
          existing.score += this.calculateEnhancedScore(chunk.text, entity, analysis) * 0.5;
          existing.reasons.push('key_entity');
        } else {
          const score = this.calculateEnhancedScore(chunk.text, entity, analysis);
          allCandidates.set(chunk.id, {
            chunk,
            score: score * 0.5, // Entity matches get 50% weight
            reasons: ['key_entity']
          });
        }
      }
    }

    // 4. Sort candidates by score
    const sortedCandidates = Array.from(allCandidates.values())
      .sort((a, b) => b.score - a.score);

    logger.info(`Enhanced retrieval found ${sortedCandidates.length} candidates for query: "${analysis.originalQuery}"`);

    // 5. Apply context assembly strategy
    const selectedChunks = this.applyContextAssemblyStrategy(sortedCandidates, analysis, maxChunks);

    logger.info(`Selected ${selectedChunks.length} chunks after context assembly`);
    
    return selectedChunks;
  }

  private calculateEnhancedScore(text: string, query: string, analysis: QueryAnalysis): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    let score = 0;
    
    // Base keyword scoring
    if (textLower.includes(queryLower)) {
      score += 10;
    }
    
    // Individual word matches with Indonesian-aware scoring
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
    const textWords = textLower.split(/\s+/);
    
    for (const queryWord of queryWords) {
      const exactMatches = textWords.filter(word => word === queryWord).length;
      const partialMatches = textWords.filter(word => word.includes(queryWord) && word !== queryWord).length;
      
      score += exactMatches * 3;
      score += partialMatches * 1.5;
    }
    
    // Position bonus - matches near beginning are more important
    const firstMatchIndex = textLower.indexOf(queryLower);
    if (firstMatchIndex >= 0) {
      score += Math.max(0, 5 - firstMatchIndex / 100);
    }
    
    // Intent-specific scoring bonuses
    switch (analysis.intent) {
      case QueryIntent.FINANCIAL:
        if (/\b(rp|rupiah|\d+\.?\d*\s*(juta|miliar|ribu|rb|rb|k|m|b))\b/i.test(text)) {
          score += 5;
        }
        break;
        
      case QueryIntent.DATE_TIME:
        if (/\b(\d{1,2}[:.]\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/i.test(text)) {
          score += 5;
        }
        break;
        
      case QueryIntent.PEOPLE_RESPONSIBILITY:
        if (/\b(koordinator|manager|direktur|kepala|pic|penanggung jawab|bertanggung jawab)\b/i.test(text)) {
          score += 5;
        }
        break;
        
      case QueryIntent.METHODOLOGY:
        if (/\b(metode|metodologi|pendekatan|framework|teknik|cara|prosedur)\b/i.test(text)) {
          score += 5;
        }
        break;
    }
    
    // Chunk length penalty for very short chunks
    if (text.length < 100) {
      score *= 0.8;
    }
    
    // Bonus for chunks with good structure (has punctuation, proper sentences)
    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    if (sentenceCount > 0) {
      score += Math.min(sentenceCount * 0.5, 3);
    }
    
    return score;
  }

  private applyContextAssemblyStrategy(
    candidates: Array<{chunk: DocumentChunk, score: number, reasons: string[]}>, 
    analysis: QueryAnalysis, 
    maxChunks: number
  ): DocumentChunk[] {
    const strategy = this.queryAnalyzer.getRetrievalStrategy(analysis);
    const selectedChunks: DocumentChunk[] = [];
    const usedDocuments = new Set<string>();
    
    // For document overview queries, try to get chunks from different parts of documents
    if (analysis.isDocumentLevel || analysis.intent === QueryIntent.DOCUMENT_OVERVIEW) {
      return this.selectDocumentOverviewChunks(candidates, maxChunks);
    }
    
    // For comparison queries, ensure we get chunks from multiple documents
    if (strategy.crossDocument || analysis.requiresComparison) {
      return this.selectCrossDocumentChunks(candidates, maxChunks);
    }
    
    // For explanation/methodology queries that need adjacent context
    if (strategy.requiresAdjacent && (analysis.intent === QueryIntent.EXPLANATION || analysis.intent === QueryIntent.METHODOLOGY)) {
      return this.selectAdjacentContextChunks(candidates, maxChunks);
    }
    
    // Default selection - diverse but relevant
    for (const candidate of candidates) {
      if (selectedChunks.length >= maxChunks) break;
      
      // Avoid too many chunks from the same document unless it's a document-level query
      if (!analysis.isDocumentLevel && usedDocuments.has(candidate.chunk.documentId) && usedDocuments.size > 0) {
        // Skip if we already have 2 chunks from this document
        const existingFromDoc = selectedChunks.filter(c => c.documentId === candidate.chunk.documentId).length;
        if (existingFromDoc >= 2) {
          continue;
        }
      }
      
      selectedChunks.push(candidate.chunk);
      usedDocuments.add(candidate.chunk.documentId);
      
      logger.debug(`Selected chunk ${candidate.chunk.id} (score: ${candidate.score.toFixed(2)}, reasons: ${candidate.reasons.join(', ')})`);
    }
    
    return selectedChunks;
  }

  private selectDocumentOverviewChunks(
    candidates: Array<{chunk: DocumentChunk, score: number, reasons: string[]}>, 
    maxChunks: number
  ): DocumentChunk[] {
    const selectedChunks: DocumentChunk[] = [];
    const documentChunks = new Map<string, DocumentChunk[]>();
    
    // Group chunks by document
    for (const candidate of candidates) {
      const docId = candidate.chunk.documentId;
      if (!documentChunks.has(docId)) {
        documentChunks.set(docId, []);
      }
      documentChunks.get(docId)!.push(candidate.chunk);
    }
    
    // Select representative chunks from each document
    for (const [docId, chunks] of documentChunks) {
      if (selectedChunks.length >= maxChunks) break;
      
      // Sort chunks by index to get proper document flow
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // Take chunks from beginning, middle, and end if available
      const chunkCount = Math.min(3, maxChunks - selectedChunks.length);
      const indices = this.selectDistributedIndices(chunks.length, chunkCount);
      
      for (const index of indices) {
        selectedChunks.push(chunks[index]);
      }
    }
    
    return selectedChunks;
  }

  private selectCrossDocumentChunks(
    candidates: Array<{chunk: DocumentChunk, score: number, reasons: string[]}>, 
    maxChunks: number
  ): DocumentChunk[] {
    const selectedChunks: DocumentChunk[] = [];
    const documentGroups = new Map<string, Array<{chunk: DocumentChunk, score: number}>>();
    
    // Group by document
    for (const candidate of candidates) {
      const docId = candidate.chunk.documentId;
      if (!documentGroups.has(docId)) {
        documentGroups.set(docId, []);
      }
      documentGroups.get(docId)!.push(candidate);
    }
    
    // Ensure we get chunks from at least 2 documents if available
    const docIds = Array.from(documentGroups.keys());
    const chunksPerDoc = Math.max(1, Math.floor(maxChunks / Math.min(docIds.length, 3)));
    
    for (const docId of docIds) {
      if (selectedChunks.length >= maxChunks) break;
      
      const docCandidates = documentGroups.get(docId)!;
      const toTake = Math.min(chunksPerDoc, maxChunks - selectedChunks.length);
      
      for (let i = 0; i < toTake && i < docCandidates.length; i++) {
        selectedChunks.push(docCandidates[i].chunk);
      }
    }
    
    return selectedChunks;
  }

  private selectAdjacentContextChunks(
    candidates: Array<{chunk: DocumentChunk, score: number, reasons: string[]}>, 
    maxChunks: number
  ): DocumentChunk[] {
    const selectedChunks: DocumentChunk[] = [];
    const processed = new Set<string>();
    
    for (const candidate of candidates) {
      if (selectedChunks.length >= maxChunks) break;
      if (processed.has(candidate.chunk.id)) continue;
      
      // Get adjacent chunks for context
      const adjacentChunks = this.getAdjacentChunks(candidate.chunk, 1);
      
      // Add the main chunk first
      selectedChunks.push(candidate.chunk);
      processed.add(candidate.chunk.id);
      
      // Add adjacent chunks if we have space
      for (const adjacent of adjacentChunks) {
        if (selectedChunks.length >= maxChunks) break;
        if (!processed.has(adjacent.id)) {
          selectedChunks.push(adjacent);
          processed.add(adjacent.id);
        }
      }
    }
    
    // Sort by document and chunk index for better flow
    selectedChunks.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId.localeCompare(b.documentId);
      }
      return a.chunkIndex - b.chunkIndex;
    });
    
    return selectedChunks;
  }

  private getAdjacentChunks(chunk: DocumentChunk, radius: number = 1): DocumentChunk[] {
    const allChunks = this.db.getChunks(chunk.documentId);
    const adjacent: DocumentChunk[] = [];
    
    for (let i = -radius; i <= radius; i++) {
      if (i === 0) continue; // Skip the original chunk
      
      const targetIndex = chunk.chunkIndex + i;
      const targetChunk = allChunks.find(c => c.chunkIndex === targetIndex);
      
      if (targetChunk) {
        adjacent.push(targetChunk);
      }
    }
    
    return adjacent.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  private selectDistributedIndices(length: number, count: number): number[] {
    if (count >= length) {
      return Array.from({ length }, (_, i) => i);
    }
    
    if (count === 1) {
      return [0]; // Take first chunk
    }
    
    if (count === 2) {
      return [0, Math.floor(length / 2)]; // Beginning and middle
    }
    
    if (count === 3) {
      return [0, Math.floor(length / 2), length - 1]; // Beginning, middle, end
    }
    
    // For more than 3, distribute evenly
    const indices: number[] = [];
    const step = length / count;
    
    for (let i = 0; i < count; i++) {
      indices.push(Math.floor(i * step));
    }
    
    return indices;
  }

  private processChunksToResults(chunks: DocumentChunk[], query: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const chunk of chunks) {
      const document = this.db.getDocument(chunk.documentId);
      if (!document) continue;

      // Apply filters if specified
      // TODO: Implement filtering based on extensions, folders, date range

      const snippet = extractSnippet(chunk.text, query, 300);
      
      const result: SearchResult = {
        documentId: chunk.documentId,
        chunkId: chunk.id,
        score: this.calculateKeywordScore(chunk.text, query),
        snippet,
        metadata: chunk.metadata,
        document
      };

      results.push(result);
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  private calculateKeywordScore(text: string, query: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Simple scoring based on term frequency and position
    let score = 0;
    
    // Exact phrase match gets highest score
    if (textLower.includes(queryLower)) {
      score += 10;
    }
    
    // Individual word matches
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
    const textWords = textLower.split(/\s+/);
    
    for (const queryWord of queryWords) {
      const wordCount = textWords.filter(word => word.includes(queryWord)).length;
      score += wordCount * 2;
    }
    
    // Bonus for matches near the beginning
    const firstMatchIndex = textLower.indexOf(queryLower);
    if (firstMatchIndex >= 0) {
      score += Math.max(0, 5 - firstMatchIndex / 100);
    }
    
    return score;
  }

  async findSimilarDocuments(documentId: string, limit: number = 5): Promise<SearchResult[]> {
    const document = this.db.getDocument(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const chunks = this.db.getChunks(documentId);
    if (chunks.length === 0) {
      return [];
    }

    // Use first chunk as query for finding similar documents
    const queryText = chunks[0].text.slice(0, 200); // Use first 200 chars as query
    
    const searchQuery: SearchQuery = {
      query: queryText,
      mode: SearchMode.KEYWORD,
      limit: limit + 10 // Get more to filter out same document
    };

    const results = await this.search(searchQuery);
    
    // Filter out chunks from the same document
    return results
      .filter(result => result.documentId !== documentId)
      .slice(0, limit);
  }

  async getDocumentContext(documentId: string, chunkId?: string): Promise<{
    document: Document;
    chunks: DocumentChunk[];
    selectedChunk?: DocumentChunk;
  }> {
    const document = this.db.getDocument(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const chunks = this.db.getChunks(documentId);
    const selectedChunk = chunkId 
      ? chunks.find(c => c.id === chunkId)
      : undefined;

    return {
      document,
      chunks,
      selectedChunk
    };
  }

  async getRecentSearches(limit: number = 10): Promise<string[]> {
    // For MVP, return empty array
    // TODO: Implement search history tracking
    return [];
  }

  async getPopularDocuments(limit: number = 10): Promise<Document[]> {
    // For MVP, return most recently indexed documents
    return this.db.getDocuments().slice(0, limit);
  }

  getSearchStats() {
    const stats = this.db.getStats();
    
    return {
      totalDocuments: stats.documents,
      indexedDocuments: stats.indexed,
      totalChunks: stats.chunks,
      searchableContent: stats.chunks > 0
    };
  }

  // Helper method for RAG context retrieval - ENHANCED VERSION
  async getRelevantContext(query: string, maxChunks: number = 5): Promise<DocumentChunk[]> {
    logger.info(`Getting relevant context for RAG: "${query}" (maxChunks: ${maxChunks})`);

    try {
      // Use enhanced context search
      const searchResult = await this.searchForContext(query, maxChunks);
      
      logger.info(`Enhanced context retrieval completed:`, {
        query,
        chunksFound: searchResult.chunks.length,
        intent: searchResult.analysis.intent,
        expandedTerms: searchResult.analysis.expandedTerms.length
      });

      return searchResult.chunks;
      
    } catch (error) {
      logger.error('Error in enhanced context retrieval, falling back to simple search:', error);
      
      // Fallback to simple keyword search
      const searchQuery: SearchQuery = {
        query,
        mode: SearchMode.KEYWORD,
        limit: maxChunks
      };

      const results = await this.search(searchQuery);
      
      return results.map(result => {
        const chunk = this.db.getChunks(result.documentId)
          .find(c => c.id === result.chunkId);
        return chunk!;
      }).filter(Boolean);
    }
  }
}