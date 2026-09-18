import { createAIProvider, AIProvider, AIMessage, OpenRouterModelInfo, classifyAIError, AIErrorCode } from '@atlas/ai';
import { SearchService } from './search.js';
import { createLogger } from '@atlas/core';
import { QueryAnalyzer, QueryIntent } from './query-analyzer.js';
import { FilesystemAccessService } from './filesystem.js';

const logger = createLogger('AI_SERVICE');
const queryAnalyzer = new QueryAnalyzer();

const FS_CONTEXT_CHAR_LIMIT = 8000;
const FREE_ROUTER_ID = 'openrouter/free';

// Fallback allowlist used only when the catalog lacks explicit embedding
// capability metadata — never the sole signal. (ponytail: metadata-first;
// revisit when OpenRouter exposes a definitive embedding modality flag.)
const EMBEDDING_MODEL_FALLBACK_IDS = [
  'openai/text-embedding-3-large',
  'openai/text-embedding-3-small',
  'openai/text-embedding-ada-002',
  'nomic-ai/nomic-embed-text-v1.5',
  'snowflake/snowflake-arctic-embed:335m',
  'ibm-granite/granite-embedding-278m-multilingual',
];

export interface ModelOption {
  id: string;
  name: string;
  free: boolean;
  contextLength?: number | null;
  promptPrice?: number | null;
  completionPrice?: number | null;
}

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
  responseType?: 'chat' | 'discovery';
  discoveryDocuments?: Array<{
    id: string;
    name: string;
    extension: string;
    size: number;
    path: string;
    status: string;
    folderId: string;
    modifiedAt: string;
  }>;
  effectiveModel?: string;
  fallbackNotice?: string;
}

export class AIService {
  private provider: AIProvider;
  private filesystemAccess?: FilesystemAccessService;
  private searchService: SearchService;
  private config: {
    provider: string;
    apiKey?: string;
    model: string;
    embeddingModel: string;
    autoFallback: boolean;
  };
  private modelListCache: { key: string; value: { chat: ModelOption[]; embedding: ModelOption[] } } | null = null;

  constructor(searchService: SearchService, config: {
    provider: string;
    apiKey?: string;
    model: string;
    embeddingModel: string;
    autoFallback?: boolean;
  }, filesystemAccess?: FilesystemAccessService) {
    this.searchService = searchService;
    this.filesystemAccess = filesystemAccess;
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model || FREE_ROUTER_ID,
      embeddingModel: config.embeddingModel || 'openai/text-embedding-3-small',
      autoFallback: config.autoFallback !== false
    };
    this.provider = this.buildProvider();

    logger.info(`Initialized AI service with provider: ${this.provider.name}`);
  }

  private buildProvider(): AIProvider {
    return createAIProvider({
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      model: this.config.model,
      embeddingModel: this.config.embeddingModel
    });
  }

  // Applies runtime config (from Settings). Never exposes the API key.
  updateConfig(partial: {
    apiKey?: string;
    model?: string;
    embeddingModel?: string;
    autoFallback?: boolean;
  }): void {
    if (partial.apiKey !== undefined) {
      this.config.apiKey = partial.apiKey;
      this.modelListCache = null;
    }
    if (partial.model !== undefined && partial.model !== '') {
      this.config.model = partial.model;
    }
    if (partial.embeddingModel !== undefined && partial.embeddingModel !== '') {
      this.config.embeddingModel = partial.embeddingModel;
    }
    if (partial.autoFallback !== undefined) {
      this.config.autoFallback = partial.autoFallback;
    }

    this.config.provider = this.config.apiKey ? 'openrouter' : (process.env.AI_PROVIDER || 'mock');
    this.provider = this.buildProvider();
  }

  getModelConfig(): { model: string; embeddingModel: string } {
    return { model: this.config.model, embeddingModel: this.config.embeddingModel };
  }

  // Full runtime config for server-side persistence only. Never returned
  // to the frontend — routes use getProviderInfo() instead.
  getEffectiveConfig(): { apiKey?: string; model: string; embeddingModel: string; autoFallback: boolean } {
    return {
      apiKey: this.config.apiKey,
      model: this.config.model,
      embeddingModel: this.config.embeddingModel,
      autoFallback: this.config.autoFallback
    };
  }

  getProviderInfo() {
    return {
      provider: this.provider.name,
      configured: this.provider.isConfigured(),
      hasApiKey: Boolean(this.config.apiKey),
      model: this.config.model,
      embeddingModel: this.config.embeddingModel,
      autoFallback: this.config.autoFallback
    };
  }

  // Fetches OpenRouter catalog (cached 5 min per key, invalidated on key change)
  // and returns only the models ATLAS can use. No API key returned.
  async listModels(apiKey?: string): Promise<{ chat: ModelOption[]; embedding: ModelOption[] }> {
    const key = apiKey || this.config.apiKey;
    if (this.modelListCache && this.modelListCache.key === key) {
      return this.modelListCache.value;
    }

    const models = await this.provider.listModels(key);
    const chat = this.filterChatModels(models);
    const embedding = this.filterEmbeddingModels(models);
    this.modelListCache = { key, value: { chat, embedding } };

    logger.info(`Model discovery: ${chat.length} chat, ${embedding.length} embedding models`);
    return this.modelListCache.value;
  }

  private isFree(model: OpenRouterModelInfo): boolean {
    const p = model.pricing;
    return !p || (Number(p.prompt || 0) === 0 && Number(p.completion || 0) === 0);
  }

  private toOption(model: OpenRouterModelInfo): ModelOption {
    return {
      id: model.id,
      name: model.name || model.id,
      free: this.isFree(model),
      contextLength: model.context_length ?? model.endpoint?.context_length ?? null,
      promptPrice: model.pricing ? Number(model.pricing.prompt ?? null) : null,
      completionPrice: model.pricing ? Number(model.pricing.completion ?? null) : null
    };
  }

  private filterChatModels(models: OpenRouterModelInfo[]): ModelOption[] {
    const opts = models
      .filter((m) => {
        if (EMBEDDING_MODEL_FALLBACK_IDS.includes(m.id) || /embed(ding)?/i.test(m.id)) {
          return false;
        }
        const input = m.architecture?.input_modalities;
        const output = m.architecture?.output_modalities;
        if (input && output) {
          return input.includes('text') && output.includes('text');
        }
        return true; // No modality metadata -> keep for chat (text-capable by default)
      })
      .map((m) => this.toOption(m));

    // Free Router pinned to the top when present in the catalog.
    const freeRouter = opts.find((o) => o.id === FREE_ROUTER_ID);
    if (freeRouter) {
      opts.splice(opts.indexOf(freeRouter), 1);
      opts.unshift(freeRouter);
    } else {
      opts.unshift({ id: FREE_ROUTER_ID, name: 'OpenRouter Free Router', free: true });
    }

    return opts;
  }

  private filterEmbeddingModels(models: OpenRouterModelInfo[]): ModelOption[] {
    const byId = new Map(models.map((m) => [m.id, m]));
    const matched = new Set<string>();

    // Prefer explicit catalog metadata for embedding capability.
    const metadataMatches = models.filter((m) => {
      const modality = m.architecture?.modality?.toLowerCase() || '';
      const inputMods = (m.architecture?.input_modalities || []).join(',');
      return (
        modality.includes('embedding') ||
        modality === 'non-text' ||
        inputMods.includes('embedding') ||
        (m.support && (m.support as any).embedding === true)
      );
    });
    metadataMatches.forEach((m) => matched.add(m.id));

    // Fallback allowlist for embedding models the catalog does not flag.
    EMBEDDING_MODEL_FALLBACK_IDS.forEach((id) => {
      if (byId.has(id)) matched.add(id);
    });

    return Array.from(matched)
      .map((id) => byId.get(id)!)
      .map((m) => this.toOption(m));
  }

  async testConnection(apiKey?: string): Promise<{
    success: boolean;
    connected?: boolean;
    code?: AIErrorCode;
    message?: string;
    provider?: string;
    chatModelCount?: number;
    embeddingModelCount?: number;
    models?: { chat: ModelOption[]; embedding: ModelOption[] };
  }> {
    const effectiveKey = apiKey || this.config.apiKey;

    if (!effectiveKey) {
      return { success: false, code: 'NO_API_KEY', message: 'Masukkan API key terlebih dahulu.' };
    }

    try {
      // Validate first: /models is public and cannot distinguish a bad key.
      await this.provider.validateApiKey(effectiveKey);
      const models = await this.listModels(effectiveKey);
      // Cache reflects the tested key even before it is saved.
      this.config.apiKey = effectiveKey;
      return {
        success: true,
        connected: true,
        provider: 'OpenRouter',
        chatModelCount: models.chat.length,
        embeddingModelCount: models.embedding.length,
        models
      };
    } catch (error: any) {
      const classified = classifyAIError(error);
      logger.error(`OpenRouter connection test failed: ${classified.code}`);
      return {
        success: false,
        code: classified.code,
        message: classified.friendly
      };
    }
  }

  private friendlyChatError(error: any): string {
    const code = (error as any)?.classified?.code || (error as any)?.code as AIErrorCode | undefined;
    switch (code) {
      case 'NO_API_KEY':
        return 'Fitur Tanya ATLAS membutuhkan API key OpenRouter. Buka menu Settings → AI Provider untuk memasukkannya.';
      case 'INVALID_API_KEY':
        return 'API key tidak valid. Periksa kembali API key OpenRouter Anda di Settings → AI Provider.';
      case 'INSUFFICIENT_CREDITS':
        return 'API key berhasil dikenali, tetapi akun tidak memiliki kredit yang diperlukan untuk model berbayar. Pilih model FREE seperti "OpenRouter Free Router" di Settings.';
      case 'RATE_LIMITED':
        return 'Terlalu banyak permintaan (rate limit). Silakan tunggu sebentar lalu coba lagi.';
      case 'TIMEOUT':
        return 'Waktu permintaan habis (timeout). Silakan coba lagi.';
      case 'NETWORK':
        return 'Gagal terhubung ke OpenRouter. Periksa koneksi internet Anda.';
      case 'SERVER_ERROR':
        return 'Provider/OpenRouter sedang mengalami masalah sementara. Silakan coba lagi nanti.';
      default:
        return 'Terjadi kesalahan saat memproses pertanyaan Anda. Pastikan pengaturan AI valid dan coba lagi.';
    }
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    const conversationId = request.conversationId || this.generateConversationId();

    try {
      const queryAnalysis = queryAnalyzer.analyzeQuery(request.message);
      const analyzedQuery = queryAnalysis.originalQuery;

      if (queryAnalysis.intent === QueryIntent.CONVERSATIONAL) {
        return {
          response: this.getConversationalResponse(request.message),
          sources: [],
          conversationId,
          responseType: 'chat',
        };
      }

      if (queryAnalysis.intent === QueryIntent.DOCUMENT_DISCOVERY) {
        return this.handleDocumentDiscovery(request);
      }

      const startTime = Date.now();
      const relevantChunks = await this.searchService.getRelevantContext(analyzedQuery || request.message);
      logger.info(`[RAG] retrieval done chunks=${relevantChunks.length} ms=${Date.now() - startTime}`);

      if (relevantChunks.length === 0 && this.filesystemAccess) {
        try {
          const fsCandidates = await this.filesystemAccess.discoverCandidates(request.message, 5);
          if (fsCandidates.length > 0) {
            const directRead = await this.filesystemAccess.readFileDirect(fsCandidates[0].path);
            const grounded = directRead.result;
            if (grounded && grounded.text && grounded.text.trim().length > 0) {
              const groundedContext = {
                text: grounded.text.slice(0, FS_CONTEXT_CHAR_LIMIT),
                source: directRead.path,
                documentName: grounded.name,
                section: `dibaca langsung dari filesystem (belum terindeks)`,
              };
              logger.info(`[FS_DIRECT_READ] direct-read fallback path=${directRead.path} chars=${grounded.text.length}`);
              const fsPrompt = this.createEnhancedContextPrompt([groundedContext], request.message, queryAnalysis);
              const fsMessages: AIMessage[] = [
                { role: 'system', content: this.createSystemPrompt() },
                { role: 'user', content: fsPrompt },
              ];
              const providerResponse = await this.provider.generateResponse(fsMessages);
              return {
                response: providerResponse.content,
                sources: [],
                conversationId,
                responseType: 'chat',
              };
            }
            return {
              response: `Ditemukan di filesystem tapi isinya belum dapat dibaca: ${fsCandidates[0].name}. File ini belum terindeks.`,
              sources: [],
              conversationId,
              responseType: 'discovery',
              discoveryDocuments: fsCandidates.map((f) => ({
                id: `fs-${f.path}`,
                name: f.name,
                extension: f.extension || f.path.split('.').pop() || '',
                size: f.size || 0,
                path: f.path,
                status: 'unindexed',
                folderId: f.folderId || '',
                modifiedAt: f.modifiedAt?.toISOString() || new Date().toISOString(),
              })),
            };
          }
        } catch (err) {
          logger.error(`[FS_DIRECT_READ] fallback error: ${(err as Error).message}`);
        }
      }

      const assembledContext = await this.assembleIntelligentContext(relevantChunks, queryAnalysis);
      const systemPrompt = this.createEnhancedSystemPrompt(queryAnalysis.intent);
      const contextPrompt = this.createEnhancedContextPrompt(assembledContext, request.message, queryAnalysis);
      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ];

      const aiOptions = this.getAIOptionsForIntent(queryAnalysis.intent);
      const aiResponse = await this.provider.generateResponse(messages, aiOptions);

      const sources = await this.prepareSources(relevantChunks, queryAnalysis);
      const response: ChatResponse = {
        response: aiResponse.content,
        sources,
        conversationId,
      };
      return response;
    } catch (error) {
      logger.error('Error processing chat:', error);
      return {
        response: this.friendlyChatError(error),
        sources: [],
        conversationId: request.conversationId || this.generateConversationId(),
      };
    }
  }


  // === CONVERSATIONAL RESPONSE (deterministic, no LLM) ===
  private getConversationalResponse(query: string): string {
    const q = query.toLowerCase().trim();

    // Greetings
    if (/^(hai|halo|hello|hi|hey)\b/i.test(q)) {
      return 'Halo! 👋 Ada yang bisa saya bantu cari atau pahami dari dokumen Anda?';
    }
    if (/^(selamat\s+(pagi|siang|sore|malam))\b/i.test(q)) {
      const timeWord = q.includes('pagi') ? 'Pagi' : q.includes('siang') ? 'Siang' : q.includes('sore') ? 'Sore' : 'Malam';
      return `Selamat ${timeWord}! 👋 Ada yang bisa saya bantu dari dokumen Anda?`;
    }
    if (/^(apa\s+kabar)\b/i.test(q)) {
      return 'Kabar baik! 😊 Siap membantu Anda mencari informasi dari dokumen.';
    }

    // Thanks
    if (/^(terima\s+kasih|makasih|thanks|thank\s*you)\b/i.test(q)) {
      return 'Sama-sama! 😊 Ada yang lain bisa saya bantu?';
    }

    // Acknowledgments
    if (/^(ok|oke|sip|siap|baik|mantap|keren|hebat|bagus)\b/i.test(q)) {
      return '👍 Siap! Kalau butuh bantuan lagi, tinggal tanya.';
    }

    // Goodbye
    if (/^(dadah|bye|goodbye|selamat\s+tinggal|see\s*you|sampai\s+jumpa)\b/i.test(q)) {
      return 'Sampai jumpa! 👋 Semoga harimu menyenangkan.';
    }

    // Fallback for any other conversational input
    return 'Halo! 👋 Ada yang bisa saya bantu cari atau pahami dari dokumen Anda?';
  }

  // === DOCUMENT DISCOVERY (search by filename/metadata) ===
  private async handleDocumentDiscovery(request: ChatRequest): Promise<ChatResponse> {
    const conversationId = request.conversationId || this.generateConversationId();

    // Extract search keywords from the query (only strip action/trigger words, keep domain terms)
    const keywords = request.message
      .toLowerCase()
      .replace(/\b(carikan|cari|find|search|tunjukkan|show|display|ada|mana|tampilkan|lihat|file|dokumen|pdf|doc|yang|tentang|dari|ini|itu|saya|aku)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!keywords) {
      // Generic "show all documents" request
      const docs = (await this.searchService.db.getDocuments()).slice(0, 10);
      if (docs.length === 0) {
        return {
          response: 'Belum ada dokumen yang terindeks. Silakan tambahkan folder atau file terlebih dahulu.',
          sources: [],
          conversationId,
          responseType: 'discovery',
          discoveryDocuments: []
        };
      }
      const list = docs.slice(0, 5).map((d: any) => `• **${d.name}** (${d.extension || '-'}, ${d.status})`).join('\n');
      return {
        response: `Berikut dokumen yang tersedia:\n${list}${docs.length > 5 ? `\n... dan ${docs.length - 5} lainnya.` : ''}`,
        sources: [],
        conversationId,
        responseType: 'discovery',
        discoveryDocuments: docs.slice(0, 10).map((d: any) => ({
          id: d.id,
          name: d.name,
          extension: d.extension || '',
          size: d.size || 0,
          path: d.path || '',
          status: d.status,
          folderId: d.folderId,
          modifiedAt: d.modifiedAt?.toISOString() || new Date().toISOString()
        }))
      };
    }

    // Search documents by name (in-memory filter on all docs)
    const allDocs = await this.searchService.db.getDocuments();
    const docs = allDocs.filter((d: any) =>
      d.name.toLowerCase().includes(keywords) ||
      (d.path && d.path.toLowerCase().includes(keywords))
    ).slice(0, 10);

    if (docs.length === 0) {
      // FTS has no answer → try lazy FS metadata discovery over connected
      // folders (filename/path only, never reads contents). The filesystem is
      // the source of truth; the index is just an accelerator.
      if (this.filesystemAccess) {
        const fsCandidates = await this.filesystemAccess.discoverCandidates(keywords, 10);
        if (fsCandidates.length > 0) {
          const fsList = fsCandidates.map((f) => `• **${f.name}** (${f.extension || '-'}, ditemukan di filesystem — belum terindeks)`).join('\n');
          logger.info(`[FS_METADATA_DISCOVERY] fallback hit candidates=${fsCandidates.length} keywords="${keywords}"`);
          return {
            response: `Ditemukan ${fsCandidates.length} file yang cocok di folder terhubung (belum terindeks):\n${fsList}\n\nFile ini ada di filesystem tapi belum melalui indeks. Saya bisa re-index atau langsung membaca isinya — tanyakan isi dokumen untuk pembahasan.`,
            sources: [],
            conversationId,
            responseType: 'discovery',
            discoveryDocuments: fsCandidates.map((f) => ({
              id: `fs-${f.path}`,
              name: f.name,
              extension: f.extension,
              size: f.size || 0,
              path: f.path,
              status: 'unindexed',
              unindexed: true,
              folderId: f.folderId || '',
              modifiedAt: f.modifiedAt?.toISOString?.() || new Date().toISOString()
            }))
          };
        }
      }

      return {
        response: `Tidak ditemukan dokumen dengan kata kunci "${keywords}". Coba kata kunci lain atau periksa nama file.`,
        sources: [],
        conversationId,
        responseType: 'discovery',
        discoveryDocuments: []
      };
    }

    const list = docs.slice(0, 5).map((d: any) => {
      const sizeKB = d.size ? `${Math.round(d.size / 1024)}KB` : '-';
      return `• **${d.name}** (${d.extension || '-'}, ${sizeKB}, ${d.status})`;
    }).join('\n');

    return {
      response: `Ditemukan ${docs.length} dokumen untuk "${keywords}":\n${list}${docs.length > 5 ? `\n... dan ${docs.length - 5} lainnya.` : ''}\n\nTanyakan isi dokumen untuk analisis lebih lanjut.`,
      sources: [],
      conversationId,
      responseType: 'discovery',
      discoveryDocuments: docs.map((d: any) => ({
        id: d.id,
        name: d.name,
        extension: d.extension || '',
        size: d.size || 0,
        path: d.path || '',
        status: d.status,
        folderId: d.folderId,
        modifiedAt: d.modifiedAt?.toISOString() || new Date().toISOString()
      }))
    };
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
}
