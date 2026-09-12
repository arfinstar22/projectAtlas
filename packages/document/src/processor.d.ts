import { DocumentMetadata } from '@atlas/core';
export interface ProcessedDocument {
    text: string;
    metadata: DocumentMetadata;
}
export interface ProcessingOptions {
    enableOCR: boolean;
    maxFileSize: number;
    ocrLanguages?: string[];
}
export declare class DocumentProcessor {
    private options;
    constructor(options: ProcessingOptions);
    processDocument(filePath: string): Promise<ProcessedDocument>;
    private processPDF;
    private processDOCX;
    private processTXT;
    private processMarkdown;
    private processCSV;
    private processExcel;
    private processImage;
    private performOCR;
    private detectLanguage;
    static getSupportedExtensions(): string[];
    static isSupported(filePath: string): boolean;
}
export declare function createDocumentProcessor(options: ProcessingOptions): DocumentProcessor;
