import { createAIProvider, AIProvider, AIMessage } from '@atlas/ai';
import { SearchService } from './search.js';
import { createLogger } from '@atlas/core';
import { QueryIntent } from './query-analyzer.js';

const logger = createLogger('AI_SERVICE');

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  response: string;
  sources: Array<{
    documentId: string;
    documentName: string;
    chunkId: string;
    page?: number;
    snippet: string;
  }>;
  conversationId: string;
}

export class AIService {
  private provider: AIProvider;
  private searchService: SearchService;

  constructor(searchService: SearchService, config: {
    provider: string;
    apiKey?: string;
    model: string;
    embeddingModel: string;
  }) {
    this.searchService = searchService;
    this.provider = createAIProvider(config);
    
    logger.info(`Initialized AI service with provider: ${this.provider.name}`);
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    logger.info(`Processing chat: "${request.message}"`);

    try {
      // Enhanced context retrieval with query analysis
      const contextResult = await this.searchService.searchForContext(
        request.message,
        8 // Allow more chunks for better context
      );

      const relevantChunks = contextResult.chunks;
      const queryAnalysis = contextResult.analysis;
      const strategy = contextResult.strategy;

      logger.info(`Context retrieval completed:`, {
        intent: queryAnalysis.intent,
        chunksFound: relevantChunks.length,
        needsMultipleChunks: queryAnalysis.needsMultipleChunks,
        isDocumentLevel: queryAnalysis.isDocumentLevel
      });

      // Check if we have enough relevant context
      if (relevantChunks.length === 0) {
        logger.info(`No relevant context found for query: "${request.message}"`);
        return {
          response: 'Maaf, saya belum menemukan informasi yang cukup relevan di dokumen yang tersedia untuk menjawab pertanyaan tersebut. Pastikan dokumen sudah terindeks dengan benar.',
          sources: [],
          conversationId: request.conversationId || this.generateConversationId()
        };
      }

      // Apply relevance threshold - reject if context seems irrelevant
      const contextRelevance = this.assessContextRelevance(request.message, relevantChunks, queryAnalysis);
      
      if (contextRelevance.score < 0.3) {
        logger.info(`Context relevance too low (${contextRelevance.score}), rejecting query`);
        return {
          response: contextRelevance.reason || 'Maaf, saya tidak menemukan informasi yang relevan untuk pertanyaan tersebut dalam dokumen yang tersedia.',
          sources: [],
          conversationId: request.conversationId || this.generateConversationId()
        };
      }

      // Prepare enhanced context for AI
      const assembledContext = await this.assembleIntelligentContext(relevantChunks, queryAnalysis);

      // Create enhanced system prompt based on query intent
      const systemPrompt = this.createEnhancedSystemPrompt(queryAnalysis);
      
      // Create context prompt with better structure
      const contextPrompt = this.createEnhancedContextPrompt(assembledContext, request.message, queryAnalysis);

      // Prepare messages for AI
      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt }
      ];

      // Get AI response with dynamic parameters based on intent
      const aiOptions = this.getAIOptionsForIntent(queryAnalysis.intent);
      const aiResponse = await this.provider.generateResponse(messages, aiOptions);

      // Prepare enhanced sources with better metadata
      const sources = await this.prepareSources(relevantChunks, queryAnalysis);

      const response: ChatResponse = {
        response: aiResponse.content,
        sources,
        conversationId: request.conversationId || this.generateConversationId()
      };

      logger.info(`Chat processed successfully: intent=${queryAnalysis.intent}, sources=${sources.length}, contextRelevance=${contextRelevance.score.toFixed(2)}`);
      return response;

    } catch (error) {
      logger.error('Error processing chat:', error);
      
      // Enhanced fallback response
      return {
        response: 'Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Pastikan dokumen sudah terindeks dan coba lagi. Jika masalah berlanjut, coba dengan pertanyaan yang lebih spesifik.',
        sources: [],
        conversationId: request.conversationId || this.generateConversationId()
      };
    }
  }

  private createSystemPrompt(): string {
    return `Anda adalah ATLAS, asisten AI yang membantu pengguna memahami dokumen mereka.

PENTING:
- Jawab HANYA berdasarkan konteks dokumen yang diberikan
- Jika informasi tidak tersedia dalam konteks, katakan bahwa informasi tidak ditemukan
- Jangan mengarang fakta atau informasi
- Berikan jawaban dalam Bahasa Indonesia yang natural dan mudah dipahami
- Rujuk ke sumber dokumen ketika memberikan informasi spesifik
- Jika ada angka atau data penting, sebutkan dengan jelas

Format jawaban Anda harus informatif namun ringkas. Jika pengguna bertanya tentang perbandingan, berikan analisis berdasarkan data yang tersedia.`;
  }

  // Enhanced system prompt based on query intent
  private createEnhancedSystemPrompt(queryAnalysis: any): string {
    const basePrompt = `Anda adalah ATLAS, asisten AI yang membantu pengguna memahami dokumen mereka.

PERAN ANDA:
- Anda adalah document-grounded AI yang HANYA menjawab berdasarkan konteks dokumen yang diberikan
- Anda memahami makna dan hubungan antar informasi dalam dokumen, bukan hanya mencocokkan kata kunci
- Anda dapat merangkum, menjelaskan, membandingkan, dan menyimpulkan HANYA berdasarkan informasi yang tersedia

ATURAN FUNDAMENTAL:
- Jangan pernah mengarang fakta yang tidak ada dalam konteks
- Jika informasi tidak tersedia dalam konteks, katakan dengan jelas "Informasi tersebut tidak ditemukan dalam dokumen yang tersedia"
- Berikan jawaban dalam Bahasa Indonesia yang natural dan mudah dipahami
- Fokus pada pemahaman makna, bukan hanya pencocokan kata kunci
- Sebutkan sumber dokumen ketika memberikan informasi spesifik`;

    // Intent-specific instructions
    let intentSpecificPrompt = '';
    
    switch (queryAnalysis.intent) {
      case QueryIntent.DOCUMENT_OVERVIEW:
      case QueryIntent.SUMMARY:
        intentSpecificPrompt = `

TUGAS KHUSUS - RINGKASAN DOKUMEN:
- Buat ringkasan yang mencakup poin-poin utama dari semua bagian dokumen
- Identifikasi tema utama, tujuan, dan kesimpulan penting
- Jelaskan dengan struktur yang logis dan mudah dipahami
- Jangan hanya menyebutkan detail teknis, tapi jelaskan maknanya`;
        break;

      case QueryIntent.EXPLANATION:
      case QueryIntent.METHODOLOGY:
        intentSpecificPrompt = `

TUGAS KHUSUS - PENJELASAN:
- Berikan penjelasan yang komprehensif dan mudah dipahami
- Jelaskan tidak hanya "apa" tapi juga "mengapa" dan "bagaimana" jika informasinya tersedia
- Gunakan analogi atau contoh sederhana jika membantu
- Hubungkan konsep-konsep yang terkait dalam dokumen`;
        break;

      case QueryIntent.COMPARISON:
        intentSpecificPrompt = `

TUGAS KHUSUS - PERBANDINGAN:
- Identifikasi persamaan dan perbedaan yang signifikan
- Berikan analisis yang seimbang dan objektif
- Jelaskan implikasi dari perbedaan yang ditemukan
- Pastikan perbandingan berdasarkan data konkret dari dokumen`;
        break;

      case QueryIntent.FINANCIAL:
        intentSpecificPrompt = `

TUGAS KHUSUS - INFORMASI FINANSIAL:
- Sebutkan angka dengan presisi dan konteks yang jelas
- Jelaskan periode waktu yang relevan
- Bandingkan dengan referensi lain dalam dokumen jika ada
- Pastikan akurasi dalam menyebutkan mata uang dan satuan`;
        break;

      case QueryIntent.PEOPLE_RESPONSIBILITY:
        intentSpecificPrompt = `

TUGAS KHUSUS - INFORMASI PERSONEL:
- Sebutkan nama, jabatan, dan tanggung jawab dengan jelas
- Jelaskan struktur organisasi jika relevan
- Identifikasi peran dan wewenang yang spesifik
- Pastikan informasi kontak atau detail lain yang tersedia`;
        break;

      default:
        intentSpecificPrompt = `

TUGAS KHUSUS - JAWABAN FAKTUAL:
- Berikan jawaban yang spesifik dan akurat
- Sertakan detail pendukung yang relevan
- Jelaskan konteks jika diperlukan untuk pemahaman yang lebih baik`;
    }

    return basePrompt + intentSpecificPrompt + `

FORMAT JAWABAN:
- Mulai langsung dengan informasi yang diminta
- Gunakan paragraf terstruktur untuk informasi kompleks
- Sebutkan sumber dokumen di akhir jika ada informasi spesifik
- Jangan gunakan format "Berdasarkan dokumen..." di awal kecuali perlu`;
  }

  // Enhanced context prompt with better structure
  private createEnhancedContextPrompt(
    assembledContext: Array<{text: string, source: string, documentName: string, section?: string}>, 
    question: string, 
    queryAnalysis: any
  ): string {
    if (assembledContext.length === 0) {
      return `Pertanyaan: ${question}

Konteks: Tidak ada dokumen relevan yang ditemukan.

Mohon beri tahu pengguna bahwa informasi tidak ditemukan dalam dokumen yang tersedia.`;
    }

    // Group context by document for better organization
    const contextByDocument = new Map<string, Array<{text: string, source: string, section?: string}>>();
    
    for (const ctx of assembledContext) {
      if (!contextByDocument.has(ctx.documentName)) {
        contextByDocument.set(ctx.documentName, []);
      }
      contextByDocument.get(ctx.documentName)!.push(ctx);
    }

    let contextText = '';
    let sourceIndex = 1;

    for (const [documentName, contexts] of contextByDocument) {
      contextText += `\n=== ${documentName} ===\n`;
      
      for (const ctx of contexts) {
        contextText += `[Sumber ${sourceIndex}]${ctx.section ? ` - ${ctx.section}` : ''}:\n${ctx.text}\n\n`;
        sourceIndex++;
      }
    }

    let questionPrompt = `Pertanyaan: ${question}`;
    
    // Add intent-specific guidance
    if (queryAnalysis.isDocumentLevel) {
      questionPrompt += `\n(Catatan: Ini adalah pertanyaan tingkat dokumen yang memerlukan pemahaman menyeluruh)`;
    } else if (queryAnalysis.requiresComparison) {
      questionPrompt += `\n(Catatan: Pertanyaan ini memerlukan perbandingan antar informasi)`;
    }

    return `${questionPrompt}

Konteks dari dokumen:${contextText}

INSTRUKSI:
Jawab pertanyaan berdasarkan konteks di atas. Pahami makna dan hubungan antar informasi, jangan hanya mencocokkan kata kunci. Berikan jawaban yang natural dan informatif sesuai dengan konteks yang tersedia.`;
  }

  // Assess context relevance to prevent hallucination
  private assessContextRelevance(query: string, chunks: any[], queryAnalysis: any): {score: number, reason?: string} {
    if (chunks.length === 0) {
      return { score: 0, reason: 'Tidak ada dokumen yang ditemukan untuk pertanyaan ini.' };
    }

    const queryLower = query.toLowerCase();
    let totalRelevanceScore = 0;
    let maxChunkScore = 0;

    // Check each chunk for relevance
    for (const chunk of chunks) {
      const chunkLower = chunk.text.toLowerCase();
      let chunkScore = 0;

      // Direct query match
      if (chunkLower.includes(queryLower)) {
        chunkScore += 0.8;
      }

      // Key entity matches
      for (const entity of queryAnalysis.keyEntities) {
        if (chunkLower.includes(entity.toLowerCase())) {
          chunkScore += 0.3;
        }
      }

      // Intent-specific relevance checks
      switch (queryAnalysis.intent) {
        case QueryIntent.FINANCIAL:
          if (/\b(rp|rupiah|\d+\.?\d*\s*(juta|miliar|ribu|rb|k|m|b)|biaya|dana|anggaran)\b/i.test(chunk.text)) {
            chunkScore += 0.4;
          }
          break;
          
        case QueryIntent.DATE_TIME:
          if (/\b(\d{1,2}[:.]\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|jam|waktu|pukul)\b/i.test(chunk.text)) {
            chunkScore += 0.4;
          }
          break;
          
        case QueryIntent.PEOPLE_RESPONSIBILITY:
          if (/\b(koordinator|manager|direktur|kepala|pic|penanggung jawab|bertanggung jawab)\b/i.test(chunk.text)) {
            chunkScore += 0.4;
          }
          break;
      }

      maxChunkScore = Math.max(maxChunkScore, chunkScore);
      totalRelevanceScore += chunkScore;
    }

    const averageRelevance = totalRelevanceScore / chunks.length;
    const finalScore = Math.max(averageRelevance, maxChunkScore * 0.7); // Give weight to best match

    // Specific rejection cases
    if (finalScore < 0.2) {
      return { 
        score: finalScore, 
        reason: 'Pertanyaan ini tampaknya di luar cakupan dokumen yang tersedia. Coba gunakan kata kunci yang lebih spesifik atau pastikan dokumen yang relevan sudah diindeks.' 
      };
    }

    if (queryAnalysis.intent === QueryIntent.COMPARISON && chunks.length < 2) {
      return { 
        score: 0.1, 
        reason: 'Tidak cukup informasi untuk melakukan perbandingan yang diminta.' 
      };
    }

    return { score: finalScore };
  }

  // Assemble context intelligently based on query analysis
  private async assembleIntelligentContext(chunks: any[], queryAnalysis: any): Promise<Array<{text: string, source: string, documentName: string, section?: string}>> {
    const assembledContext: Array<{text: string, source: string, documentName: string, section?: string}> = [];

    for (const chunk of chunks) {
      const document = await this.searchService.db.getDocument(chunk.documentId);
      if (!document) continue;

      // Enhance chunk text with adjacent context if beneficial
      let enhancedText = chunk.text;
      
      if (queryAnalysis.needsMultipleChunks && chunk.text.length < 500) {
        // Try to get adjacent chunks for better context
        const adjacentChunks = await this.getAdjacentChunks(chunk);
        if (adjacentChunks.length > 0) {
          const combinedText = adjacentChunks.map(c => c.text).join(' ');
          if (combinedText.length < 1000) { // Don't make it too long
            enhancedText = combinedText;
          }
        }
      }

      assembledContext.push({
        text: enhancedText,
        source: `${document.name} (chunk ${chunk.chunkIndex})`,
        documentName: document.name,
        section: chunk.metadata?.section
      });
    }

    return assembledContext;
  }

  // Get adjacent chunks for better context
  private async getAdjacentChunks(chunk: any, radius: number = 1): Promise<any[]> {
    const allChunks = await this.searchService.db.getChunks(chunk.documentId);
    const adjacent: any[] = [chunk]; // Include the original chunk
    
    for (let i = -radius; i <= radius; i++) {
      if (i === 0) continue; // Skip the original chunk (already added)
      
      const targetIndex = chunk.chunkIndex + i;
      const targetChunk = allChunks.find(c => c.chunkIndex === targetIndex);
      
      if (targetChunk) {
        adjacent.push(targetChunk);
      }
    }
    
    return adjacent.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  // Get AI options based on intent
  private getAIOptionsForIntent(intent: QueryIntent): any {
    const baseOptions = {
      maxTokens: 1000,
      temperature: 0.7
    };

    switch (intent) {
      case QueryIntent.DOCUMENT_OVERVIEW:
      case QueryIntent.SUMMARY:
        return {
          ...baseOptions,
          maxTokens: 1500, // Allow longer summaries
          temperature: 0.6  // Slightly more focused
        };

      case QueryIntent.EXPLANATION:
      case QueryIntent.METHODOLOGY:
        return {
          ...baseOptions,
          maxTokens: 1200,
          temperature: 0.6
        };

      case QueryIntent.FACTUAL:
      case QueryIntent.FINANCIAL:
      case QueryIntent.DATE_TIME:
        return {
          ...baseOptions,
          maxTokens: 800,
          temperature: 0.3  // More precise for factual queries
        };

      case QueryIntent.COMPARISON:
        return {
          ...baseOptions,
          maxTokens: 1300,
          temperature: 0.5
        };

      default:
        return baseOptions;
    }
  }

  // Prepare enhanced sources with better metadata
  private async prepareSources(chunks: any[], queryAnalysis: any): Promise<Array<{
    documentId: string;
    documentName: string;
    chunkId: string;
    page?: number;
    snippet: string;
  }>> {
    return (await Promise.all(chunks.map(async chunk => {
      const document = await this.searchService.db.getDocument(chunk.documentId);
      if (!document) return null;

      // Create intelligent snippet based on query intent
      let snippet = chunk.text;
      
      // For long chunks, create a more targeted snippet
      if (snippet.length > 300) {
        const queryTerms = queryAnalysis.keyEntities.concat([queryAnalysis.originalQuery]);
        let bestSnippet = snippet.slice(0, 300);
        
        // Try to find the most relevant part of the chunk
        for (const term of queryTerms) {
          const termIndex = snippet.toLowerCase().indexOf(term.toLowerCase());
          if (termIndex >= 0) {
            const start = Math.max(0, termIndex - 100);
            const end = Math.min(snippet.length, termIndex + 200);
            bestSnippet = (start > 0 ? '...' : '') + 
                         snippet.slice(start, end) + 
                         (end < snippet.length ? '...' : '');
            break;
          }
        }
        snippet = bestSnippet;
      }

      return {
        documentId: chunk.documentId,
        documentName: document.name,
        chunkId: chunk.id,
        page: chunk.metadata?.page,
        snippet
      };
    }))).filter(Boolean);
  }

  private createContextPrompt(context: Array<{ text: string; source: string }>, question: string): string {
    if (context.length === 0) {
      return `Pertanyaan: ${question}

Konteks: Tidak ada dokumen relevan yang ditemukan.

Mohon beri tahu pengguna bahwa informasi tidak ditemukan dalam dokumen yang tersedia.`;
    }

    const contextText = context.map((ctx, index) => 
      `Sumber ${index + 1}:\n${ctx.text}\n`
    ).join('\n');

    return `Pertanyaan: ${question}

Konteks dari dokumen:
${contextText}

Berdasarkan konteks di atas, berikan jawaban yang akurat dan informatif untuk pertanyaan pengguna.`;
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getProviderInfo() {
    return {
      name: this.provider.name,
      configured: this.provider.isConfigured()
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const testResponse = await this.provider.generateResponse([
        { role: 'user', content: 'Hello, this is a connection test.' }
      ]);
      
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}