import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
export function generateId() {
    return crypto.randomUUID();
}
export function generateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}
export function sanitizePath(filePath) {
    return path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
}
export function isPathSafe(filePath, allowedPaths) {
    const normalizedPath = path.resolve(filePath);
    return allowedPaths.some(allowedPath => {
        const normalizedAllowed = path.resolve(allowedPath);
        return normalizedPath.startsWith(normalizedAllowed);
    });
}
export function validateFileExtension(filePath, allowedExtensions) {
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.includes(ext);
}
export async function getFileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return generateHash(buffer);
}
export function chunkText(text, chunkSize, overlap = 0) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end);
        if (chunk.trim().length > 0) {
            chunks.push(chunk.trim());
        }
        start = end - overlap;
        if (start >= text.length)
            break;
    }
    return chunks;
}
// Enhanced chunking that preserves semantic context
export function chunkTextSemantically(text, chunkSize, overlap = 0) {
    const chunks = [];
    // Split by paragraphs first to preserve document structure
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    let currentChunk = '';
    let chunkStartOffset = 0;
    let currentOffset = 0;
    let paragraphIndex = 0;
    let currentHeading = undefined;
    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        // Detect if this paragraph is likely a heading
        const isHeading = detectHeading(trimmedParagraph);
        if (isHeading) {
            currentHeading = trimmedParagraph;
        }
        // If adding this paragraph would exceed chunk size, finalize current chunk
        if (currentChunk.length > 0 && (currentChunk.length + trimmedParagraph.length) > chunkSize) {
            const chunkEndOffset = currentOffset;
            chunks.push({
                text: currentChunk.trim(),
                metadata: {
                    startOffset: chunkStartOffset,
                    endOffset: chunkEndOffset,
                    hasHeading: currentHeading !== undefined,
                    headingText: currentHeading,
                    sentenceCount: countSentences(currentChunk),
                    paragraphIndex
                }
            });
            // Start new chunk with overlap
            const overlapText = getOverlapText(currentChunk, overlap);
            currentChunk = overlapText;
            chunkStartOffset = Math.max(0, chunkEndOffset - overlapText.length);
        }
        // Add paragraph to current chunk
        if (currentChunk.length === 0) {
            chunkStartOffset = currentOffset;
        }
        currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmedParagraph;
        currentOffset += paragraph.length + 2; // +2 for paragraph separator
        paragraphIndex++;
    }
    // Add final chunk if it has content
    if (currentChunk.trim().length > 0) {
        chunks.push({
            text: currentChunk.trim(),
            metadata: {
                startOffset: chunkStartOffset,
                endOffset: currentOffset,
                hasHeading: currentHeading !== undefined,
                headingText: currentHeading,
                sentenceCount: countSentences(currentChunk),
                paragraphIndex
            }
        });
    }
    return chunks;
}
function detectHeading(text) {
    // Heuristics for detecting headings in Indonesian documents
    const headingPatterns = [
        /^[A-Z\s]+$/, // ALL CAPS
        /^[IVX]+\./, // Roman numerals
        /^\d+\./, // Numbered headings
        /^[A-Z][a-z]*\s*:$/, // Title case with colon
        /^BAB\s+[IVX]+/i, // Indonesian chapter headings
        /^BAGIAN\s+[IVX]+/i, // Indonesian section headings
        /^PASAL\s+\d+/i, // Indonesian article headings
    ];
    // Short lines that are likely headings
    if (text.length < 100 && text.length > 5) {
        for (const pattern of headingPatterns) {
            if (pattern.test(text)) {
                return true;
            }
        }
        // Check if it's mostly uppercase or title case
        const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
        if (uppercaseRatio > 0.6) {
            return true;
        }
    }
    return false;
}
function countSentences(text) {
    return (text.match(/[.!?]+/g) || []).length;
}
function getOverlapText(text, overlapChars) {
    if (overlapChars <= 0 || text.length <= overlapChars) {
        return '';
    }
    // Try to find a good sentence boundary for overlap
    const lastPart = text.slice(-overlapChars * 2);
    const sentences = lastPart.split(/[.!?]+/);
    if (sentences.length > 1) {
        // Return the last complete sentence(s) that fit in overlap
        const lastSentences = sentences.slice(-2).join('. ').trim();
        if (lastSentences.length <= overlapChars) {
            return lastSentences;
        }
    }
    // Fallback to character-based overlap
    return text.slice(-overlapChars);
}
export function extractSnippet(text, query, maxLength = 200) {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(queryLower);
    if (index === -1) {
        return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
    }
    const start = Math.max(0, index - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);
    let snippet = text.slice(start, end);
    if (start > 0)
        snippet = '...' + snippet;
    if (end < text.length)
        snippet = snippet + '...';
    return snippet;
}
export function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
export class AsyncQueue {
    queue = [];
    running = 0;
    maxConcurrent;
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
    }
    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.process();
        });
    }
    async process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        this.running++;
        const task = this.queue.shift();
        try {
            await task();
        }
        finally {
            this.running--;
            this.process();
        }
    }
}
export function createLogger(prefix) {
    return {
        info: (message, ...args) => console.log(`[${prefix}] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[${prefix}] ${message}`, ...args),
        error: (message, ...args) => console.error(`[${prefix}] ${message}`, ...args),
        debug: (message, ...args) => process.env.NODE_ENV === 'development' && console.log(`[${prefix}] ${message}`, ...args)
    };
}
