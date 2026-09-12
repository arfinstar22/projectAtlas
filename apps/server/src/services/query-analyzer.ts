import { createLogger } from '@atlas/core';

const logger = createLogger('QUERY_ANALYZER');

export enum QueryIntent {
  FACTUAL = 'factual',
  DEFINITION = 'definition', 
  SUMMARY = 'summary',
  EXPLANATION = 'explanation',
  COMPARISON = 'comparison',
  PROCEDURE = 'procedure',
  LIST_EXTRACTION = 'list_extraction',
  PEOPLE_RESPONSIBILITY = 'people_responsibility',
  DATE_TIME = 'date_time',
  FINANCIAL = 'financial',
  METHODOLOGY = 'methodology',
  CONCLUSION = 'conclusion',
  DOCUMENT_OVERVIEW = 'document_overview',
  CROSS_DOCUMENT = 'cross_document'
}

export interface QueryAnalysis {
  originalQuery: string;
  intent: QueryIntent;
  expandedTerms: string[];
  keyEntities: string[];
  needsMultipleChunks: boolean;
  isDocumentLevel: boolean;
  requiresComparison: boolean;
}

export class QueryAnalyzer {
  private indonesianSynonyms: Map<string, string[]> = new Map([
    // Karyawan/pegawai
    ['karyawan', ['pegawai', 'pekerja', 'staff', 'tenaga kerja']],
    ['pegawai', ['karyawan', 'pekerja', 'staff', 'tenaga kerja']],
    
    // Waktu/jam
    ['waktu', ['jam', 'pukul', 'saat', 'masa']],
    ['jam', ['waktu', 'pukul', 'saat']],
    ['mulai', ['dimulai', 'bermula', 'berawal']],
    
    // Dana/biaya
    ['dana', ['biaya', 'anggaran', 'uang', 'cost']],
    ['biaya', ['dana', 'anggaran', 'uang', 'cost']],
    ['anggaran', ['dana', 'biaya', 'budget']],
    
    // Software/perangkat lunak
    ['software', ['perangkat lunak', 'aplikasi', 'program']],
    ['perangkat lunak', ['software', 'aplikasi', 'program']],
    
    // Metodologi/metode
    ['metodologi', ['metode', 'cara', 'pendekatan', 'teknik']],
    ['metode', ['metodologi', 'cara', 'pendekatan', 'teknik']],
    
    // Tujuan/visi
    ['tujuan', ['visi', 'misi', 'target', 'sasaran', 'goal']],
    ['visi', ['tujuan', 'misi', 'target', 'sasaran']],
    
    // Hasil/kesimpulan
    ['hasil', ['kesimpulan', 'output', 'temuan']],
    ['kesimpulan', ['hasil', 'output', 'temuan', 'conclusion']]
  ]);

  private intentPatterns: Map<QueryIntent, RegExp[]> = new Map([
    [QueryIntent.FACTUAL, [
      /^(berapa|kapan|siapa|dimana|apa)\b/i,
      /\b(berapa|kapan|siapa|dimana)\b.*\?/i
    ]],
    
    [QueryIntent.DEFINITION, [
      /^(apa itu|definisi|pengertian)\b/i,
      /\b(apa yang dimaksud|apakah)\b/i
    ]],
    
    [QueryIntent.SUMMARY, [
      /^(ringkas|rangkum|inti|pokok)\b/i,
      /\b(secara umum|garis besar|ringkasan)\b/i
    ]],
    
    [QueryIntent.EXPLANATION, [
      /^(jelaskan|bagaimana|mengapa|kenapa)\b/i,
      /\b(dengan bahasa sederhana|secara detail)\b/i
    ]],
    
    [QueryIntent.COMPARISON, [
      /\b(bandingkan|perbandingan|beda|perbedaan)\b/i,
      /\b(dibandingkan|vs|versus)\b/i
    ]],
    
    [QueryIntent.PROCEDURE, [
      /\b(cara|langkah|prosedur|proses)\b/i,
      /\b(tahapan|step by step)\b/i
    ]],
    
    [QueryIntent.PEOPLE_RESPONSIBILITY, [
      /\b(siapa yang|bertanggung jawab|penanggung jawab)\b/i,
      /\b(pic|person in charge|koordinator)\b/i
    ]],
    
    [QueryIntent.DATE_TIME, [
      /\b(kapan|tanggal|waktu|jam|pukul)\b/i,
      /\b(jadwal|schedule|timeline)\b/i
    ]],
    
    [QueryIntent.FINANCIAL, [
      /\b(berapa.*biaya|berapa.*dana|anggaran|budget)\b/i,
      /\b(harga|cost|investasi|pengeluaran)\b/i
    ]],
    
    [QueryIntent.METHODOLOGY, [
      /\b(metodologi|metode.*penelitian|cara.*penelitian)\b/i,
      /\b(approach|pendekatan|framework)\b/i
    ]],
    
    [QueryIntent.CONCLUSION, [
      /\b(kesimpulan|conclusion|hasil.*penelitian)\b/i,
      /\b(temuan|findings|output)\b/i
    ]],
    
    [QueryIntent.DOCUMENT_OVERVIEW, [
      /^(apa.*isi|apa.*tentang|tentang apa)\b/i,
      /\b(dokumen ini|inti dokumen|overview)\b/i
    ]],
    
    [QueryIntent.CROSS_DOCUMENT, [
      /\b(dokumen.*dokumen|file.*file|bandingkan.*dengan)\b/i
    ]]
  ]);

  analyzeQuery(query: string): QueryAnalysis {
    const normalizedQuery = query.toLowerCase().trim();
    
    logger.info(`Analyzing query: "${query}"`);

    // Detect intent
    const intent = this.detectIntent(normalizedQuery);
    
    // Extract key entities
    const keyEntities = this.extractKeyEntities(normalizedQuery);
    
    // Generate expanded terms
    const expandedTerms = this.expandQuery(normalizedQuery);
    
    // Determine if needs multiple chunks
    const needsMultipleChunks = this.needsMultipleChunks(intent, normalizedQuery);
    
    // Check if document-level query
    const isDocumentLevel = this.isDocumentLevelQuery(normalizedQuery);
    
    // Check if requires comparison
    const requiresComparison = intent === QueryIntent.COMPARISON || 
                              normalizedQuery.includes('bandingkan') ||
                              normalizedQuery.includes('perbedaan');

    const analysis: QueryAnalysis = {
      originalQuery: query,
      intent,
      expandedTerms,
      keyEntities,
      needsMultipleChunks,
      isDocumentLevel,
      requiresComparison
    };

    logger.info(`Query analysis result:`, {
      intent,
      expandedTermsCount: expandedTerms.length,
      keyEntitiesCount: keyEntities.length,
      needsMultipleChunks,
      isDocumentLevel,
      requiresComparison
    });

    return analysis;
  }

  private detectIntent(query: string): QueryIntent {
    for (const [intent, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return intent;
        }
      }
    }
    
    // Default fallback based on question words
    if (query.includes('apa') && (query.includes('inti') || query.includes('tentang'))) {
      return QueryIntent.DOCUMENT_OVERVIEW;
    }
    
    if (query.includes('jelaskan') || query.includes('bagaimana')) {
      return QueryIntent.EXPLANATION;
    }
    
    if (query.includes('berapa') || query.includes('jumlah')) {
      return QueryIntent.FACTUAL;
    }
    
    return QueryIntent.FACTUAL; // Default
  }

  private extractKeyEntities(query: string): string[] {
    const entities: string[] = [];
    const words = query.split(/\s+/);
    
    // Extract important nouns and concepts
    const importantWords = words.filter(word => {
      return word.length > 3 && 
             !this.isStopWord(word) && 
             !this.isQuestionWord(word);
    });
    
    entities.push(...importantWords);
    
    // Extract compound entities
    const compoundEntities = [
      'perangkat lunak', 'metode penelitian', 'anggaran dana',
      'jam kerja', 'waktu operasional', 'biaya pengembangan',
      'metodologi penelitian', 'hasil penelitian', 'kesimpulan penelitian'
    ];
    
    for (const entity of compoundEntities) {
      if (query.includes(entity)) {
        entities.push(entity);
      }
    }
    
    return [...new Set(entities)]; // Remove duplicates
  }

  private expandQuery(query: string): string[] {
    const expandedTerms: string[] = [query];
    const words = query.split(/\s+/);
    
    for (const word of words) {
      const synonyms = this.indonesianSynonyms.get(word);
      if (synonyms) {
        expandedTerms.push(...synonyms);
        
        // Create synonym phrases
        for (const synonym of synonyms) {
          const expandedQuery = query.replace(word, synonym);
          if (expandedQuery !== query) {
            expandedTerms.push(expandedQuery);
          }
        }
      }
    }
    
    // Add conceptual expansions based on intent
    if (query.includes('mulai') || query.includes('bekerja')) {
      expandedTerms.push('jam operasional', 'waktu kerja', 'jam masuk');
    }
    
    if (query.includes('dana') || query.includes('biaya')) {
      expandedTerms.push('budget', 'investasi', 'pengeluaran', 'cost');
    }
    
    if (query.includes('metodologi') || query.includes('metode')) {
      expandedTerms.push('pendekatan', 'framework', 'teknik', 'cara');
    }
    
    return [...new Set(expandedTerms)]; // Remove duplicates
  }

  private needsMultipleChunks(intent: QueryIntent, query: string): boolean {
    const multiChunkIntents = [
      QueryIntent.SUMMARY,
      QueryIntent.EXPLANATION, 
      QueryIntent.METHODOLOGY,
      QueryIntent.DOCUMENT_OVERVIEW,
      QueryIntent.COMPARISON,
      QueryIntent.CROSS_DOCUMENT
    ];
    
    if (multiChunkIntents.includes(intent)) {
      return true;
    }
    
    // Check for keywords that typically need multiple chunks
    const multiChunkKeywords = [
      'jelaskan', 'bagaimana', 'mengapa', 'secara detail',
      'langkah', 'prosedur', 'proses', 'metodologi'
    ];
    
    return multiChunkKeywords.some(keyword => query.includes(keyword));
  }

  private isDocumentLevelQuery(query: string): boolean {
    const documentLevelIndicators = [
      'inti dokumen', 'tentang apa', 'isi dokumen',
      'ringkas', 'rangkum', 'overview', 'garis besar'
    ];
    
    return documentLevelIndicators.some(indicator => query.includes(indicator));
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      'yang', 'dan', 'atau', 'dari', 'ke', 'di', 'pada', 'untuk',
      'dengan', 'oleh', 'dalam', 'adalah', 'ini', 'itu', 'akan',
      'sudah', 'telah', 'bisa', 'dapat', 'harus', 'tidak'
    ];
    return stopWords.includes(word);
  }

  private isQuestionWord(word: string): boolean {
    const questionWords = [
      'apa', 'siapa', 'kapan', 'dimana', 'bagaimana', 'mengapa',
      'berapa', 'kenapa', 'apakah'
    ];
    return questionWords.includes(word);
  }

  // Get retrieval strategy based on analysis
  getRetrievalStrategy(analysis: QueryAnalysis): {
    maxChunks: number;
    requiresAdjacent: boolean;
    crossDocument: boolean;
    prioritizeRecent: boolean;
  } {
    let maxChunks = 5; // default
    let requiresAdjacent = false;
    let crossDocument = false;
    let prioritizeRecent = false;

    switch (analysis.intent) {
      case QueryIntent.DOCUMENT_OVERVIEW:
      case QueryIntent.SUMMARY:
        maxChunks = 8;
        requiresAdjacent = true;
        break;
        
      case QueryIntent.EXPLANATION:
      case QueryIntent.METHODOLOGY:
        maxChunks = 7;
        requiresAdjacent = true;
        break;
        
      case QueryIntent.COMPARISON:
      case QueryIntent.CROSS_DOCUMENT:
        maxChunks = 10;
        crossDocument = true;
        break;
        
      case QueryIntent.FACTUAL:
      case QueryIntent.FINANCIAL:
        maxChunks = 3;
        prioritizeRecent = true;
        break;
        
      default:
        maxChunks = 5;
    }

    return {
      maxChunks,
      requiresAdjacent,
      crossDocument,
      prioritizeRecent
    };
  }
}