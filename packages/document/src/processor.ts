import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { parse as csvParse } from 'csv-parse/sync';
import { marked } from 'marked';
import * as XLSX from 'xlsx';
import mime from 'mime-types';
import { Document, DocumentMetadata, createLogger } from '@atlas/core';

const logger = createLogger('DOCUMENT_PROCESSOR');

export interface ProcessedDocument {
  text: string;
  metadata: DocumentMetadata;
}

export interface ProcessingOptions {
  enableOCR: boolean;
  maxFileSize: number;
  ocrLanguages?: string[];
}

export class DocumentProcessor {
  private options: ProcessingOptions;

  constructor(options: ProcessingOptions) {
    this.options = options;
  }

  async processDocument(filePath: string): Promise<ProcessedDocument> {
    const stats = await fs.stat(filePath);
    
    if (stats.size > this.options.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes`);
    }

    const extension = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    logger.debug(`Processing ${filePath} (${extension})`);

    try {
      switch (extension) {
        case '.pdf':
          return await this.processPDF(filePath);
        case '.docx':
          return await this.processDOCX(filePath);
        case '.txt':
          return await this.processTXT(filePath);
        case '.md':
        case '.markdown':
          return await this.processMarkdown(filePath);
        case '.csv':
          return await this.processCSV(filePath);
        case '.xlsx':
        case '.xls':
          return await this.processExcel(filePath);
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.webp':
          return await this.processImage(filePath);
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
      throw error;
    }
  }

  private async processPDF(filePath: string): Promise<ProcessedDocument> {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);

    const metadata: DocumentMetadata = {
      pageCount: data.numpages,
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      keywords: data.info?.Keywords ? [data.info.Keywords] : undefined
    };

    let text = data.text;

    // If text extraction yields very little content, try OCR
    if (this.options.enableOCR && text.trim().length < 100) {
      logger.info(`PDF has minimal text, attempting OCR: ${filePath}`);
      try {
        text = await this.performOCR(filePath);
      } catch (ocrError) {
        logger.warn(`OCR failed for ${filePath}:`, ocrError);
        // Fall back to original extracted text
      }
    }

    return { text, metadata };
  }

  private async processDOCX(filePath: string): Promise<ProcessedDocument> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });

    const metadata: DocumentMetadata = {
      // DOCX metadata would need additional parsing
      // This is a simplified version
    };

    return { text: result.value, metadata };
  }

  private async processTXT(filePath: string): Promise<ProcessedDocument> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    const metadata: DocumentMetadata = {
      language: this.detectLanguage(content)
    };

    return { text: content, metadata };
  }

  private async processMarkdown(filePath: string): Promise<ProcessedDocument> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Extract plain text from markdown
    const text = marked.parse(content, { renderer: new marked.Renderer() })
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .trim();

    const metadata: DocumentMetadata = {
      language: this.detectLanguage(content)
    };

    return { text, metadata };
  }

  private async processCSV(filePath: string): Promise<ProcessedDocument> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    try {
      const records = csvParse(content, {
        columns: true,
        skip_empty_lines: true
      });

      // Convert CSV data to searchable text
      const headers = Object.keys(records[0] || {});
      const text = records.map((record: Record<string, string>) => 
        headers.map(header => `${header}: ${record[header]}`).join(' | ')
      ).join('\n');

      const metadata: DocumentMetadata = {
        // Could include row count, column info, etc.
      };

      return { text, metadata };
    } catch (error) {
      logger.warn(`Failed to parse CSV ${filePath}, treating as plain text`);
      return this.processTXT(filePath);
    }
  }

  private async processExcel(filePath: string): Promise<ProcessedDocument> {
    const workbook = XLSX.readFile(filePath);
    const sheets = workbook.SheetNames;
    
    let allText = '';
    const metadata: DocumentMetadata = {
      sheetCount: sheets.length
    };

    for (const sheetName of sheets) {
      const worksheet = workbook.Sheets[sheetName];
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      
      if (csvContent.trim()) {
        allText += `Sheet: ${sheetName}\n${csvContent}\n\n`;
      }
    }

    return { text: allText, metadata };
  }

  private async processImage(filePath: string): Promise<ProcessedDocument> {
    // For MVP, we'll return basic image info without complex OCR
    // This keeps the application functional without heavy native dependencies
    
    const metadata: DocumentMetadata = {
      // Basic image metadata - can be expanded later
    };

    const fileName = path.basename(filePath);
    const text = `Image file: ${fileName}. OCR processing not available in current version.`;
    
    logger.info(`Processed image file: ${filePath}`);
    return { text, metadata };
  }

  private async performOCR(filePath: string): Promise<string> {
    // For MVP, OCR is not implemented to avoid complex dependencies
    // This can be added as an optional feature later with proper setup
    logger.info(`OCR not yet implemented for ${filePath}`);
    const fileName = path.basename(filePath);
    return `OCR processing not available in current version for: ${fileName}`;
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on common words
    const indonesianWords = ['dan', 'atau', 'dengan', 'untuk', 'dari', 'pada', 'dalam', 'yang', 'ini', 'itu'];
    const englishWords = ['the', 'and', 'or', 'with', 'for', 'from', 'in', 'this', 'that'];
    
    const words = text.toLowerCase().split(/\s+/).slice(0, 100); // Sample first 100 words
    
    const indonesianMatches = words.filter(word => indonesianWords.includes(word)).length;
    const englishMatches = words.filter(word => englishWords.includes(word)).length;
    
    if (indonesianMatches > englishMatches) {
      return 'id'; // Indonesian
    } else if (englishMatches > 0) {
      return 'en'; // English
    }
    
    return 'unknown';
  }

  static getSupportedExtensions(): string[] {
    return ['.pdf', '.docx', '.txt', '.md', '.markdown', '.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.webp'];
  }

  static isSupported(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase();
    return this.getSupportedExtensions().includes(extension);
  }
}

export function createDocumentProcessor(options: ProcessingOptions): DocumentProcessor {
  return new DocumentProcessor(options);
}