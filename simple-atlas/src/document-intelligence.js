/**
 * Enhanced Document Intelligence RAG Pipeline for ATLAS
 * 
 * Transforms ATLAS from "search + LLM" to true document understanding system
 */

import {
  QueryIntent,
  SessionContextManager,
  detectQueryIntent,
  expandQueryConcepts,
  identifyTargetDocumentReferences,
  isFollowUpQuestion,
  calculateDocumentAwareRelevance,
  buildDocumentContext,
  buildGroundedPrompts,
  extractCoreQueryTerms
} from './rag-pipeline.js';

// Enhanced query understanding for Document Intelligence
export function enhancedQueryAnalysis(question, conversationContext = null) {
  const analysis = {
    originalQuery: question,
    normalizedQuery: normalizeQuery(question),
    intent: detectQueryIntent(question),
    queryType: classifyQueryType(question),
    complexity: assessQueryComplexity(question),
    requiresMultiDocument: detectMultiDocumentNeed(question),
    requiresCalculation: detectCalculationNeed(question),
    temporalAspect: detectTemporalAspect(question),
    entityReferences: extractEntityReferences(question),
    conceptualDepth: assessConceptualDepth(question),
    lastDocIds: conversationContext?.lastDocIds || [],
    lastDocNames: conversationContext?.lastDocNames || []
  };

  // Enhance with conversation context if available
  if (conversationContext) {
    analysis.contextualQuery = enrichWithContext(question, conversationContext);
    analysis.followUpType = classifyFollowUpType(question, conversationContext);
  }

  return analysis;
}

function normalizeQuery(query) {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyQueryType(query) {
  const lower = query.toLowerCase();
  
  // Document overview patterns
  if (/\b(apa isi|inti|ringkas|rangkum|overview|gambaran|tentang apa)\b/.test(lower)) {
    return 'OVERVIEW';
  }
  
  // Comparative patterns
  if (/\b(bandingkan|perbedaan|versus|dibanding|kontras|selisih|antara)\b/.test(lower)) {
    return 'COMPARATIVE';
  }
  
  // Procedural patterns
  if (/\b(bagaimana|cara|langkah|prosedur|proses)\b/.test(lower)) {
    return 'PROCEDURAL';
  }
  
  // Causal patterns
  if (/\b(mengapa|kenapa|alasan|sebab|karena)\b/.test(lower)) {
    return 'CAUSAL';
  }
  
  // Numerical/quantitative patterns - Enhanced for time queries
  if (/\b(berapa|jumlah|total|hitung|kalkulasi|jam berapa|kapan|pukul berapa)\b/.test(lower)) {
    return 'QUANTITATIVE';
  }
  
  // Definitional patterns
  if (/\b(apa itu|definisi|pengertian|artinya)\b/.test(lower)) {
    return 'DEFINITIONAL';
  }
  
  return 'FACTUAL';
}

export function assessQueryComplexity(query) {
  let complexity = 0;
  
  // Length factor
  const words = query.split(/\s+/).length;
  if (words > 10) complexity += 2;
  else if (words > 5) complexity += 1;
  
  // Multiple concepts
  const concepts = ['dan', 'atau', 'serta', 'juga', 'kemudian'].filter(c => query.includes(c));
  complexity += concepts.length;
  
  // Conditional language
  if (/\b(jika|bila|seandainya|kalau)\b/.test(query)) complexity += 2;
  
  // Comparative language
  if (/\b(dibanding|versus|kontras)\b/.test(query)) complexity += 1;
  
  return Math.min(complexity, 5); // Cap at 5
}

export function detectMultiDocumentNeed(query) {
  const patterns = [
    /bandingkan.*dengan/i,
    /perbedaan.*dan/i,
    /hubungan.*dengan/i,
    /kaitannya.*dengan/i,
    /dibandingkan.*dengan/i,
    /selisih.*dengan/i
  ];
  
  return patterns.some(p => p.test(query));
}

function detectCalculationNeed(query) {
  const patterns = [
    /berapa total/i,
    /hitung/i,
    /jumlahkan/i,
    /selisih/i,
    /persentase/i,
    /rata-rata/i,
    /lebih besar/i,
    /lebih kecil/i
  ];
  
  return patterns.some(p => p.test(query));
}

function detectTemporalAspect(query) {
  const patterns = [
    /kapan/i,
    /waktu/i,
    /tanggal/i,
    /tahun/i,
    /bulan/i,
    /hari/i,
    /sebelum/i,
    /sesudah/i,
    /selama/i
  ];
  
  return patterns.some(p => p.test(query));
}

function extractEntityReferences(query) {
  const entities = {
    persons: [],
    organizations: [],
    locations: [],
    documents: [],
    concepts: []
  };
  
  // Document type references
  const docTypes = query.match(/\b(skripsi|laporan|panduan|visi|misi|proposal|dokumen)\b/gi);
  if (docTypes) entities.documents = [...new Set(docTypes.map(d => d.toLowerCase()))];
  
  // Concept references
  const concepts = query.match(/\b(metodologi|metode|hasil|kesimpulan|tujuan|analisis|penelitian)\b/gi);
  if (concepts) entities.concepts = [...new Set(concepts.map(c => c.toLowerCase()))];
  
  return entities;
}

function assessConceptualDepth(query) {
  const depth = {
    level: 1,
    indicators: []
  };
  
  // Surface level (keywords, simple facts)
  if (/\b(apa|siapa|kapan|dimana)\b/.test(query.toLowerCase())) {
    depth.level = 1;
    depth.indicators.push('factual');
  }
  
  // Analytical level (relationships, comparisons)
  if (/\b(mengapa|bagaimana|hubungan|pengaruh|dampak)\b/.test(query.toLowerCase())) {
    depth.level = 2;
    depth.indicators.push('analytical');
  }
  
  // Synthesis level (integration, evaluation)
  if (/\b(evaluasi|sintesis|kesimpulan|implikasi|rekomendasi)\b/.test(query.toLowerCase())) {
    depth.level = 3;
    depth.indicators.push('synthesis');
  }
  
  return depth;
}

function enrichWithContext(query, context) {
  let enriched = query;
  
  // Add document context if missing
  if (context.lastDocNames && context.lastDocNames.length > 0 && !hasDocumentReference(query)) {
    enriched += ` (dalam konteks ${context.lastDocNames[0]})`;
  }
  
  // Add topic context for follow-up questions
  if (context.lastTopic && isFollowUpQuestion(query)) {
    enriched = enriched.replace(/\b(itu|tersebut|hal itu)\b/g, context.lastTopic);
  }
  
  return enriched;
}

function classifyFollowUpType(query, context) {
  if (!isFollowUpQuestion(query)) return 'INDEPENDENT';
  
  const lower = query.toLowerCase();
  
  if (/\b(kenapa|mengapa)\b/.test(lower)) return 'CAUSAL_FOLLOWUP';
  if (/\b(bagaimana)\b/.test(lower)) return 'PROCEDURAL_FOLLOWUP';
  if (/\b(apa artinya|maksudnya)\b/.test(lower)) return 'CLARIFICATION';
  if (/\b(contoh|misalnya)\b/.test(lower)) return 'EXAMPLE_REQUEST';
  
  return 'ELABORATION';
}

function hasDocumentReference(query) {
  const docRefs = ['skripsi', 'laporan', 'dokumen', 'panduan', 'visi', 'misi', 'proposal'];
  return docRefs.some(ref => query.toLowerCase().includes(ref));
}

// Enhanced two-stage retrieval for Document Intelligence
export async function enhancedTwoStageRetrieval(db, queryAnalysis, sessionContext = null) {
  const { originalQuery, intent, queryType, complexity, requiresMultiDocument } = queryAnalysis;
  
  // STAGE 1: Candidate Retrieval (cast wide net)
  const candidates = await retrieveCandidates(db, queryAnalysis);
  
  // STAGE 2: Intelligent Reranking and Selection
  const selected = await rerankAndSelect(candidates, queryAnalysis, sessionContext);
  
  return {
    candidates: candidates.length,
    selected: selected.length,
    chunks: selected,
    retrievalStrategy: determineRetrievalStrategy(queryAnalysis),
    confidence: calculateRetrievalConfidence(selected, queryAnalysis)
  };
}

async function retrieveCandidates(db, queryAnalysis) {
  const originalQuery = queryAnalysis.originalQuery || queryAnalysis.rawQuestion || '';
  const { intent, entityReferences, requiresMultiDocument } = queryAnalysis;
  const candidates = new Map();
   
  // 1. Identify target documents from query references or conversation context
  const allDocs = await db.all('SELECT id, name, path FROM documents');
  const searchSource = queryAnalysis.contextualQuery ? `${originalQuery} ${queryAnalysis.contextualQuery}` : originalQuery;
  let targetDocIds = [...(queryAnalysis.targetDocIds || [])];
  if (targetDocIds.length === 0) {
    targetDocIds = identifyTargetDocumentReferences(searchSource, allDocs);
  }
  queryAnalysis.targetDocIds = targetDocIds;
  
  // Strategy 1: Target document chunks direct retrieval
  if (targetDocIds.length > 0) {
    for (const docId of targetDocIds) {
      const docChunks = await db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.document_id = ?
        ORDER BY c.chunk_index ASC
      `, [docId]);
      
      docChunks.forEach(c => candidates.set(c.id, c));
    }
  }

  // Strategy 1b: Metadata-aware retrieval
  if (entityReferences?.documents?.length > 0) {
    const docCandidates = await db.all(`
      SELECT c.*, d.name as document_name, d.path as document_path, m.doc_type, m.title
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      LEFT JOIN document_metadata m ON d.id = m.document_id
      WHERE LOWER(d.name) LIKE ? OR LOWER(m.title) LIKE ? OR LOWER(m.doc_type) LIKE ?
      ORDER BY c.chunk_index ASC
      LIMIT 20
    `, [
      `%${entityReferences.documents[0]}%`,
      `%${entityReferences.documents[0]}%`,
      `%${entityReferences.documents[0]}%`
    ]);
    
    docCandidates.forEach(c => candidates.set(c.id, c));
  }
  
  // Strategy 2: Enhanced FTS with contextual text and concept expansion
  const coreTerms = queryAnalysis.coreTerms || extractCoreQueryTerms(originalQuery);
  const expandedConcepts = queryAnalysis.expandedConcepts || expandQueryConcepts(originalQuery, coreTerms, intent);

  // Strategy 1c: Document name matching via core substantive terms + expanded concepts
  const GENERIC_DOC_TERMS = /^(laporan|dokumen|makalah|tugas|tubes|artikel|skripsi|buku|file)$/i;
  const coreSubstantive = coreTerms.filter(t => t.raw.length > 3 && !/^(apa|bagaimana|kenapa|mengapa|dimana|kapan|siapa|berapa|informasi|ingin|semua|tersebut|tentang|adalah|karena|dokumennya|lupa|nama)$/i.test(t.raw));
  const specificForName = coreSubstantive.filter(t => !GENERIC_DOC_TERMS.test(t.raw));
  if (specificForName.length > 0 && specificForName.length <= 5) {
    const nameSearchTerms = expandedConcepts.filter(c => !/^\d+$/.test(c) && !GENERIC_DOC_TERMS.test(c)).map(c => c.toLowerCase());
    for (const t of specificForName) nameSearchTerms.push(t.raw.toLowerCase());
    const allSubDocs = await db.all('SELECT id, name FROM documents');
    const matchedDocIds = [];
    const existingDocIds = new Set([...candidates.values()].map(c => c.document_id));
    for (const doc of allSubDocs) {
      if (existingDocIds.has(doc.id)) continue;
      const docNameLower = doc.name.toLowerCase();
      if (nameSearchTerms.some(term => term.length > 3 && new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(docNameLower))) {
        matchedDocIds.push(doc.id);
        if (matchedDocIds.length >= 5) break;
      }
    }
    if (matchedDocIds.length > 0) {
      const placeholders = matchedDocIds.map(() => '?').join(',');
      const nameCandidates = await db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path
        FROM chunks c JOIN documents d ON c.document_id = d.id
        WHERE c.document_id IN (${placeholders}) ORDER BY c.chunk_index ASC
      `, matchedDocIds);
      nameCandidates.forEach(c => candidates.set(c.id, c));
    }
  }
  
  const ftsTerms = [...coreTerms.map(t => t.raw), ...expandedConcepts.slice(0, 10)];
  const ftsQuery = ftsTerms.map(t => `"${t.replace(/[^a-zA-Z0-9]/g, '')}"*`).filter(t => t !== '""*').join(' OR ');
  
  if (ftsQuery) {
    try {
      const ftsCandidates = await db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path, 
               bm25(chunks_fts) as bm25_score
        FROM chunks c
        JOIN chunks_fts fts ON c.id = fts.chunk_id
        JOIN documents d ON c.document_id = d.id
        WHERE chunks_fts MATCH ?
        ORDER BY bm25(chunks_fts)
        LIMIT 30
      `, [ftsQuery]);
      
      ftsCandidates.forEach(c => candidates.set(c.id, c));
    } catch (_) {}
  }
  
  // Strategy 3: Chunk type specific retrieval
  if (intent === QueryIntent.METHODOLOGY) {
    try {
      const methodCandidates = await db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.chunk_type = 'methodology' OR LOWER(c.section) LIKE '%metodologi%' OR LOWER(c.section) LIKE '%metode%'
        LIMIT 15
      `);
      
      methodCandidates.forEach(c => candidates.set(c.id, c));
    } catch (_) {}
  }
  
  return Array.from(candidates.values());
}

async function rerankAndSelect(candidates, queryAnalysis, sessionContext) {
  const originalQuery = queryAnalysis.originalQuery || queryAnalysis.rawQuestion || '';
  const { intent, queryType, complexity, requiresCalculation } = queryAnalysis;
  
  // Enhanced scoring with document intelligence factors
  const scoredCandidates = candidates.map(chunk => {
    const score = calculateEnhancedRelevanceScore(chunk, queryAnalysis);
    return { ...chunk, intelligenceScore: score };
  });
  
  // Sort by intelligence score
  scoredCandidates.sort((a, b) => b.intelligenceScore - a.intelligenceScore);
  
  // Intelligent selection based on query characteristics
  let selectedCount = 5; // Default
  
  if (queryAnalysis.requiresMultiDocument) selectedCount = 8;
  if (queryAnalysis.complexity > 3) selectedCount = 7;
  if (queryAnalysis.queryType === 'OVERVIEW') selectedCount = 6;
  if (queryAnalysis.queryType === 'COMPARATIVE') selectedCount = 10;
  
  // For comparison queries, guarantee at least one chunk per target
  const comparisonTargets = queryAnalysis.comparisonTargets;
  if (comparisonTargets?.isComparison && comparisonTargets.targetA && comparisonTargets.targetB) {
    const targetChunks = ensureComparisonTargetCoverage(scoredCandidates, comparisonTargets);
    const targetIds = new Set(targetChunks.map(c => c.id));
    const remaining = scoredCandidates.filter(c => !targetIds.has(c.id));
    const selected = [...targetChunks, ...remaining.slice(0, Math.max(0, selectedCount - targetChunks.length))];
    if (queryAnalysis.requiresMultiDocument) {
      return ensureDocumentDiversity(selected);
    }
    return selected;
  }
  
  const selected = scoredCandidates.slice(0, selectedCount);
  
  // Ensure document diversity for multi-document queries
  if (queryAnalysis.requiresMultiDocument) {
    return ensureDocumentDiversity(selected);
  }
  
  return selected;
}

function ensureComparisonTargetCoverage(scoredCandidates, comparisonTargets) {
  const targetA = comparisonTargets.targetA.toLowerCase();
  const targetB = comparisonTargets.targetB.toLowerCase();
  const wordsA = targetA.split(/\s+/).filter(w => w.length > 2);
  const wordsB = targetB.split(/\s+/).filter(w => w.length > 2);
  
  function matchesAllWords(chunk, words) {
    const text = (chunk.text + ' ' + (chunk.document_name || '')).toLowerCase();
    const matched = words.filter(w => {
      if (text.includes(w)) return true;
      if (w === 'software' && text.includes('perangkat')) return true;
      if (w === 'perangkat' && text.includes('software')) return true;
      if (w === 'tahunan' && (text.includes('bulanan') || text.includes('per bulan'))) return true;
      return false;
    });
    return matched.length === words.length ? matched.length : 0;
  }
  
  let bestA = null;
  let bestAScore = -1;
  let bestB = null;
  let bestBScore = -1;
  
  for (const chunk of scoredCandidates) {
    const matchA = matchesAllWords(chunk, wordsA);
    if (matchA > 0 && (matchA > bestAScore || (matchA === bestAScore && (chunk.intelligenceScore || 0) > (bestA?.intelligenceScore || 0)))) {
      bestA = chunk; bestAScore = matchA;
    }
    const matchB = matchesAllWords(chunk, wordsB);
    if (matchB > 0 && (matchB > bestBScore || (matchB === bestBScore && (chunk.intelligenceScore || 0) > (bestB?.intelligenceScore || 0)))) {
      bestB = chunk; bestBScore = matchB;
    }
  }
  
  const result = [];
  if (bestA) result.push(bestA);
  if (bestB && bestB.id !== bestA?.id) result.push(bestB);
  return result;
}

function calculateEnhancedRelevanceScore(chunk, queryAnalysis) {
  let score = 0;
  const originalQuery = queryAnalysis.originalQuery || queryAnalysis.rawQuestion || '';
  const { intent, entityReferences, queryType } = queryAnalysis;
  
  // Base relevance using existing logic
  const baseRelevance = calculateDocumentAwareRelevance(chunk, {
    coreTerms: queryAnalysis.coreTerms || extractCoreQueryTerms(originalQuery),
    intent,
    expandedConcepts: queryAnalysis.expandedConcepts || expandQueryConcepts(originalQuery, extractCoreQueryTerms(originalQuery), intent),
    targetDocIds: queryAnalysis.targetDocIds || [],
    fullQuestion: originalQuery
  });
  
  score += baseRelevance.score;
  
  // Document Intelligence bonuses
  
  // Chunk type alignment
  if (intent === QueryIntent.METHODOLOGY && chunk.chunk_type === 'methodology') score += 25;
  if (intent === QueryIntent.SUMMARY && chunk.chunk_type === 'abstract') score += 30;
  if (queryType === 'OVERVIEW' && chunk.chunk_index === 0) score += 20;
  
  // Section relevance
  const sectionBonus = calculateSectionRelevance(chunk.section, intent, queryType);
  score += sectionBonus;
  
  // Entity alignment
  if (chunk.entities_json) {
    try {
      const entities = JSON.parse(chunk.entities_json);
      const entityBonus = calculateEntityAlignment(entities, entityReferences);
      score += entityBonus;
    } catch (_) {}
  }
  
  // Contextual text quality
  if (chunk.contextual_text && chunk.contextual_text.length > chunk.text.length) {
    score += 10; // Bonus for enhanced contextual information
  }
  
  return score;
}

function calculateSectionRelevance(section, intent, queryType) {
  if (!section) return 0;
  
  const sectionLower = section.toLowerCase();
  
  // Intent-based section bonuses
  if (intent === QueryIntent.METHODOLOGY && /metodologi|metode|approach/.test(sectionLower)) return 20;
  if (intent === QueryIntent.SUMMARY && /abstrak|ringkasan|kesimpulan/.test(sectionLower)) return 25;
  if (queryType === 'CAUSAL' && /pembahasan|diskusi|analisis/.test(sectionLower)) return 15;
  if (queryType === 'QUANTITATIVE' && /hasil|data|angka/.test(sectionLower)) return 20;
  
  return 0;
}

function calculateEntityAlignment(chunkEntities, queryEntities) {
  let alignment = 0;
  
  // Concept alignment
  if (chunkEntities.concepts && queryEntities.concepts) {
    const commonConcepts = chunkEntities.concepts.filter(c => 
      queryEntities.concepts.includes(c)
    );
    alignment += commonConcepts.length * 5;
  }
  
  // Number alignment for quantitative queries
  if (chunkEntities.numbers && chunkEntities.numbers.length > 0) {
    alignment += 8; // Bonus for chunks with numerical data
  }
  
  return alignment;
}

function ensureDocumentDiversity(chunks) {
  const diversified = [];
  const seenDocs = new Set();
  
  // First pass: one chunk per document
  for (const chunk of chunks) {
    if (!seenDocs.has(chunk.document_id)) {
      diversified.push(chunk);
      seenDocs.add(chunk.document_id);
    }
  }
  
  // Second pass: fill remaining slots with best remaining chunks
  const remaining = chunks.filter(c => !diversified.includes(c));
  diversified.push(...remaining.slice(0, Math.max(0, 10 - diversified.length)));
  
  return diversified;
}

function determineRetrievalStrategy(queryAnalysis) {
  const { intent, queryType, requiresMultiDocument, complexity } = queryAnalysis;
  
  if (requiresMultiDocument) return 'MULTI_DOCUMENT';
  if (queryType === 'OVERVIEW') return 'DOCUMENT_OVERVIEW';
  if (queryType === 'COMPARATIVE') return 'COMPARATIVE_ANALYSIS';
  if (complexity > 3) return 'COMPLEX_REASONING';
  
  return 'STANDARD_RETRIEVAL';
}

function calculateRetrievalConfidence(selectedChunks, queryAnalysis) {
  if (selectedChunks.length === 0) return 0;
  
  const qStr = queryAnalysis.originalQuery || queryAnalysis.rawQuestion || '';
  const lower = qStr.toLowerCase();
  // Detect vague ambiguous queries without document context or specific entities
  const isVagueAmbiguous = /\b(hal tersebut|hal itu|tentang hal|semua itu|data tentang hal|informasi itu)\b/.test(lower) && 
                          (!queryAnalysis.targetDocIds || queryAnalysis.targetDocIds.length === 0);
  if (isVagueAmbiguous) {
    return 0.25; // Return low confidence to trigger clarification request
  }
  
  const avgScore = selectedChunks.reduce((sum, c) => sum + (c.intelligenceScore || 0), 0) / selectedChunks.length;
  const docCoverage = new Set(selectedChunks.map(c => c.document_id)).size;
  
  let confidence = Math.min(avgScore / 100, 1); // Normalize to 0-1
  
  // Boost confidence for good document coverage in multi-doc queries
  if (queryAnalysis.requiresMultiDocument && docCoverage >= 2) {
    confidence += 0.2;
  }
  
  return Math.min(confidence, 1);
}

// Export utility functions - using existing implementation from main file
// Remove duplicate to avoid conflict