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
}
export interface AIProvider {
    name: string;
    generateResponse(messages: AIMessage[], options?: any): Promise<AIResponse>;
    generateEmbedding(text: string): Promise<number[]>;
    isConfigured(): boolean;
}
export declare class OpenRouterProvider implements AIProvider {
    name: string;
    private apiKey;
    private baseURL;
    private model;
    private embeddingModel;
    constructor(config: {
        apiKey: string;
        model: string;
        embeddingModel: string;
    });
    generateResponse(messages: AIMessage[], options?: any): Promise<AIResponse>;
    generateEmbedding(text: string): Promise<number[]>;
    isConfigured(): boolean;
}
export declare class MockAIProvider implements AIProvider {
    name: string;
    generateResponse(messages: AIMessage[]): Promise<AIResponse>;
    generateEmbedding(text: string): Promise<number[]>;
    isConfigured(): boolean;
}
export declare function createAIProvider(config: {
    provider: string;
    apiKey?: string;
    model: string;
    embeddingModel: string;
}): AIProvider;
