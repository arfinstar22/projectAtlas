export declare function generateId(): string;
export declare function generateHash(content: Buffer | string): string;
export declare function sanitizePath(filePath: string): string;
export declare function isPathSafe(filePath: string, allowedPaths: string[]): boolean;
export declare function validateFileExtension(filePath: string, allowedExtensions: string[]): boolean;
export declare function getFileHash(filePath: string): Promise<string>;
export declare function chunkText(text: string, chunkSize: number, overlap?: number): string[];
export declare function chunkTextSemantically(text: string, chunkSize: number, overlap?: number): Array<{
    text: string;
    metadata: {
        startOffset: number;
        endOffset: number;
        hasHeading: boolean;
        headingText?: string;
        sentenceCount: number;
        paragraphIndex?: number;
    };
}>;
export declare function extractSnippet(text: string, query: string, maxLength?: number): string;
export declare function formatFileSize(bytes: number): string;
export declare function sleep(ms: number): Promise<void>;
export declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
export declare class AsyncQueue {
    private queue;
    private running;
    private maxConcurrent;
    constructor(maxConcurrent?: number);
    add<T>(task: () => Promise<T>): Promise<T>;
    private process;
}
export declare function createLogger(prefix: string): {
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
    debug: (message: string, ...args: any[]) => false | void;
};
