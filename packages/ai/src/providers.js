import axios from 'axios';
import { createLogger } from '@atlas/core';
const logger = createLogger('AI_PROVIDER');
export class OpenRouterProvider {
    name = 'OpenRouter';
    apiKey;
    baseURL = 'https://openrouter.ai/api/v1';
    model;
    embeddingModel;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.embeddingModel = config.embeddingModel;
    }
    async generateResponse(messages, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('OpenRouter not configured. Please set API key.');
        }
        try {
            const response = await axios.post(`${this.baseURL}/chat/completions`, {
                model: this.model,
                messages,
                max_tokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'ATLAS Document Intelligence',
                }
            });
            const choice = response.data.choices?.[0];
            if (!choice) {
                throw new Error('No response from AI model');
            }
            return {
                content: choice.message.content,
                usage: response.data.usage
            };
        }
        catch (error) {
            logger.error('OpenRouter API error:', error.response?.data || error.message);
            throw new Error(`AI request failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    async generateEmbedding(text) {
        if (!this.isConfigured()) {
            throw new Error('OpenRouter not configured. Please set API key.');
        }
        try {
            const response = await axios.post(`${this.baseURL}/embeddings`, {
                model: this.embeddingModel,
                input: text,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            const embedding = response.data.data?.[0]?.embedding;
            if (!embedding) {
                throw new Error('No embedding generated');
            }
            return embedding;
        }
        catch (error) {
            logger.error('OpenRouter embedding error:', error.response?.data || error.message);
            throw new Error(`Embedding generation failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    isConfigured() {
        return Boolean(this.apiKey && this.model);
    }
}
export class MockAIProvider {
    name = 'Mock AI';
    async generateResponse(messages) {
        const userMessage = messages.find(m => m.role === 'user')?.content || '';
        // Simple mock responses based on content
        let response = '';
        if (userMessage.toLowerCase().includes('anggaran') || userMessage.toLowerCase().includes('biaya')) {
            response = 'Berdasarkan analisis dokumen, saya menemukan informasi terkait anggaran. Namun untuk memberikan jawaban yang akurat, silakan periksa dokumen sumber yang tercantum di bawah.';
        }
        else if (userMessage.toLowerCase().includes('bandingkan')) {
            response = 'Saya telah mengidentifikasi dokumen-dokumen yang relevan untuk perbandingan. Informasi detail dapat ditemukan dalam dokumen sumber.';
        }
        else {
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
    async generateEmbedding(text) {
        // Generate a mock embedding (random vector for testing)
        const dimension = 1536; // OpenAI embedding dimension
        const embedding = Array(dimension).fill(0).map(() => Math.random() - 0.5);
        return embedding;
    }
    isConfigured() {
        return true; // Mock provider is always "configured"
    }
}
export function createAIProvider(config) {
    switch (config.provider) {
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
