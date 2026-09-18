import axios from 'axios';
import { createLogger } from '@atlas/core';

const logger = createLogger('AI_PROVIDER');

// Free router used as an automatic fallback when the primary model's credits run out.
const FREE_ROUTER_ID = 'openrouter/free';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  effectiveModel?: string;
  fallbackNotice?: string;
}

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  context_length?: number | null;
  created?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    request?: number;
    image?: number;
    web_search?: number;
    internal_reasoning?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoint?: {
    context_length?: number;
    max_completion_tokens?: number;
    supports_parameters?: string[];
    supports_vision?: boolean;
  };
  support?: Record<string, unknown>;
  description?: string;
}

export type AIErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UNKNOWN';

export interface ClassifiedAIError {
  code: AIErrorCode;
  message: string;
  friendly: string;
}

// Maps raw transport errors (axios) to structured categories the UI can act on.
export function classifyAIError(error: any): ClassifiedAIError {
  // Re-classification after a local wrapper already produced a classified error.
  if (error?.classified) {
    return error.classified;
  }
  const status = error?.response?.status;
  const rawMessage = error?.response?.data?.error?.message || error?.message || '';

  if (status === 401) {
    return { code: 'INVALID_API_KEY', message: rawMessage, friendly: 'API key tidak valid.' };
  }
  if (status === 402) {
    return { code: 'INSUFFICIENT_CREDITS', message: rawMessage, friendly: 'API key berhasil dikenali, tetapi akun tidak memiliki kredit yang diperlukan untuk model berbayar.' };
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: rawMessage, friendly: 'Terlalu banyak permintaan (rate limit). Silakan coba lagi nanti.' };
  }
  if (status && status >= 500) {
    return { code: 'SERVER_ERROR', message: rawMessage, friendly: 'Provider/OpenRouter sedang mengalami masalah sementara. Silakan coba lagi.' };
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return { code: 'TIMEOUT', message: rawMessage, friendly: 'Waktu permintaan habis (timeout). Silakan coba lagi.' };
  }
  if (error?.request || error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
    return { code: 'NETWORK', message: rawMessage, friendly: 'Gagal terhubung ke layanan AI. Periksa koneksi internet Anda.' };
  }
  return { code: 'UNKNOWN', message: rawMessage, friendly: rawMessage || 'Terjadi kesalahan yang tidak diketahui.' };
}

function attachCode(error: any, classified: ClassifiedAIError): Error {
  const err = new Error(classified.friendly) as any;
  err.classified = classified;
  return err;
}

export interface AIProvider {
  name: string;
  generateResponse(messages: AIMessage[], options?: any): Promise<AIResponse>;
  generateEmbedding(text: string): Promise<number[]>;
  listModels(apiKey?: string): Promise<OpenRouterModelInfo[]>;
  validateApiKey(apiKey: string): Promise<void>;
  isConfigured(): boolean;
}

export class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter';
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1';
  private model: string;
  private embeddingModel: string;
  private modelCache: { keyHash: string; fetchedAt: number; models: OpenRouterModelInfo[] } | null = null;
  private readonly MODEL_CACHE_TTL = 5 * 60 * 1000;

  constructor(config: {
    apiKey: string;
    model: string;
    embeddingModel: string;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.embeddingModel = config.embeddingModel;
  }

  update(config: { apiKey?: string; model?: string; embeddingModel?: string }): void {
    if (config.apiKey !== undefined) {
      this.apiKey = config.apiKey;
      this.modelCache = null; // Invalidate catalog cache when key changes
    }
    if (config.model !== undefined) this.model = config.model;
    if (config.embeddingModel !== undefined) this.embeddingModel = config.embeddingModel;
  }

  async generateResponse(messages: AIMessage[], options: any = {}): Promise<AIResponse> {
    if (!this.isConfigured()) {
      const err = new Error('OpenRouter not configured. Please set API key.') as any;
      err.code = 'NO_API_KEY';
      throw err;
    }

    const primaryModel: string = options.model || this.model;

    try {
      // Must await: without it the catch below never fires (the error rejects
      // only after the un-awaited promise reaches the caller), so the free
      // router fallback was dead code.
      return await this.postChatCompletion(messages, options, primaryModel);
    } catch (error: any) {
      const classified = classifyAIError(error);
      if (
        options.autoFallback !== false &&
        classified.code === 'INSUFFICIENT_CREDITS' &&
        primaryModel !== FREE_ROUTER_ID
      ) {
        logger.warn('Credits exhausted on primary model; retrying with free router');
        // Carry the primary model in options so postChatCompletion can flag
        // the response with a fallbackNotice for the UI.
        return await this.postChatCompletion(
          messages,
          { ...options, model: primaryModel },
          FREE_ROUTER_ID
        );
      }
      throw error;
    }
  }

  private async postChatCompletion(
    messages: AIMessage[],
    options: any,
    model: string
  ): Promise<AIResponse> {
    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model,
          messages,
          max_tokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'ATLAS Document Intelligence',
          }
        }
      );

      const choice = response.data.choices?.[0];
      if (!choice) {
        throw new Error('No response from AI model');
      }

      return {
        content: choice.message.content,
        usage: response.data.usage,
        effectiveModel: model,
        fallbackNotice:
          model === FREE_ROUTER_ID && options.model && options.model !== FREE_ROUTER_ID
            ? `Kredit model utama habis — jawaban ini memakai model gratis (openrouter/free).`
            : undefined
      };
    } catch (error: any) {
      const classified = classifyAIError(error);
      logger.error('OpenRouter API error:', error.response?.data || error.message);
      const err = attachCode(error, classified) as any;
      err.classified = classified;
      throw err;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isConfigured()) {
      const err = new Error('OpenRouter not configured. Please set API key.') as any;
      err.code = 'NO_API_KEY';
      throw err;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/embeddings`,
        {
          model: this.embeddingModel,
          input: text,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          }
        }
      );

      const embedding = response.data.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding generated');
      }

      return embedding;
    } catch (error: any) {
      const classified = classifyAIError(error);
      logger.error('OpenRouter embedding error:', error.response?.data || error.message);
      throw attachCode(error, classified);
    }
  }

  // Fetches the OpenRouter model catalog. Cached for a few minutes per API key.
  async listModels(apiKey?: string): Promise<OpenRouterModelInfo[]> {
    const key = apiKey || this.apiKey;
    const keyHash = this.hashKey(key);
    if (
      this.modelCache &&
      this.modelCache.keyHash === keyHash &&
      Date.now() - this.modelCache.fetchedAt < this.MODEL_CACHE_TTL
    ) {
      return this.modelCache.models;
    }

    try {
      const response = await axios.get(`${this.baseURL}/models`, {
        headers: key ? { 'Authorization': `Bearer ${key}` } : undefined,
        timeout: 20000
      });
      const models: OpenRouterModelInfo[] = response.data?.data || [];
      this.modelCache = { keyHash, fetchedAt: Date.now(), models };
      logger.info(`Fetched ${models.length} OpenRouter models`);
      return models;
    } catch (error: any) {
      const classified = classifyAIError(error);
      throw attachCode(error, classified);
    }
  }

  // Validates an API key via the protected /key endpoint.
  // /models is public, so it cannot tell a valid key from garbage.
  async validateApiKey(apiKey: string): Promise<void> {
    try {
      await axios.get(`${this.baseURL}/key`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 20000
      });
    } catch (error: any) {
      const classified = classifyAIError(error);
      throw attachCode(error, classified);
    }
  }

  private hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return `${hash}`;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model);
  }
}

export class MockAIProvider implements AIProvider {
  name = 'Mock AI';

  async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    
    // Simple mock responses based on content
    let response = '';
    
    if (userMessage.toLowerCase().includes('anggaran') || userMessage.toLowerCase().includes('biaya')) {
      response = 'Berdasarkan analisis dokumen, saya menemukan informasi terkait anggaran. Namun untuk memberikan jawaban yang akurat, silakan periksa dokumen sumber yang tercantum di bawah.';
    } else if (userMessage.toLowerCase().includes('bandingkan')) {
      response = 'Saya telah mengidentifikasi dokumen-dokumen yang relevan untuk perbandingan. Informasi detail dapat ditemukan dalam dokumen sumber.';
    } else {
      response = `Saya menemukan informasi yang mungkin relevan dengan pertanyaan "${userMessage}". Silakan periksa dokumen sumber untuk detail lengkapnya.`;
    }

    return {
      content: response,
      usage: {
        prompt_tokens: userMessage.length,
        completion_tokens: response.length,
        total_tokens: userMessage.length + response.length
      }
    };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    // Generate a mock embedding (random vector for testing)
    const dimension = 1536; // OpenAI embedding dimension
    const embedding = Array(dimension).fill(0).map(() => Math.random() - 0.5);
    return embedding;
  }

  async listModels(): Promise<OpenRouterModelInfo[]> {
    return [
      {
        id: 'openrouter/free',
        name: 'OpenRouter Free Router',
        context_length: 128000,
        pricing: { prompt: 0, completion: 0 }
      }
    ];
  }

  async validateApiKey(): Promise<void> {
    // Mock provider accepts any key
  }

  isConfigured(): boolean {
    return true; // Mock provider is always "configured"
  }
}

export class GoogleAIProvider implements AIProvider {
  name = 'Google AI';
  private apiKey: string;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string;
  private embeddingModel: string;

  constructor(config: {
    apiKey: string;
    model: string;
    embeddingModel: string;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.embeddingModel = config.embeddingModel;
  }

  update(config: { apiKey?: string; model?: string; embeddingModel?: string }): void {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.model !== undefined) this.model = config.model;
    if (config.embeddingModel !== undefined) this.embeddingModel = config.embeddingModel;
  }

  // Maps Google API errors (400/403 = bad key) onto the shared error codes
  // the UI already understands.
  private throwClassified(error: any, context: string): never {
    const status = error?.response?.status;
    let classified;
    if (status === 400 || status === 403) {
      classified = {
        code: 'INVALID_API_KEY' as AIErrorCode,
        message: error?.response?.data?.error?.message || error?.message || '',
        friendly: 'API key Google AI tidak valid atau tidak memiliki akses. Periksa di aistudio.google.com/apikey.'
      };
    } else if (status === 404) {
      // Model retired or not yet available for this account (e.g. gemini-2.5-flash
      // "no longer available to new users"). Not a key problem — guide to Settings.
      classified = {
        code: 'UNKNOWN' as AIErrorCode,
        message: error?.response?.data?.error?.message || error?.message || '',
        friendly: 'Model Gemini yang dipilih tidak tersedia untuk akun/key ini. Pilih model lain di Settings (mis. gemini-3.6-flash).'
      };
    } else {
      classified = classifyAIError(error);
    }
    logger.error(`Google AI API error (${context}):`, error?.response?.data || error?.message);
    throw attachCode(error, classified);
  }

  async generateResponse(messages: AIMessage[], options: any = {}): Promise<AIResponse> {
    if (!this.isConfigured()) {
      const err = new Error('Google AI not configured. Please set API key.') as any;
      err.code = 'NO_API_KEY';
      throw err;
    }

    try {
      const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

      const body: Record<string, any> = {
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1000
        }
      };
      if (systemText) body.system_instruction = { parts: [{ text: systemText }] };

      const response = await axios.post(
        `${this.baseURL}/models/${this.model}:generateContent`,
        body,
        { headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' } }
      );

      const candidate = response.data?.candidates?.[0];
      const content = (candidate?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
      if (!content) {
        throw new Error('No response from AI model');
      }

      const usage = response.data?.usageMetadata;
      return {
        content,
        usage: usage ? {
          prompt_tokens: usage.promptTokenCount ?? 0,
          completion_tokens: usage.candidatesTokenCount ?? 0,
          total_tokens: usage.totalTokenCount ?? 0
        } : undefined,
        effectiveModel: this.model
      };
    } catch (error: any) {
      this.throwClassified(error, 'generateContent');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isConfigured()) {
      const err = new Error('Google AI not configured. Please set API key.') as any;
      err.code = 'NO_API_KEY';
      throw err;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/models/${this.embeddingModel}:embedContent`,
        { content: { parts: [{ text: text.slice(0, 8000) }] } },
        { headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' } }
      );

      const embedding = response.data?.embedding?.values;
      if (!embedding || embedding.length === 0) {
        throw new Error('No embedding generated');
      }
      return embedding;
    } catch (error: any) {
      this.throwClassified(error, 'embedContent');
    }
  }

  // Gemini catalog. Embedding-capable models are flagged via the same
  // architecture.modality metadata the ATLAS model filters already read.
  async listModels(apiKey?: string): Promise<OpenRouterModelInfo[]> {
    const key = apiKey || this.apiKey;
    const response = await axios.get(`${this.baseURL}/models`, {
      params: { pageSize: 1000 },
      headers: { 'x-goog-api-key': key },
      timeout: 20000
    });

    const models = (response.data?.models || []) as any[];
    return models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.length > 0)
      .map(m => {
        const id = String(m.name || '').replace(/^models\//, '');
        const isEmbedding = m.supportedGenerationMethods.includes('embedContent');
        return {
          id,
          name: m.displayName || id,
          description: m.description,
          context_length: m.inputTokenLimit ?? null,
          architecture: { modality: isEmbedding ? 'embedding' : 'text' }
        } as OpenRouterModelInfo;
      });
  }

  async validateApiKey(apiKey: string): Promise<void> {
    try {
      await axios.get(`${this.baseURL}/models`, {
        params: { pageSize: 1 },
        headers: { 'x-goog-api-key': apiKey },
        timeout: 20000
      });
    } catch (error: any) {
      this.throwClassified(error, 'validateApiKey');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model);
  }
}

export function createAIProvider(config: {
  provider: string;
  apiKey?: string;
  model: string;
  embeddingModel: string;
}): AIProvider {
  switch (config.provider) {
    case 'google':
    case 'google-ai':
    case 'gemini':
      if (!config.apiKey) {
        logger.warn('Google AI API key not provided, using mock provider');
        return new MockAIProvider();
      }
      return new GoogleAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        embeddingModel: config.embeddingModel
      });

    case 'openrouter':
      if (!config.apiKey) {
        logger.warn('OpenRouter API key not provided, using mock provider');
        return new MockAIProvider();
      }
      return new OpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
        embeddingModel: config.embeddingModel
      });
    
    case 'mock':
    default:
      return new MockAIProvider();
  }
}