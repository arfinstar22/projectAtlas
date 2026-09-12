import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import axios from 'axios';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fsSync from 'fs';
import { execFile } from 'child_process';
import {
  QueryIntent,
  SessionContextManager,
  detectQueryIntent,
  expandQueryConcepts,
  identifyTargetDocumentReferences,
  isFollowUpQuestion,
  calculateDocumentAwareRelevance,
  buildDocumentContext,
  buildGroundedPrompts,
  extractCoreQueryTerms,
  selectContextChunks
} from './rag-pipeline.js';
import {
  enhancedQueryAnalysis,
  enhancedTwoStageRetrieval
} from './document-intelligence.js';
import {
  InformationStatus,
  analyzeInformationStatus,
  generateIntelligentResponse,
  synthesizeLocalDocumentResponse
} from './intelligent-response.js';
import { parseQuerySemantics } from './query-understanding.js';
import { verifyEvidenceCandidates } from './evidence-verification.js';
import { performDocumentReasoning } from './reasoning-engine.js';
import { generateProfessorResponse } from './response-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// Explicitly load .env from all standard candidate locations before any code runs
const candidateEnvPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.env.HOME || '', '.env')
];

let envLoadedFrom = null;
for (const envPath of candidateEnvPaths) {
  try {
    if (fsSync.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      envLoadedFrom = envPath;
      break;
    }
  } catch (_) {}
}
if (!envLoadedFrom) {
  dotenv.config();
}

function getOpenRouterApiKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    process.env.OPEN_ROUTER_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
}

function getAiModel() {
  return (
    process.env.AI_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'openai/gpt-4o-mini'
  ).trim();
}

function persistEnvVariable(key, value) {
  try {
    const envFile = path.resolve(__dirname, '../.env');
    let content = '';
    if (fsSync.existsSync(envFile)) {
      content = fsSync.readFileSync(envFile, 'utf-8');
    }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += (content && !content.endsWith('\n') ? '\n' : '') + `${key}=${value}\n`;
    }
    fsSync.writeFileSync(envFile, content, 'utf-8');
  } catch (err) {
    console.warn('Could not persist to .env:', err.message);
  }
}

// Indonesian stop words for query normalization
const INDONESIAN_STOP_WORDS = new Set([
  'apa', 'siapa', 'mana', 'di', 'ke', 'dari', 'pada', 'untuk', 'dengan', 'ada',
  'adalah', 'yaitu', 'yakni', 'tentang', 'mengenai', 'sebuah', 'suatu', 'para',
  'sang', 'si', 'saya', 'aku', 'kamu', 'anda', 'dia', 'mereka', 'kita', 'kami',
  'ini', 'itu', 'yang', 'dan', 'atau', 'tapi', 'tetapi', 'karena', 'sebab',
  'jika', 'kalau', 'bila', 'apabila', 'agar', 'supaya', 'seperti', 'bagai',
  'bisa', 'dapat', 'tolong', 'coba', 'mohon', 'bagaimana', 'kenapa', 'mengapa',
  'kapan', 'berapa', 'apakah', 'adakah', 'bisakah', 'jelaskan', 'sebutkan',
  'berikan', 'tahu', 'ketahui', 'maksud', 'arti', 'maksudnya', 'artinya',
  'pun', 'juga', 'hanya', 'saja', 'lagi', 'masih', 'sudah', 'telah', 'sedang',
  'akan', 'hendak', 'mau', 'boleh', 'paling', 'sangat', 'terlalu', 'lebih',
  'dalam', 'luar', 'atas', 'bawah', 'depan', 'belakang', 'antara',
  'bandingkan', 'perbandingan', 'banding', 'bedanya'
]);

function normalizeIndonesianStem(word) {
  if (!word || word.length <= 4) return null; // Precision over recall: do not stem short words (e.g. 'visi' stays 'visi')
  let w = word.toLowerCase();
  let base = null;
  if (w.startsWith('meng') && w.length > 7) base = w.slice(4);
  else if (w.startsWith('meny') && w.length > 7) base = 's' + w.slice(4);
  else if (w.startsWith('mem') && w.length > 6) base = w.slice(3);
  else if (w.startsWith('men') && w.length > 6) base = w.slice(3);
  else if (w.startsWith('di') && w.length > 5) base = w.slice(2);
  else if (w.startsWith('ter') && w.length > 6) base = w.slice(3);
  else if (w.startsWith('ber') && w.length > 6) base = w.slice(3);
  else if (w.startsWith('be') && w.length > 5 && (w.startsWith('beker') || w.startsWith('beren'))) base = w.slice(2);
  else if (w.startsWith('pe') && w.length > 5) base = w.slice(2);

  if (base && base.length >= 4) return base;
  return null;
}

// Use extractCoreQueryTerms from document-intelligence.js to avoid duplication

function isWordInText(word, text) {
  if (!word || !text) return false;
  const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Match as a standalone whole token bounded by non-alphanumeric characters or string ends
  const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i');
  return regex.test(text);
}

function checkTermInText(termObj, textTokens, textCombined) {
  if (!termObj || !textCombined) return { matched: false };
  // 1. Highest Priority: exact raw token match as standalone word
  if (isWordInText(termObj.raw, textCombined)) {
    return { matched: true, isExact: true };
  }

  // 2. Secondary signal: root stem match across word tokens
  if (termObj.stem && textTokens && textTokens.length > 0) {
    for (const token of textTokens) {
      if (token.length >= 4) {
        const tokenStem = normalizeIndonesianStem(token);
        if (tokenStem && tokenStem === termObj.stem) {
          return { matched: true, isExact: false, stem: termObj.stem };
        }
        if (token === termObj.stem) {
          return { matched: true, isExact: false, stem: termObj.stem };
        }
      }
    }
  }

  return { matched: false };
}

function scoreChunkRelevance(chunk, coreTerms, fullQuestion) {
  const chunkText = chunk.text || '';
  const docName = chunk.document_name || '';
  const section = chunk.section || '';
  const combined = `${chunkText} ${docName} ${section}`;
  const textTokens = combined.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let exactRawMatches = 0;
  let stemMatches = 0;
  const matchedTerms = [];

  for (const t of coreTerms) {
    const res = checkTermInText(t, textTokens, combined);
    if (res.matched) {
      if (res.isExact) {
        exactRawMatches++;
        matchedTerms.push(t.raw);
      } else {
        stemMatches++;
        matchedTerms.push(res.stem + '~');
      }
    }
  }

  const totalMatched = exactRawMatches + stemMatches;
  const totalTerms = coreTerms.length;
  const coverageRatio = totalTerms > 0 ? totalMatched / totalTerms : 0;

  // Base score: exact raw match carries high weight, stem carries minor weight
  let score = exactRawMatches * 10 + stemMatches * 3;

  // Document name bonus
  for (const t of coreTerms) {
    if (isWordInText(t.raw, docName)) score += 8;
  }

  // Section title bonus
  for (const t of coreTerms) {
    if (isWordInText(t.raw, section)) score += 6;
  }

  // Exact phrase match bonus
  const cleanPhrase = coreTerms.map(t => t.raw).join(' ');
  if (coreTerms.length > 1 && isWordInText(cleanPhrase, combined)) {
    score += 25;
  }

  // Strict relevance threshold check:
  // 1 term: MUST have exactRawMatches >= 1
  // 2 terms: coverageRatio MUST be 1.0 (both terms present) AND exactRawMatches >= 1
  // 3+ terms: coverageRatio >= 0.6 AND exactRawMatches >= 2
  let isRelevant = false;
  if (totalTerms === 1 && exactRawMatches >= 1) {
    isRelevant = true;
  } else if (totalTerms === 2 && coverageRatio === 1.0 && exactRawMatches >= 1) {
    isRelevant = true;
  } else if (totalTerms >= 3 && coverageRatio >= 0.6 && exactRawMatches >= 2) {
    isRelevant = true;
  }

  return {
    score,
    isRelevant,
    exactRawMatches,
    stemMatches,
    matchedTerms,
    coverageRatio
  };
}

function detectSectionHeading(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 3)) {
    // Enhanced section detection for Indonesian documents
    const headingMatch = line.match(/^(?:#+\s*|Bab\s+[0-9IVX]+|Bagian\s+[0-9IVX]+|[0-9]+\.\s+|[0-9]+\.[0-9]+\s+|BAB\s+[0-9IVX]+|BAGIAN\s+[0-9IVX]+)?([^\n:]{3,60})/i);
    if (headingMatch && headingMatch[1]) {
      const h = headingMatch[1].replace(/^[#\*\-\s]+/, '').trim();
      if (h.length >= 3 && h.length <= 60) return h;
    }
  }
  
  // Detect common Indonesian document sections
  const commonSections = [
    /^(abstrak|abstract|ringkasan|executive summary)/i,
    /^(pendahuluan|latar belakang|background)/i,
    /^(tujuan|objective|sasaran|target)/i,
    /^(metodologi|metode|method|approach)/i,
    /^(hasil|result|findings|temuan)/i,
    /^(pembahasan|discussion|analisis)/i,
    /^(kesimpulan|conclusion|simpulan)/i,
    /^(rekomendasi|saran|recommendation)/i,
    /^(daftar pustaka|referensi|bibliography)/i
  ];
  
  for (const line of lines.slice(0, 5)) {
    for (const pattern of commonSections) {
      if (pattern.test(line)) {
        return line.substring(0, 50);
      }
    }
  }
  
  return '';
}

function extractDocumentMetadata(text, filename) {
  const metadata = {
    title: '',
    author: '',
    type: '',
    sections: [],
    keywords: [],
    entities: {
      persons: [],
      organizations: [],
      locations: [],
      dates: [],
      numbers: []
    }
  };
  
  const lines = text.split('\n').slice(0, 50).map(l => l.trim()).filter(Boolean);
  
  // Extract title (usually first substantial line)
  for (const line of lines) {
    if (line.length > 10 && line.length < 200 && !line.toLowerCase().includes('halaman')) {
      metadata.title = line;
      break;
    }
  }
  
  // Extract author patterns
  const authorPatterns = [
    /(?:oleh|by|penulis|author|disusun oleh)[\s:]+([^\n]{5,50})/i,
    /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/m,
    /NIM[\s:]+\d+/i
  ];
  
  for (const pattern of authorPatterns) {
    const match = text.match(pattern);
    if (match) {
      metadata.author = match[1] || match[0];
      break;
    }
  }
  
  // Detect document type from filename and content
  const lowerText = text.toLowerCase();
  if (filename.includes('skripsi') || lowerText.includes('tugas akhir') || lowerText.includes('thesis')) {
    metadata.type = 'thesis';
  } else if (filename.includes('laporan') || lowerText.includes('laporan')) {
    metadata.type = 'report';
  } else if (filename.includes('panduan') || lowerText.includes('panduan') || lowerText.includes('manual')) {
    metadata.type = 'guide';
  } else if (filename.includes('visi') || lowerText.includes('visi') || lowerText.includes('misi')) {
    metadata.type = 'vision';
  } else {
    metadata.type = 'document';
  }
  
  // Extract key entities
  // Numbers and amounts
  const numberMatches = text.match(/(?:rp\s*)?[\d.,]+(?:%|\s*juta|\s*ribu|\s*miliar)?/gi);
  if (numberMatches) {
    metadata.entities.numbers = [...new Set(numberMatches.slice(0, 20))];
  }
  
  // Dates
  const dateMatches = text.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\b(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+\d{4}/gi);
  if (dateMatches) {
    metadata.entities.dates = [...new Set(dateMatches.slice(0, 10))];
  }
  
  return metadata;
}

function chunkDocumentText(text, chunkSize = 900, chunkOverlap = 150) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  // Extract document structure first
  const documentStructure = analyzeDocumentStructure(clean);
  
  if (clean.length <= chunkSize) {
    const metadata = extractChunkMetadata(clean, 0, clean.length, documentStructure);
    return [{
      chunkIndex: 0,
      text: clean,
      startChar: 0,
      endChar: clean.length,
      section: metadata.section,
      subsection: metadata.subsection,
      chunkType: metadata.chunkType,
      contextualInfo: metadata.contextualInfo,
      entities: metadata.entities
    }];
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < clean.length) {
    let end = start + chunkSize;
    if (end >= clean.length) {
      end = clean.length;
    } else {
      // Intelligent boundary detection for better semantic chunks
      const slice = clean.slice(start, end);
      
      // Priority 1: Look for section breaks (highest priority)
      const sectionBreak = findSectionBreak(slice);
      if (sectionBreak > chunkSize * 0.3) {
        end = start + sectionBreak;
      }
      // Priority 2: Look for paragraph breaks
      else {
        const lastDoubleNewline = slice.lastIndexOf('\n\n');
        const lastNewline = slice.lastIndexOf('\n');
        const lastPeriod = slice.lastIndexOf('. ');
        const lastSentenceEnd = Math.max(
          slice.lastIndexOf('.\n'),
          slice.lastIndexOf('!\n'), 
          slice.lastIndexOf('?\n')
        );

        if (lastDoubleNewline > chunkSize * 0.5) {
          end = start + lastDoubleNewline + 2;
        } else if (lastSentenceEnd > chunkSize * 0.6) {
          end = start + lastSentenceEnd + 2;
        } else if (lastPeriod > chunkSize * 0.5) {
          end = start + lastPeriod + 2;
        } else if (lastNewline > chunkSize * 0.5) {
          end = start + lastNewline + 1;
        }
      }
    }

    const chunkText = clean.slice(start, end).trim();
    if (chunkText.length > 0) {
      const metadata = extractChunkMetadata(chunkText, start, end, documentStructure);
      
      chunks.push({
        chunkIndex,
        text: chunkText,
        startChar: start,
        endChar: end,
        section: metadata.section,
        subsection: metadata.subsection,
        chunkType: metadata.chunkType,
        contextualInfo: metadata.contextualInfo,
        entities: metadata.entities,
        // Add contextual prefix for better LLM understanding
        contextualText: buildContextualChunkText(chunkText, metadata)
      });
      chunkIndex++;
    }

    if (end >= clean.length) break;
    start = Math.max(start + 1, end - chunkOverlap);
  }

  return chunks;
}

function analyzeDocumentStructure(text) {
  const structure = {
    sections: [],
    documentType: 'unknown',
    hasNumberedSections: false,
    hasTableOfContents: false
  };
  
  const lines = text.split('\n');
  let currentSection = null;
  
  // Detect document sections
  for (let i = 0; i < lines.length && i < 200; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Match section patterns
    const sectionPatterns = [
      /^(BAB\s+[IVX0-9]+|Bab\s+[IVX0-9]+)\s*[:\-]?\s*(.+)/i,
      /^([0-9]+\.[0-9]*)\s+(.+)/,
      /^(ABSTRAK|ABSTRACT|PENDAHULUAN|LATAR BELAKANG|TUJUAN|METODOLOGI|HASIL|PEMBAHASAN|KESIMPULAN|DAFTAR PUSTAKA)/i,
      /^#{1,3}\s*(.+)/
    ];
    
    for (const pattern of sectionPatterns) {
      const match = line.match(pattern);
      if (match) {
        const sectionTitle = match[2] || match[1];
        structure.sections.push({
          title: sectionTitle.trim(),
          startLine: i,
          level: determineSectionLevel(line)
        });
        
        if (/^[0-9]+\./.test(line)) {
          structure.hasNumberedSections = true;
        }
        break;
      }
    }
  }
  
  // Detect document type
  const textLower = text.toLowerCase();
  if (textLower.includes('skripsi') || textLower.includes('thesis') || textLower.includes('tugas akhir')) {
    structure.documentType = 'thesis';
  } else if (textLower.includes('laporan') || textLower.includes('report')) {
    structure.documentType = 'report';
  } else if (textLower.includes('panduan') || textLower.includes('manual')) {
    structure.documentType = 'guide';
  } else if (textLower.includes('proposal')) {
    structure.documentType = 'proposal';
  }
  
  return structure;
}

function findSectionBreak(text) {
  const sectionBreakPatterns = [
    /\n\n(BAB\s+[IVX0-9]+|Bab\s+[IVX0-9]+)/i,
    /\n\n([0-9]+\.[0-9]*\s+[A-Z])/,
    /\n\n(ABSTRAK|ABSTRACT|PENDAHULUAN|LATAR BELAKANG|TUJUAN|METODOLOGI|HASIL|PEMBAHASAN|KESIMPULAN)/i
  ];
  
  for (const pattern of sectionBreakPatterns) {
    const match = text.match(pattern);
    if (match && match.index) {
      return match.index + 2; // Include the double newline
    }
  }
  return -1;
}

function extractChunkMetadata(chunkText, startChar, endChar, documentStructure) {
  const metadata = {
    section: '',
    subsection: '',
    chunkType: 'content',
    contextualInfo: {},
    entities: {
      numbers: [],
      dates: [],
      persons: [],
      concepts: []
    }
  };
  
  // Determine section context from document structure
  const relevantSection = documentStructure.sections.find(s => 
    s.startLine * 50 <= startChar // Rough line-to-char conversion
  );
  
  if (relevantSection) {
    metadata.section = relevantSection.title;
  } else {
    metadata.section = detectSectionHeading(chunkText);
  }
  
  // Determine chunk type
  if (chunkText.toLowerCase().includes('abstrak') || chunkText.toLowerCase().includes('ringkasan')) {
    metadata.chunkType = 'abstract';
  } else if (chunkText.toLowerCase().includes('kesimpulan') || chunkText.toLowerCase().includes('conclusion')) {
    metadata.chunkType = 'conclusion';
  } else if (chunkText.toLowerCase().includes('metodologi') || chunkText.toLowerCase().includes('metode')) {
    metadata.chunkType = 'methodology';
  } else if (chunkText.toLowerCase().includes('hasil') || chunkText.toLowerCase().includes('result')) {
    metadata.chunkType = 'results';
  } else if (chunkText.toLowerCase().includes('tujuan') || chunkText.toLowerCase().includes('objective')) {
    metadata.chunkType = 'objective';
  }
  
  // Extract entities for better context
  // Numbers and measurements
  const numberMatches = chunkText.match(/(?:rp\s*)?[\d.,]+(?:%|\s*juta|\s*ribu|\s*miliar|\s*gram|\s*kg|\s*meter|\s*cm)?/gi);
  if (numberMatches) {
    metadata.entities.numbers = numberMatches.slice(0, 10);
  }
  
  // Key concepts for this chunk
  const conceptPatterns = [
    /\b(resnet|cnn|deep learning|machine learning|artificial intelligence|ai)\b/gi,
    /\b(metodologi|eksperimental|kualitatif|kuantitatif|survei|wawancara)\b/gi,
    /\b(akurasi|presisi|recall|f1-score|confusion matrix|validasi)\b/gi,
    /\b(pegawai|karyawan|staf|personel|tenaga kerja)\b/gi,
    /\b(anggaran|biaya|dana|investasi|pengeluaran)\b/gi
  ];
  
  const concepts = [];
  for (const pattern of conceptPatterns) {
    const matches = chunkText.match(pattern);
    if (matches) {
      concepts.push(...matches.map(m => m.toLowerCase()));
    }
  }
  metadata.entities.concepts = [...new Set(concepts)];
  
  return metadata;
}

function buildContextualChunkText(chunkText, metadata) {
  let contextPrefix = '';
  
  if (metadata.section) {
    contextPrefix += `[Bagian: ${metadata.section}] `;
  }
  
  if (metadata.chunkType && metadata.chunkType !== 'content') {
    contextPrefix += `[Jenis: ${metadata.chunkType}] `;
  }
  
  if (metadata.entities.concepts.length > 0) {
    contextPrefix += `[Konsep: ${metadata.entities.concepts.slice(0, 3).join(', ')}] `;
  }
  
  return contextPrefix + chunkText;
}

function determineSectionLevel(line) {
  if (line.match(/^BAB\s+[IVX0-9]+/i)) return 1;
  if (line.match(/^[0-9]+\.\s/)) return 2;
  if (line.match(/^[0-9]+\.[0-9]+\s/)) return 3;
  if (line.match(/^#{1,3}\s/)) return line.match(/^#+/)[0].length;
  return 1;
}

function calculateEnhancedDocumentIntelligence(chunk, queryAnalysis) {
  let score = 0;
  const { originalQuery, intent, queryType, entityReferences, requiresCalculation } = queryAnalysis;
  
  // Base semantic relevance
  const text = chunk.text || '';
  const section = chunk.section || '';
  const contextualText = chunk.contextual_text || text;
  
  // Direct term matching with enhanced weight
  const queryTerms = originalQuery.toLowerCase().split(/\s+/);
  for (const term of queryTerms) {
    if (term.length > 2) {
      if (contextualText.toLowerCase().includes(term)) score += 15;
      if (section.toLowerCase().includes(term)) score += 10;
    }
  }
  
  // Document Intelligence bonuses
  
  // 1. Chunk Type Intelligence
  if (chunk.chunk_type) {
    if (queryType === 'OVERVIEW' && chunk.chunk_type === 'abstract') score += 25;
    if (intent === QueryIntent.METHODOLOGY && chunk.chunk_type === 'methodology') score += 30;
    if (intent === QueryIntent.SUMMARY && chunk.chunk_type === 'conclusion') score += 25;
    if (queryType === 'QUANTITATIVE' && chunk.chunk_type === 'results') score += 20;
  }
  
  // 2. Section Intelligence
  const sectionLower = section.toLowerCase();
  if (intent === QueryIntent.METHODOLOGY && /metodologi|metode|approach|prosedur/.test(sectionLower)) score += 20;
  if (intent === QueryIntent.SUMMARY && /kesimpulan|conclusion|hasil|result/.test(sectionLower)) score += 20;
  if (queryType === 'CAUSAL' && /pembahasan|diskusi|analisis|analysis/.test(sectionLower)) score += 15;
  
  // 3. Entity Intelligence
  if (chunk.entities_json) {
    try {
      const entities = JSON.parse(chunk.entities_json);
      
      // Number/calculation intelligence
      if (requiresCalculation && entities.numbers && entities.numbers.length > 0) {
        score += 25;
      }
      
      // Concept alignment
      if (entities.concepts && entityReferences.concepts) {
        const overlap = entities.concepts.filter(c => entityReferences.concepts.includes(c));
        score += overlap.length * 8;
      }
    } catch (_) {}
  }
  
  // 4. Positional Intelligence
  if (queryType === 'OVERVIEW') {
    if (chunk.chunk_index === 0) score += 15; // Introduction bonus
    if (chunk.chunk_index < 3) score += 5; // Early content bonus
  }
  
  // 5. Content Quality Intelligence
  if (contextualText.length > text.length) {
    score += 10; // Enhanced contextual information bonus
  }
  
  // 6. Numerical Intelligence for quantitative queries
  if (queryType === 'QUANTITATIVE') {
    const numberMatches = text.match(/\d+[.,]?\d*\s*(?:%|persen|juta|ribu|miliar|rp)/gi);
    if (numberMatches && numberMatches.length > 0) score += 20;
  }
  
  return score;
}

// Robust FTS5 query sanitizer to prevent SQLite syntax errors
function sanitizeFtsQuery(rawQuery, operator = 'AND') {
  if (!rawQuery || typeof rawQuery !== 'string') return '';
  // Remove special FTS characters that break SQLite FTS syntax
  const clean = rawQuery.replace(/[\*"\^\{\}\(\)\[\]\~\:\+\-\?\<\>]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(w => {
    const upper = w.toUpperCase();
    return w.length > 0 && upper !== 'AND' && upper !== 'OR' && upper !== 'NOT';
  });
  if (words.length === 0) return '';
  // Wrap words in quotes with prefix match
  return words.map(w => `"${w.replace(/"/g, '""')}"*`).join(` ${operator} `);
}

/**
 * Generates a smart snippet that includes key numeric evidence when present.
 * Ensures that percentages, currency values, and other important numbers
 * are included in the snippet for citation verification.
 */
function generateSmartSnippet(text, maxLength = 250) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  
  // Check for numeric patterns - prioritize percentages for citation
  const percentPatterns = text.match(/\d+[\.,]?\d*\s*%/g) || [];
  const currencyPatterns = text.match(/Rp\s*[\d.,]+/g) || [];
  const otherNumPatterns = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d{2})?/g) || [];
  
  // Prefer percentages (most common for citation verification)
  // Use the LAST percentage if available (conclusions/results typically come later)
  const allPatterns = [...percentPatterns, ...currencyPatterns, ...otherNumPatterns];
  
  if (allPatterns.length > 0) {
    // For percentages, use the LAST one (more likely to be in conclusions)
    // For other patterns, use the first one
    const targetPattern = percentPatterns.length > 0 
      ? percentPatterns[percentPatterns.length - 1] 
      : allPatterns[0];
    const targetPos = text.lastIndexOf(targetPattern);
    
    // If the target pattern is within the first 60% of maxLength, use standard truncation
    if (targetPos <= maxLength * 0.6) {
      return text.slice(0, maxLength).trim() + (text.length > maxLength ? '...' : '');
    }
    
    // Otherwise, create a snippet that includes the numeric evidence
    // Start from a reasonable point before the number
    const startPos = Math.max(0, targetPos - 100);
    const endPos = Math.min(text.length, targetPos + 150);
    const snippet = text.slice(startPos, endPos).trim();
    return (startPos > 0 ? '...' : '') + snippet + (endPos < text.length ? '...' : '');
  }
  
  // No numeric patterns, use standard truncation
  return text.slice(0, maxLength).trim() + (text.length > maxLength ? '...' : '');
}

class SimpleATLAS {
  constructor() {
    this.app = Fastify({ logger: false });
    this.db = null;
    this.allowedFolders = new Set();
    this.watchers = new Map();
    this.sessionManager = new SessionContextManager();
    this.indexingState = {
      isIndexing: false,
      currentFile: '',
      total: 0,
      processed: 0,
      failed: 0,
      errors: [],
      lastCompletedAt: null
    };
  }

  async start() {
    // Initialize database
    await this.initDB();

    // Setup CORS
    await this.app.register(cors, {
      origin: true,
      credentials: true
    });

    // Setup static file serving from public directory
    await this.app.register(fastifyStatic, {
      root: PUBLIC_DIR,
      prefix: '/',
      decorateReply: false
    });

    // Setup routes
    this.setupRoutes();

    // Start watchers for existing folders
    await this.initWatchers();

    // Start server with port fallback handling
    const preferredPort = parseInt(process.env.PORT) || 3001;
    let port = preferredPort;
    let started = false;

    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        await this.app.listen({ port, host: '0.0.0.0' });
        console.log(`\n==================================================`);
        console.log(`🚀 ATLAS Document Intelligence Running!`);
        console.log(`📍 URL: http://localhost:${port}`);
        console.log(`✅ SQLite Database Initialized`);
        console.log(`📁 Local Filesystem Protected (Allowlist Active)`);
        console.log(`🔑 OpenRouter: ${getOpenRouterApiKey() ? 'Configured' : 'Not configured'}`);
        console.log(`==================================================\n`);
        started = true;
        break;
      } catch (err) {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${port} is in use, trying port ${port + 1}...`);
          port++;
        } else {
          console.error('Failed to start ATLAS:', err);
          process.exit(1);
        }
      }
    }

    if (!started) {
      console.error(`❌ Could not bind to any available port starting from ${preferredPort}`);
      process.exit(1);
    }
  }

  async initDB() {
    const dbPath = path.resolve(__dirname, '../atlas.db');
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec('PRAGMA foreign_keys = ON');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT UNIQUE NOT NULL,
        folder_id TEXT NOT NULL,
        hash TEXT NOT NULL,
        content TEXT,
        size INTEGER DEFAULT 0,
        extension TEXT DEFAULT '',
        modified_at TEXT DEFAULT '',
        indexed_at TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders (id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        doc_id UNINDEXED,
        content
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        section TEXT DEFAULT '',
        start_char INTEGER DEFAULT 0,
        end_char INTEGER DEFAULT 0,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        chunk_id UNINDEXED,
        document_id UNINDEXED,
        text
      );
    `);

    // Enhanced Document Intelligence Tables
    await this.createDocumentMetadataTable();

    // Safe column migrations if database was created previously without them
    try { await this.db.exec(`ALTER TABLE documents ADD COLUMN size INTEGER DEFAULT 0`); } catch (_) {}
    try { await this.db.exec(`ALTER TABLE documents ADD COLUMN extension TEXT DEFAULT ''`); } catch (_) {}
    try { await this.db.exec(`ALTER TABLE documents ADD COLUMN modified_at TEXT DEFAULT ''`); } catch (_) {}
    
    // Enhanced chunks columns for Document Intelligence
    try { await this.db.exec(`ALTER TABLE chunks ADD COLUMN subsection TEXT DEFAULT ''`); } catch (_) {}
    try { await this.db.exec(`ALTER TABLE chunks ADD COLUMN chunk_type TEXT DEFAULT 'content'`); } catch (_) {}
    try { await this.db.exec(`ALTER TABLE chunks ADD COLUMN contextual_text TEXT DEFAULT ''`); } catch (_) {}
    try { await this.db.exec(`ALTER TABLE chunks ADD COLUMN entities_json TEXT DEFAULT '{}'`); } catch (_) {}

    // Auto-chunk any unchunked documents if chunks table is empty
    try {
      const chunkCount = await this.db.get('SELECT COUNT(*) as count FROM chunks');
      if ((chunkCount?.count || 0) === 0) {
        const allDocs = await this.db.all('SELECT id, content FROM documents WHERE content IS NOT NULL AND content != ""');
        for (const doc of allDocs) {
          const chs = chunkDocumentText(doc.content, 900, 150);
          for (const ch of chs) {
            const chunkId = crypto.randomUUID();
            await this.db.run(
              `INSERT OR IGNORE INTO chunks (id, document_id, chunk_index, text, section, start_char, end_char)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [chunkId, doc.id, ch.chunkIndex, ch.text, ch.section || '', ch.startChar, ch.endChar]
            );
            await this.db.run(
              `INSERT OR IGNORE INTO chunks_fts (chunk_id, document_id, text) VALUES (?, ?, ?)`,
              [chunkId, doc.id, ch.text]
            );
          }
        }
      }
    } catch (chunkErr) {
      console.warn('Auto-chunk check warning:', chunkErr.message);
    }

    // Load registered folders into allowed set
    const existingFolders = await this.db.all('SELECT path FROM folders');
    for (const f of existingFolders) {
      this.allowedFolders.add(f.path);
    }
  }

  async createDocumentMetadataTable() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_metadata (
        document_id TEXT PRIMARY KEY,
        title TEXT DEFAULT '',
        author TEXT DEFAULT '',
        doc_type TEXT DEFAULT 'document',
        keywords TEXT DEFAULT '',
        entities TEXT DEFAULT '{}',
        sections_json TEXT DEFAULT '[]',
        language TEXT DEFAULT 'id',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      );
    `);
  }

  // Security: Path containment validation
  isPathAllowed(requestedPath) {
    const normalizedRequested = path.resolve(requestedPath);
    for (const allowedPath of this.allowedFolders) {
      const normalizedAllowed = path.resolve(allowedPath);
      if (normalizedRequested === normalizedAllowed || 
          normalizedRequested.startsWith(normalizedAllowed + path.sep)) {
        return true;
      }
    }
    return false;
  }

  // Robust folder path validator & locator
  async validateFolderPath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string' || !inputPath.trim()) {
      return { valid: false, error: 'Path folder wajib diisi' };
    }

    let raw = inputPath.trim();
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    // Expand home tilde ~
    if (raw === '~') {
      raw = homeDir;
    } else if (raw.startsWith('~/') || raw.startsWith('~\\')) {
      raw = path.join(homeDir, raw.slice(2));
    }

    let candidate = path.resolve(raw);

    // Direct check if candidate path exists
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isDirectory()) {
        return { valid: false, error: 'Path yang dimasukkan bukan merupakan direktori/folder' };
      }
      return { 
        valid: true, 
        resolvedPath: candidate, 
        folderName: path.basename(candidate) || candidate 
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        // If not found directly and user provided a folder name or relative path e.g. "UKM FOKUS":
        // Search in standard user locations: ~/Documents, ~, ~/Desktop, ~/Downloads
        const searchBases = [
          path.join(homeDir, 'Documents'),
          homeDir,
          path.join(homeDir, 'Desktop'),
          path.join(homeDir, 'Downloads'),
          process.cwd()
        ];

        for (const base of searchBases) {
          if (!base) continue;
          const potential = path.join(base, raw);
          try {
            const st = await fs.stat(potential);
            if (st.isDirectory()) {
              console.log(`💡 Auto-located folder "${raw}" at: ${potential}`);
              return {
                valid: true,
                resolvedPath: path.resolve(potential),
                folderName: path.basename(potential) || raw,
                autoLocated: true
              };
            }
          } catch (_) {}
        }

        return {
          valid: false,
          code: 'ENOENT',
          error: `Folder tidak ditemukan: "${inputPath}". Pastikan path lengkap benar dan folder masih tersedia di komputer Anda.`
        };
      } else if (err.code === 'EACCES' || err.code === 'EPERM') {
        return {
          valid: false,
          code: 'EACCES',
          error: `ATLAS tidak memiliki izin untuk membaca folder: "${inputPath}".`
        };
      } else {
        return {
          valid: false,
          error: `Gagal mengakses folder: ${err.message}`
        };
      }
    }
  }

  async initWatchers() {
    const folders = await this.db.all('SELECT * FROM folders');
    for (const folder of folders) {
      this.startFolderWatcher(folder.id, folder.path);
    }
  }

  startFolderWatcher(folderId, folderPath) {
    if (this.watchers.has(folderId)) return;
    try {
      const watcher = chokidar.watch(folderPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 10,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.*',
          '**/*.tmp',
          '**/*.temp'
        ]
      });

      let debounceTimer = null;
      const queueRefresh = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.indexFolder(folderId, folderPath).catch(err => {
            console.error(`Watcher index error for ${folderPath}:`, err);
          });
        }, 1500);
      };

      watcher.on('add', (filePath) => {
        queueRefresh();
      });

      watcher.on('change', (filePath) => {
        queueRefresh();
      });

      watcher.on('unlink', async (filePath) => {
        try {
          const doc = await this.db.get('SELECT id FROM documents WHERE path = ?', [filePath]);
          if (doc) {
            await this.db.run('DELETE FROM documents_fts WHERE doc_id = ?', [doc.id]);
            await this.db.run('DELETE FROM documents WHERE id = ?', [doc.id]);
          }
        } catch (err) {
          console.error(`Error deleting doc ${filePath}:`, err);
        }
      });

      this.watchers.set(folderId, watcher);
    } catch (err) {
      console.warn(`Could not start watcher for ${folderPath}:`, err.message);
    }
  }

  async retrieveAdvancedDocumentContext(userQuestion, conversationId = null, preParsedSemantics = null) {
    const sessionContext = conversationId ? this.sessionManager.get(conversationId) : null;
    const allDocs = await this.db.all('SELECT id, name, path FROM documents');
    const queryAnalysis = preParsedSemantics || parseAndDecomposeQuery(userQuestion, sessionContext, allDocs);
    
    // Core terms and expanded concepts
    const coreTerms = queryAnalysis.coreTerms || extractCoreQueryTerms(userQuestion);
    const expandedConcepts = queryAnalysis.expandedConcepts || expandQueryConcepts(userQuestion, coreTerms, queryAnalysis.intent);
    queryAnalysis.coreTerms = coreTerms;
    queryAnalysis.expandedConcepts = expandedConcepts;
    
    console.log(`[ATLAS DOCUMENT INTELLIGENCE]`);
    console.log(`Query Intent: ${queryAnalysis.intent}`);
    console.log(`Complexity: ${queryAnalysis.atomicRequirements?.length || 1} requirement(s)`);
    console.log(`Comparison: ${queryAnalysis.comparisonTargets?.isComparison || false}`);
    console.log(`Calculation Needed: ${queryAnalysis.requiresCalculation || false}`);
    
    // Enhanced Two-Stage Retrieval using full query semantics
    const retrievalResult = await enhancedTwoStageRetrieval(this.db, queryAnalysis, sessionContext);
    
    console.log(`Retrieval Strategy: ${retrievalResult.retrievalStrategy}`);
    console.log(`Candidates Found: ${retrievalResult.candidates}`);
    console.log(`Selected Chunks: ${retrievalResult.selected}`);
    console.log(`Confidence: ${(retrievalResult.confidence * 100).toFixed(1)}%`);
    
    // Apply enhanced scoring and filtering
    const topChunks = retrievalResult.chunks.map(chunk => {
      const enhancedScore = chunk.intelligenceScore || chunk.finalScore || calculateEnhancedDocumentIntelligence(chunk, queryAnalysis);
      return { ...chunk, finalScore: enhancedScore, score: enhancedScore };
    }).filter(chunk => (chunk.finalScore || 0) >= 15)
     .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

    // Ensure contextual continuity for complex queries
    const contextualChunks = await this.enhanceContextualContinuity(topChunks, queryAnalysis);
    
    return {
      queryAnalysis: {
        ...queryAnalysis,
        coreTerms,
        expandedConcepts,
        retrievalMetrics: {
          candidateCount: retrievalResult.candidates,
          selectedCount: retrievalResult.selected,
          finalCount: contextualChunks.length,
          confidence: retrievalResult.confidence,
          strategy: retrievalResult.retrievalStrategy
        }
      },
      querySemantics: queryAnalysis,
      allCandidateCount: retrievalResult.candidates,
      scoredCandidates: retrievalResult.chunks,
      topChunks: contextualChunks,
      isRelevant: contextualChunks.length > 0 && retrievalResult.confidence > 0.3
    };
  }

  async enhanceContextualContinuity(chunks, queryAnalysis) {
    if (chunks.length === 0) return chunks;
    
    // For document overview or methodology queries, ensure we have comprehensive coverage
    if (queryAnalysis.queryType === 'OVERVIEW' || queryAnalysis.intent === QueryIntent.METHODOLOGY) {
      return await this.getComprehensiveDocumentCoverage(chunks, queryAnalysis);
    }
    
    // For comparative queries, ensure balanced representation
    if (queryAnalysis.queryType === 'COMPARATIVE' || queryAnalysis.requiresMultiDocument) {
      return await this.getBalancedMultiDocumentCoverage(chunks, queryAnalysis);
    }
    
    // For complex queries, add adjacent chunks for better context
    if (queryAnalysis.complexity > 3) {
      return await this.addAdjacentContextualChunks(chunks);
    }
    
    return chunks.slice(0, 6); // Standard limit for simpler queries
  }

  async getComprehensiveDocumentCoverage(chunks, queryAnalysis) {
    const docIds = [...new Set(chunks.map(c => c.document_id))];
    const comprehensive = [];
    
    for (const docId of docIds.slice(0, 2)) { // Limit to 2 documents for overview
      // Get key sections: introduction, methodology, results, conclusion
      const keySections = await this.db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.document_id = ? AND (
          c.chunk_index = 0 OR 
          c.chunk_type IN ('methodology', 'results', 'conclusion', 'abstract') OR
          LOWER(c.section) LIKE '%metodologi%' OR
          LOWER(c.section) LIKE '%hasil%' OR
          LOWER(c.section) LIKE '%kesimpulan%'
        )
        ORDER BY c.chunk_index ASC
        LIMIT 4
      `, [docId]);
      
      // Add highest scoring chunks from original selection
      const docChunks = chunks.filter(c => c.document_id === docId).slice(0, 2);
      
      comprehensive.push(...keySections, ...docChunks);
    }
    
    // Remove duplicates and sort by document order
    const uniqueChunks = comprehensive.filter((chunk, index, arr) => 
      arr.findIndex(c => c.id === chunk.id) === index
    ).sort((a, b) => {
      if (a.document_id === b.document_id) {
        return a.chunk_index - b.chunk_index;
      }
      return 0;
    });
    
    return uniqueChunks.slice(0, 8);
  }

  async getBalancedMultiDocumentCoverage(chunks, queryAnalysis) {
    const byDocument = new Map();
    
    // Group chunks by document
    chunks.forEach(chunk => {
      if (!byDocument.has(chunk.document_id)) {
        byDocument.set(chunk.document_id, []);
      }
      byDocument.get(chunk.document_id).push(chunk);
    });
    
    const balanced = [];
    const maxPerDoc = Math.max(2, Math.floor(8 / byDocument.size));
    
    // Take balanced representation from each document
    for (const [docId, docChunks] of byDocument) {
      balanced.push(...docChunks.slice(0, maxPerDoc));
    }
    
    return balanced.sort((a, b) => (b.finalScore || b.intelligenceScore || 0) - (a.finalScore || a.intelligenceScore || 0));
  }

  async addAdjacentContextualChunks(chunks) {
    const enhanced = [...chunks];
    const addedIds = new Set(chunks.map(c => c.id));
    
    for (const chunk of chunks.slice(0, 3)) { // Only for top 3 chunks
      // Get adjacent chunks for better context
      const adjacent = await this.db.all(`
        SELECT c.*, d.name as document_name, d.path as document_path
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.document_id = ? AND c.chunk_index IN (?, ?)
        ORDER BY c.chunk_index ASC
      `, [chunk.document_id, chunk.chunk_index - 1, chunk.chunk_index + 1]);
      
      for (const adj of adjacent) {
        if (!addedIds.has(adj.id) && enhanced.length < 8) {
          adj.finalScore = (chunk.finalScore || 0) * 0.8; // Reduced score for adjacent
          enhanced.push(adj);
          addedIds.add(adj.id);
        }
      }
    }
    
    return enhanced.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  async retrieveChunksForTerms(coreTerms, userQuestion) {
    let candidateChunks = [];
    const rawWords = coreTerms.map(t => t.raw);
    const stemWords = coreTerms.map(t => t.stem).filter(Boolean);
    const ftsWords = Array.from(new Set([...rawWords, ...stemWords]));

    // Strategy 1: Strict match on chunks_fts where all raw terms are present
    const andQuery = rawWords.map(t => `"${t.replace(/[^a-zA-Z0-9]/g, '')}"*`).filter(t => t !== '""*').join(' AND ');
    if (andQuery) {
      try {
        const rawAndChunks = await this.db.all(`
          SELECT c.id as chunk_id, c.document_id, c.chunk_index, c.text, c.section,
                 d.name as document_name, d.path as document_path,
                 bm25(chunks_fts) as rank
          FROM chunks c
          JOIN chunks_fts fts ON c.id = fts.chunk_id
          JOIN documents d ON c.document_id = d.id
          WHERE chunks_fts MATCH ?
          ORDER BY bm25(chunks_fts)
          LIMIT 6
        `, [andQuery]);

        for (const ch of rawAndChunks) {
          const rel = scoreChunkRelevance(ch, coreTerms, userQuestion);
          Object.assign(ch, rel);
          console.log(`Candidate (Strategy 1): ${ch.document_name} chunk ${ch.chunk_index} | score: ${ch.score} | matched: ${ch.matchedTerms.join(', ') || '(none)'} | relevant: ${ch.isRelevant ? 'YES' : 'NO'}`);
        }

        candidateChunks = rawAndChunks.filter(ch => ch.isRelevant);
        candidateChunks.sort((a, b) => b.score - a.score || a.rank - b.rank);
      } catch (_) {}
    }

    // Strategy 2: If strict AND returned 0, try stem-aware OR query with strict relevance threshold
    if (candidateChunks.length === 0 && ftsWords.length > 0) {
      const orQuery = ftsWords.map(t => `"${t.replace(/[^a-zA-Z0-9]/g, '')}"*`).filter(t => t !== '""*').join(' OR ');
      if (orQuery) {
        try {
          const rawOrChunks = await this.db.all(`
            SELECT c.id as chunk_id, c.document_id, c.chunk_index, c.text, c.section,
                   d.name as document_name, d.path as document_path,
                   bm25(chunks_fts) as rank
            FROM chunks c
            JOIN chunks_fts fts ON c.id = fts.chunk_id
            JOIN documents d ON c.document_id = d.id
            WHERE chunks_fts MATCH ?
            ORDER BY bm25(chunks_fts)
            LIMIT 15
          `, [orQuery]);

          for (const ch of rawOrChunks) {
            const relevance = scoreChunkRelevance(ch, coreTerms, userQuestion);
            Object.assign(ch, relevance);
            console.log(`Candidate (Strategy 2): ${ch.document_name} chunk ${ch.chunk_index} | score: ${ch.score} | matched: ${ch.matchedTerms.join(', ') || '(none)'} | relevant: ${ch.isRelevant ? 'YES' : 'NO'}`);
          }

          candidateChunks = rawOrChunks.filter(ch => ch.isRelevant);
          candidateChunks.sort((a, b) => b.score - a.score || a.rank - b.rank);
        } catch (_) {}
      }
    }

    return candidateChunks;
  }

  setupRoutes() {
    // 1. Health check
    this.app.get('/api/health', async (request, reply) => {
      const stats = await this.getStats();
      return { 
        status: 'ok', 
        name: 'ATLAS Document Intelligence',
        version: '1.0.0',
        stats,
        indexing: this.indexingState,
        aiConfigured: Boolean(getOpenRouterApiKey())
      };
    });

    // 2. Comprehensive stats
    this.app.get('/api/stats', async () => {
      return await this.getStats();
    });

    // 3. Indexing status
    this.app.get('/api/indexing/status', async () => {
      return this.indexingState;
    });

    // 4. List folders with document count
    this.app.get('/api/folders', async () => {
      const folders = await this.db.all(`
        SELECT f.*, 
               COUNT(d.id) as document_count,
               MAX(d.indexed_at) as last_indexed
        FROM folders f
        LEFT JOIN documents d ON f.id = d.folder_id
        GROUP BY f.id
        ORDER BY f.added_at DESC
      `);
      return { folders };
    });

    // 5. Add folder
    this.app.post('/api/folders', async (request, reply) => {
      const { path: folderPath } = request.body || {};
      
      console.log(`\n📁 Selected folder: ${folderPath}`);
      console.log(`🔍 Validating folder...`);

      const check = await this.validateFolderPath(folderPath);
      if (!check.valid) {
        console.warn(`❌ Folder validation failed: ${check.error}`);
        reply.status(400);
        return { error: check.error, code: check.code };
      }

      const resolvedPath = check.resolvedPath;
      const folderName = check.folderName;
      console.log(`✓ Directory exists: ${resolvedPath}`);

      try {
        // Check if already registered
        const existing = await this.db.get('SELECT * FROM folders WHERE path = ?', [resolvedPath]);
        if (existing) {
          console.log(`⚠️ Folder already connected: ${resolvedPath}`);
          this.indexFolder(existing.id, resolvedPath).catch(console.error);
          return {
            id: existing.id,
            path: resolvedPath,
            name: existing.name,
            alreadyExists: true,
            message: `Folder "${existing.name}" sebelumnya sudah terhubung ke ATLAS. Memperbarui indeks...`
          };
        }

        const folderId = crypto.randomUUID();

        await this.db.run(
          'INSERT INTO folders (id, path, name, added_at) VALUES (?, ?, ?, ?)',
          [folderId, resolvedPath, folderName, new Date().toISOString()]
        );

        this.allowedFolders.add(resolvedPath);
        this.startFolderWatcher(folderId, resolvedPath);

        console.log(`📚 Indexing: ${resolvedPath}`);
        // Run indexing in background
        this.indexFolder(folderId, resolvedPath).then(() => {
          console.log(`✓ Folder connected & indexing completed for: ${resolvedPath}`);
        }).catch(err => {
          console.error(`Background indexing failed for ${resolvedPath}:`, err);
        });

        return { 
          id: folderId, 
          path: resolvedPath, 
          name: folderName,
          message: `Folder "${folderName}" berhasil terhubung dan siap diindeks.` 
        };
      } catch (error) {
        console.error(`❌ Error saving folder ${resolvedPath}:`, error.message);
        reply.status(500);
        return { error: `Gagal menghubungkan folder: ${error.message}` };
      }
    });

    // 6. Delete folder from ATLAS index (does NOT delete local files)
    this.app.delete('/api/folders/:id', async (request, reply) => {
      const { id } = request.params;
      try {
        const folder = await this.db.get('SELECT * FROM folders WHERE id = ?', [id]);
        if (!folder) {
          reply.status(404);
          return { error: 'Folder tidak ditemukan' };
        }

        // Stop watcher
        if (this.watchers.has(id)) {
          this.watchers.get(id).close();
          this.watchers.delete(id);
        }

        // Remove from allowed folders
        this.allowedFolders.delete(path.resolve(folder.path));

        // Delete all FTS entries for documents in this folder
        const docs = await this.db.all('SELECT id FROM documents WHERE folder_id = ?', [id]);
        for (const doc of docs) {
          await this.db.run('DELETE FROM documents_fts WHERE doc_id = ?', [doc.id]);
        }

        // Delete documents and folder
        await this.db.run('DELETE FROM documents WHERE folder_id = ?', [id]);
        await this.db.run('DELETE FROM folders WHERE id = ?', [id]);

        return { 
          success: true, 
          message: `Folder "${folder.name}" berhasil dihapus dari indeks ATLAS (file asli aman)` 
        };
      } catch (error) {
        reply.status(500);
        return { error: error.message };
      }
    });

    // 7. Re-index single folder
    this.app.post('/api/folders/:id/reindex', async (request, reply) => {
      const { id } = request.params;
      const folder = await this.db.get('SELECT * FROM folders WHERE id = ?', [id]);
      if (!folder) {
        reply.status(404);
        return { error: 'Folder tidak ditemukan' };
      }
      this.indexFolder(folder.id, folder.path).catch(console.error);
      return { success: true, message: `Pengindeksan ulang folder "${folder.name}" dimulai` };
    });

    // 8. Re-index all folders
    this.app.post('/api/reindex-all', async (request, reply) => {
      const folders = await this.db.all('SELECT * FROM folders');
      for (const f of folders) {
        this.indexFolder(f.id, f.path).catch(console.error);
      }
      return { success: true, message: `Pengindeksan ulang untuk ${folders.length} folder dimulai` };
    });

    // 9. List documents with filters & sorting
    this.app.get('/api/documents', async (request, reply) => {
      const { folderId, type, search, sort = 'modified_desc', limit = 100 } = request.query || {};

      let sql = `
        SELECT d.id, d.name, d.path, d.folder_id, d.size, d.extension, d.modified_at, d.indexed_at,
               f.name as folder_name
        FROM documents d
        LEFT JOIN folders f ON d.folder_id = f.id
        WHERE 1=1
      `;
      const params = [];

      if (folderId) {
        sql += ' AND d.folder_id = ?';
        params.push(folderId);
      }

      if (type && type !== 'all') {
        sql += ' AND LOWER(d.extension) = ?';
        params.push(`.${type.toLowerCase().replace(/^\./, '')}`);
      }

      if (search) {
        sql += ' AND (d.name LIKE ? OR d.path LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      switch (sort) {
        case 'name_asc':
          sql += ' ORDER BY d.name ASC';
          break;
        case 'name_desc':
          sql += ' ORDER BY d.name DESC';
          break;
        case 'size_desc':
          sql += ' ORDER BY d.size DESC';
          break;
        case 'modified_asc':
          sql += ' ORDER BY d.modified_at ASC';
          break;
        case 'modified_desc':
        default:
          sql += ' ORDER BY d.modified_at DESC, d.indexed_at DESC';
          break;
      }

      sql += ' LIMIT ?';
      params.push(parseInt(limit) || 100);

      const documents = await this.db.all(sql, params);
      return { documents, total: documents.length };
    });

    // 10. Get single document detail with preview content
    this.app.get('/api/documents/:id', async (request, reply) => {
      const { id } = request.params;
      const doc = await this.db.get(`
        SELECT d.*, f.name as folder_name
        FROM documents d
        LEFT JOIN folders f ON d.folder_id = f.id
        WHERE d.id = ?
      `, [id]);

      if (!doc) {
        reply.status(404);
        return { error: 'Dokumen tidak ditemukan' };
      }

      return { document: doc };
    });

    // 11. Delete single document from index
    this.app.delete('/api/documents/:id', async (request, reply) => {
      const { id } = request.params;
      try {
        await this.db.run('DELETE FROM documents_fts WHERE doc_id = ?', [id]);
        await this.db.run('DELETE FROM documents WHERE id = ?', [id]);
        return { success: true, message: 'Dokumen berhasil dihapus dari indeks' };
      } catch (err) {
        reply.status(500);
        return { error: err.message };
      }
    });

    // 12. Robust Search documents with FTS5
    this.app.post('/api/search', async (request, reply) => {
      const { query, limit = 20 } = request.body || {};
      
      if (!query || typeof query !== 'string' || !query.trim()) {
        return { results: [], query: '', total: 0 };
      }

      const rawQuery = query.trim();
      const sanitized = sanitizeFtsQuery(rawQuery);

      try {
        let results = [];

        if (sanitized) {
          // Attempt FTS match + name/extension match
          try {
            const ftsRows = await this.db.all(`
              SELECT d.id, d.name, d.path, d.extension, d.size, d.modified_at,
                     f.name as folder_name,
                     snippet(documents_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
              FROM documents d
              JOIN documents_fts fts ON d.id = fts.doc_id
              LEFT JOIN folders f ON d.folder_id = f.id
              WHERE documents_fts MATCH ?
              ORDER BY bm25(documents_fts)
              LIMIT ?
            `, [sanitized, parseInt(limit) || 20]);

            // Also match by filename or file extension (e.g. searching 'pdf', 'laporan', 'anggaran', etc.)
            const nameExtRows = await this.db.all(`
              SELECT d.id, d.name, d.path, d.extension, d.size, d.modified_at,
                     f.name as folder_name,
                     substr(d.content, 1, 180) as snippet
              FROM documents d
              LEFT JOIN folders f ON d.folder_id = f.id
              WHERE d.name LIKE ? OR d.extension LIKE ? OR LOWER(d.extension) = ?
              LIMIT ?
            `, [`%${rawQuery}%`, `%${rawQuery}%`, `.${rawQuery.toLowerCase().replace(/^\./, '')}`, parseInt(limit) || 20]);

            const seen = new Set(ftsRows.map(r => r.id));
            results = [...ftsRows];
            for (const row of nameExtRows) {
              if (!seen.has(row.id)) {
                seen.add(row.id);
                results.push({
                  ...row,
                  snippet: row.snippet ? row.snippet + '...' : `Kecocokan pada nama atau ekstensi berkas`
                });
              }
            }
          } catch (ftsError) {
            console.warn('FTS Match warning, falling back to LIKE query:', ftsError.message);
            // Fallback to safe LIKE query if FTS syntax error still occurs
            results = await this.db.all(`
              SELECT d.id, d.name, d.path, d.extension, d.size, d.modified_at,
                     f.name as folder_name,
                     substr(d.content, 1, 200) as snippet
              FROM documents d
              LEFT JOIN folders f ON d.folder_id = f.id
              WHERE d.content LIKE ? OR d.name LIKE ? OR d.extension LIKE ?
              LIMIT ?
            `, [`%${rawQuery}%`, `%${rawQuery}%`, `%${rawQuery}%`, parseInt(limit) || 20]);
          }
        }

        return { 
          results: results.map(r => ({
            documentId: r.id,
            name: r.name,
            path: r.path,
            extension: r.extension,
            size: r.size,
            folderName: r.folder_name,
            snippet: r.snippet || (r.content ? r.content.slice(0, 200) + '...' : '')
          })),
          query: rawQuery,
          total: results.length
        };
      } catch (error) {
        reply.status(500);
        return { error: `Gagal melakukan pencarian: ${error.message}` };
      }
    });

    // 13. AI Chat with Grounded Document Citations (Professor-Level Intelligence System)
    this.app.post('/api/chat', async (request, reply) => {
      const { message, conversationId } = request.body || {};
      
      if (!message || typeof message !== 'string' || !message.trim()) {
        reply.status(400);
        return { error: 'Pertanyaan tidak boleh kosong' };
      }

      const userQuestion = message.trim();
      const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sessionContext = convId ? this.sessionManager.get(convId) : null;
      const allDocs = await this.db.all('SELECT id, name, path FROM documents');

      try {
        // 1. QUERY UNDERSTANDING & DECOMPOSITION ENGINE
        const querySemantics = parseQuerySemantics(userQuestion, sessionContext, allDocs);

        // 2. HYBRID CANDIDATE RETRIEVAL
        const retrievalResult = await this.retrieveAdvancedDocumentContext(userQuestion, convId, querySemantics);
        const { allCandidateCount, topChunks } = retrievalResult;
        const candidates = retrievalResult.scoredCandidates || topChunks || [];

        // 3. EVIDENCE VERIFICATION ENGINE
        const verifiedEvidence = verifyEvidenceCandidates(candidates, querySemantics, allDocs);

        // 4. REASONING & INFORMATION STATUS ENGINE
        const reasoningResult = performDocumentReasoning(querySemantics, verifiedEvidence);

        const apiKey = getOpenRouterApiKey();
        const model = getAiModel();

        // Standard Observability Logging per specification
        console.log('\n[ATLAS QUERY]');
        console.log(`Original query:\n${userQuestion}`);
        console.log(`\nIntent:\n${querySemantics.intent}`);
        console.log(`\nExpanded terms:\n${(querySemantics.expandedConcepts || []).join(', ') || '(none)'}`);
        console.log(`\nRetrieval candidates:\n${allCandidateCount}`);
        console.log(`\nSelected chunks:\n${topChunks.map(c => `${c.document_name} (#${c.chunk_index}, skor: ${c.score || c.finalScore || 0})`).join(', ') || '(none)'}`);
        console.log(`\nInformation Status:\n${reasoningResult.status}`);
        console.log(`\nDecision:\n${reasoningResult.status === InformationStatus.FOUND || reasoningResult.status === InformationStatus.PARTIAL ? 'RELEVANT' : 'REJECT'}`);
        console.log(`\nOpenRouter:\n${apiKey && reasoningResult.status === InformationStatus.FOUND ? 'YES (' + model + ')' : 'NO'}`);
        console.log(`\nModel:\n${apiKey && reasoningResult.status === InformationStatus.FOUND ? model : '(none)'}`);

        // Determine active chunks & source attribution
        const activeChunks = (reasoningResult.status === InformationStatus.FOUND || reasoningResult.status === InformationStatus.PARTIAL)
          ? (reasoningResult.verifiedChunks.length > 0 ? reasoningResult.verifiedChunks : topChunks)
          : (reasoningResult.status === InformationStatus.RELATED_BUT_NOT_CONFIRMED || reasoningResult.status === InformationStatus.CONFLICTING
              ? (reasoningResult.relatedChunks.length > 0 ? reasoningResult.relatedChunks : topChunks)
              : []);

        const isRejectionOrMissing = reasoningResult.status === InformationStatus.OUT_OF_SCOPE || 
                                     reasoningResult.status === InformationStatus.NOT_FOUND || 
                                     reasoningResult.status === InformationStatus.RELATED_BUT_NOT_CONFIRMED || 
                                     reasoningResult.status === InformationStatus.LOW_CONFIDENCE;

        let responseText = '';
        let sourceChunks = activeChunks;

        if (apiKey && reasoningResult.status === InformationStatus.FOUND) {
          const fullContext = buildDocumentContext(activeChunks);
          try {
            responseText = await this.callOpenRouter(userQuestion, fullContext, querySemantics);
            // On success: sources derive from the exact chunks sent to LLM
            sourceChunks = selectContextChunks(activeChunks);
          } catch (aiError) {
            console.warn('OpenRouter unavailable, using Professor-level local synthesis:', aiError.message);
            responseText = generateProfessorResponse(reasoningResult, querySemantics, allDocs);
          }
        } else {
          responseText = generateProfessorResponse(reasoningResult, querySemantics, allDocs);
        }

        const sources = isRejectionOrMissing
          ? []
          : sourceChunks.slice(0, 5).map(c => ({
              documentId: c.document_id,
              documentName: c.document_name,
              path: c.document_path,
              chunkIndex: c.chunk_index,
              section: c.section || '',
              snippet: generateSmartSnippet(c.text)
            }));

        // Update short-term session conversation context for follow-up questions
        // Store deduped doc IDs so follow-up queries inherit only the relevant documents
        const verifiedDocIds = [...new Set(activeChunks.map(c => c.document_id))];
        const verifiedDocNames = [...new Set(activeChunks.map(c => c.document_name))];
        this.sessionManager.update(convId, {
          lastQuery: userQuestion,
          lastDocIds: verifiedDocIds,
          lastDocNames: verifiedDocNames,
          lastTopic: querySemantics.atomicRequirements?.[0]?.target || userQuestion,
          lastIntent: querySemantics.intent
        });

        return {
          response: responseText,
          sources,
          query: userQuestion,
          conversationId: convId,
          aiConfigured: Boolean(apiKey),
          informationStatus: reasoningResult.status
        };
      } catch (error) {
        console.error('CRITICAL CHAT ERROR:', error.stack || error);
        return reply.status(500).send({ error: `Gagal memproses pertanyaan: ${error.message}` });
      }
    });

    // 14. Secure server-side folder & file explorer (Visual Directory Picker & Browse Files)
    this.app.get('/api/fs/explore', async (request, reply) => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
      let targetPath = request.query.path;

      if (!targetPath || targetPath === '~') {
        const docsPath = path.join(homeDir, 'Documents');
        try {
          const st = await fs.stat(docsPath);
          if (st.isDirectory()) {
            targetPath = docsPath;
          } else {
            targetPath = homeDir;
          }
        } catch (_) {
          targetPath = homeDir;
        }
      } else if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
        targetPath = path.join(homeDir, targetPath.slice(2));
      }

      const resolved = path.resolve(targetPath);

      // Security check: ensure path is within user home or registered folder boundaries
      const allowedRoots = [homeDir, '/tmp', process.cwd()];
      for (const f of this.allowedFolders) {
        allowedRoots.push(f);
      }
      const isSafe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
      if (!isSafe) {
        reply.status(403);
        return { error: 'Akses ditolak: direktori berada di luar area pengguna yang diizinkan.' };
      }

      try {
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          reply.status(400);
          return { error: 'Path yang dipilih bukan folder/direktori' };
        }

        const entries = await fs.readdir(resolved, { withFileTypes: true });
        const directories = [];
        const files = [];

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const entryPath = path.join(resolved, entry.name);

          if (entry.isDirectory()) {
            directories.push({
              name: entry.name,
              path: entryPath
            });
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            try {
              const fileStat = await fs.stat(entryPath);
              files.push({
                name: entry.name,
                path: entryPath,
                extension: ext,
                size: fileStat.size,
                modified_at: fileStat.mtime.toISOString(),
                isSupported: ['.pdf', '.docx', '.txt', '.md'].includes(ext)
              });
            } catch (_) {}
          }
        }

        // Sort alphabetically
        directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        // Check which files are already indexed in database
        const filePaths = files.map(f => f.path);
        if (filePaths.length > 0) {
          const placeholders = filePaths.map(() => '?').join(',');
          const indexedDocs = await this.db.all(
            `SELECT id, path FROM documents WHERE path IN (${placeholders})`,
            filePaths
          );
          const indexedMap = new Map(indexedDocs.map(d => [d.path, d.id]));
          for (const f of files) {
            if (indexedMap.has(f.path)) {
              f.isIndexed = true;
              f.documentId = indexedMap.get(f.path);
            } else {
              f.isIndexed = false;
            }
          }
        }

        const parentPath = path.dirname(resolved);

        // Detect available quick shortcuts
        const shortcutCandidates = [
          { id: 'documents', label: 'Documents', icon: '📁', path: path.join(homeDir, 'Documents') },
          { id: 'home', label: 'Home', icon: '🏠', path: homeDir },
          { id: 'desktop', label: 'Desktop', icon: '💻', path: path.join(homeDir, 'Desktop') },
          { id: 'downloads', label: 'Downloads', icon: '📥', path: path.join(homeDir, 'Downloads') }
        ];

        const quickLocations = [];
        for (const sc of shortcutCandidates) {
          try {
            const st = await fs.stat(sc.path);
            if (st.isDirectory()) {
              quickLocations.push(sc);
            }
          } catch (_) {}
        }

        return {
          currentPath: resolved,
          currentName: path.basename(resolved) || resolved,
          parentPath: parentPath !== resolved ? parentPath : null,
          directories,
          files,
          quickLocations
        };
      } catch (error) {
        reply.status(400);
        return { error: `Gagal membaca direktori: ${error.message}` };
      }
    });

    // 14b. Native OS Folder Browser Dialog
    this.app.post('/api/fs/browse-dialog', async (request, reply) => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
      let initialPath = request.body?.currentPath || homeDir;
      if (initialPath.startsWith('~/') || initialPath.startsWith('~\\')) {
        initialPath = path.join(homeDir, initialPath.slice(2));
      }
      initialPath = path.resolve(initialPath);

      const allowedRoots = [homeDir, '/tmp', process.cwd()];
      for (const f of this.allowedFolders) {
        allowedRoots.push(f);
      }
      const isInitialSafe = allowedRoots.some(root => initialPath === root || initialPath.startsWith(root + path.sep));
      if (!isInitialSafe) {
        reply.status(403);
        return { success: false, error: 'Akses ditolak: direktori berada di luar area pengguna yang diizinkan.' };
      }

      try {
        const dialogResult = await this.openNativeFolderDialog(initialPath);
        if (!dialogResult.success) {
          return dialogResult;
        }

        const resolved = path.resolve(dialogResult.path);

        // Security check: ensure path is within user home or registered folder boundaries
        const isSafe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
        if (!isSafe) {
          reply.status(403);
          return { success: false, error: 'Akses ditolak: direktori berada di luar area pengguna yang diizinkan.' };
        }

        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          reply.status(400);
          return { success: false, error: 'Path yang dipilih bukan direktori' };
        }

        return {
          success: true,
          path: resolved,
          name: path.basename(resolved) || resolved
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // 14c. Resolve folder from browser picker / file handle
    this.app.post('/api/fs/resolve-folder', async (request, reply) => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
      const { folderName, sampleFiles = [], currentPath, absolutePath } = request.body || {};

      const allowedRoots = [homeDir, '/tmp', process.cwd()];
      for (const f of this.allowedFolders) {
        allowedRoots.push(f);
      }

      // If absolutePath is provided directly (e.g. from environment that provides it)
      if (absolutePath && typeof absolutePath === 'string') {
        const resolved = path.resolve(absolutePath);
        const isSafe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
        if (!isSafe) {
          reply.status(403);
          return { success: false, error: 'Akses ditolak: direktori berada di luar area pengguna yang diizinkan.' };
        }
        try {
          const stat = await fs.stat(resolved);
          if (stat.isDirectory()) {
            return { success: true, path: resolved, name: path.basename(resolved) || resolved };
          }
        } catch (_) {}
      }

      if (!folderName || typeof folderName !== 'string') {
        reply.status(400);
        return { success: false, error: 'Nama folder harus diberikan' };
      }

      const cleanName = path.basename(folderName.trim());

      const candidatePaths = [];
      if (currentPath) {
        candidatePaths.push(path.resolve(currentPath, cleanName));
        if (path.basename(path.resolve(currentPath)) === cleanName) {
          candidatePaths.push(path.resolve(currentPath));
        }
        candidatePaths.push(path.resolve(path.dirname(currentPath), cleanName));
      }

      candidatePaths.push(
        path.join(homeDir, 'Documents', cleanName),
        path.join(homeDir, cleanName),
        path.join(homeDir, 'Desktop', cleanName),
        path.join(homeDir, 'Downloads', cleanName),
        path.join(process.cwd(), cleanName),
        path.join(process.cwd(), '..', cleanName)
      );

      for (const f of this.allowedFolders) {
        candidatePaths.push(path.join(f, cleanName));
      }

      const uniqueCandidates = Array.from(new Set(candidatePaths));

      for (const cand of uniqueCandidates) {
        const resolved = path.resolve(cand);
        const isSafe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
        if (!isSafe) continue;

        try {
          const stat = await fs.stat(resolved);
          if (stat.isDirectory()) {
            if (sampleFiles.length > 0) {
              let matchedFile = false;
              for (const sf of sampleFiles.slice(0, 5)) {
                const checkFilePath = path.join(resolved, path.basename(sf));
                try {
                  const fStat = await fs.stat(checkFilePath);
                  if (fStat.isFile()) {
                    matchedFile = true;
                    break;
                  }
                } catch (_) {}
              }
              if (matchedFile) {
                return { success: true, path: resolved, name: path.basename(resolved) || cleanName };
              }
            } else {
              return { success: true, path: resolved, name: path.basename(resolved) || cleanName };
            }
          }
        } catch (_) {}
      }

      // If sampleFiles check did not find match, try any candidate folder that exists
      for (const cand of uniqueCandidates) {
        const resolved = path.resolve(cand);
        const isSafe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
        if (!isSafe) continue;

        try {
          const stat = await fs.stat(resolved);
          if (stat.isDirectory()) {
            return { success: true, path: resolved, name: path.basename(resolved) || cleanName };
          }
        } catch (_) {}
      }

      return {
        success: false,
        error: `Folder "${cleanName}" terdeteksi, namun path absolut tidak dapat dipastikan secara otomatis. Silakan pilih folder ini langsung melalui daftar direktori.`
      };
    });

    // 15. Settings API
    this.app.get('/api/settings', async () => {
      const apiKey = getOpenRouterApiKey();
      return {
        aiConfigured: Boolean(apiKey),
        apiKeyMasked: apiKey ? 'sk-or-••••' + apiKey.slice(-4) : '',
        aiModel: getAiModel(),
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        port: parseInt(process.env.PORT) || 3001,
        chunkSize: parseInt(process.env.CHUNK_SIZE) || 900,
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 150
      };
    });

    this.app.post('/api/settings', async (request, reply) => {
      const { apiKey, aiModel, chunkSize, chunkOverlap } = request.body || {};
      
      if (apiKey !== undefined && apiKey !== '••••••••' && !apiKey.startsWith('sk-or-••••')) {
        const cleanKey = apiKey.trim();
        process.env.OPENROUTER_API_KEY = cleanKey;
        persistEnvVariable('OPENROUTER_API_KEY', cleanKey);
      }
      if (aiModel) {
        const cleanModel = aiModel.trim();
        process.env.AI_MODEL = cleanModel;
        persistEnvVariable('AI_MODEL', cleanModel);
      }
      if (chunkSize) {
        process.env.CHUNK_SIZE = String(chunkSize);
        persistEnvVariable('CHUNK_SIZE', String(chunkSize));
      }
      if (chunkOverlap) {
        process.env.CHUNK_OVERLAP = String(chunkOverlap);
        persistEnvVariable('CHUNK_OVERLAP', String(chunkOverlap));
      }

      const activeKey = getOpenRouterApiKey();

      return {
        success: true,
        message: 'Pengaturan berhasil disimpan',
        settings: {
          aiConfigured: Boolean(activeKey),
          apiKeyMasked: activeKey ? 'sk-or-••••' + activeKey.slice(-4) : '',
          aiModel: getAiModel(),
          chunkSize: process.env.CHUNK_SIZE || '900',
          chunkOverlap: process.env.CHUNK_OVERLAP || '150'
        }
      };
    });

    // 16. Test AI Connection
    this.app.post('/api/ai/test', async (request, reply) => {
      const apiKey = (request.body?.apiKey || getOpenRouterApiKey()).trim();
      const model = (request.body?.aiModel || getAiModel()).trim();

      if (!apiKey) {
        reply.status(400);
        return { success: false, error: 'API Key OpenRouter belum diisi atau tidak ditemukan di .env' };
      }

      try {
        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model,
          messages: [{ role: 'user', content: 'Ping. Jawab dengan satu kata: "OK".' }],
          max_tokens: 10
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3001',
            'X-Title': 'ATLAS Document Intelligence'
          },
          timeout: 15000
        });

        const replyText = res.data?.choices?.[0]?.message?.content || 'OK';
        return { success: true, message: `Koneksi berhasil! Respons model (${model}): "${replyText.trim()}"` };
      } catch (err) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.message;
        reply.status(400);
        return { success: false, error: `Uji koneksi gagal${status ? ' (' + status + ')' : ''}: ${errMsg}` };
      }
    });

    // 17. Serve frontend on root
    this.app.get('/', async (request, reply) => {
      try {
        const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
        reply.type('text/html').send(html);
      } catch (err) {
        reply.type('text/html').send(this.getFallbackHTML());
      }
    });
  }

  async callOpenRouter(question, context, queryAnalysis = {}) {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new Error('Kunci API OpenRouter belum dikonfigurasi di file .env');
    }

    const { systemPrompt, userPrompt } = buildGroundedPrompts(question, context, queryAnalysis);
    const model = getAiModel();

    for (const maxTokens of [75, 60, 45]) {
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.2
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3001',
            'X-Title': 'ATLAS Document Intelligence'
          },
          timeout: 30000
        });

        const replyText = response.data?.choices?.[0]?.message?.content;
        if (replyText) {
          return replyText;
        }
      } catch (err) {
        if (err.response?.status === 402 && maxTokens > 100) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('Tidak ada respon konten dari AI provider');
  }

  async indexFolder(folderId, folderPath) {
    this.indexingState.isIndexing = true;
    this.indexingState.errors = [];
    
    try {
      const files = await this.getAllFiles(folderPath);
      this.indexingState.total = files.length;
      this.indexingState.processed = 0;
      this.indexingState.failed = 0;

      for (const filePath of files) {
        this.indexingState.currentFile = path.basename(filePath);
        try {
          await this.indexDocument(folderId, filePath);
          this.indexingState.processed++;
        } catch (error) {
          this.indexingState.failed++;
          this.indexingState.errors.push({ file: path.basename(filePath), error: error.message });
          console.warn(`Failed to index ${filePath}:`, error.message);
        }
      }

      this.indexingState.lastCompletedAt = new Date().toISOString();
    } catch (error) {
      console.error(`Indexing failed for ${folderPath}:`, error);
      this.indexingState.errors.push({ folder: folderPath, error: error.message });
    } finally {
      this.indexingState.isIndexing = false;
      this.indexingState.currentFile = '';
    }
  }

  async getAllFiles(dirPath) {
    const files = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.pdf', '.docx', '.txt', '.md'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  async indexDocument(folderId, filePath) {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check if existing record has identical hash
    const existing = await this.db.get('SELECT id, hash FROM documents WHERE path = ?', [filePath]);
    if (existing && existing.hash === hash) {
      return; // Skip unchanged file
    }

    // Extract text content
    let content = '';
    try {
      if (ext === '.pdf') {
        const data = await pdfParse(fileBuffer);
        content = data.text || '';
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value || '';
      } else if (ext === '.txt' || ext === '.md') {
        content = fileBuffer.toString('utf-8');
      }
    } catch (error) {
      throw new Error(`Ekstraksi gagal: ${error.message}`);
    }

    if (!content.trim()) {
      return; // Skip empty content
    }

    // Extract document-level metadata for better understanding
    const documentMetadata = extractDocumentMetadata(content, path.basename(filePath));

    // Reuse existing ID if updating, or generate new UUID
    const docId = existing ? existing.id : crypto.randomUUID();

    // Clean any prior FTS and chunks entry for this docId to avoid stale/duplicate rows
    await this.db.run('DELETE FROM documents_fts WHERE doc_id = ?', [docId]);
    await this.db.run('DELETE FROM chunks_fts WHERE document_id = ?', [docId]);
    await this.db.run('DELETE FROM chunks WHERE document_id = ?', [docId]);
    await this.db.run('DELETE FROM document_metadata WHERE document_id = ?', [docId]);

    // Upsert document record with enhanced metadata
    await this.db.run(
      `INSERT OR REPLACE INTO documents 
       (id, name, path, folder_id, hash, content, size, extension, modified_at, indexed_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, 
        path.basename(filePath), 
        filePath, 
        folderId, 
        hash, 
        content,
        stat.size,
        ext,
        stat.mtime.toISOString(),
        new Date().toISOString()
      ]
    );

    // Store document metadata for intelligent retrieval
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO document_metadata 
         (document_id, title, author, doc_type, keywords, entities, sections_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          documentMetadata.title || '',
          documentMetadata.author || '',
          documentMetadata.type || 'document',
          documentMetadata.keywords.join(','),
          JSON.stringify(documentMetadata.entities),
          JSON.stringify(documentMetadata.sections)
        ]
      );
    } catch (metadataError) {
      // Metadata table might not exist yet - create it
      await this.createDocumentMetadataTable();
      await this.db.run(
        `INSERT OR REPLACE INTO document_metadata 
         (document_id, title, author, doc_type, keywords, entities, sections_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          documentMetadata.title || '',
          documentMetadata.author || '',
          documentMetadata.type || 'document',
          documentMetadata.keywords.join(','),
          JSON.stringify(documentMetadata.entities),
          JSON.stringify(documentMetadata.sections)
        ]
      );
    }

    // Insert to documents FTS table
    await this.db.run(
      'INSERT INTO documents_fts (doc_id, content) VALUES (?, ?)',
      [docId, content]
    );

    // Enhanced chunking with contextual metadata
    const chunks = chunkDocumentText(content, 900, 150);
    for (const ch of chunks) {
      const chunkId = crypto.randomUUID();
      
      // Store enhanced chunk data with metadata
      await this.db.run(
        `INSERT INTO chunks 
         (id, document_id, chunk_index, text, section, start_char, end_char, 
          subsection, chunk_type, contextual_text, entities_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chunkId, docId, ch.chunkIndex, ch.text, ch.section || '', 
          ch.startChar, ch.endChar, ch.subsection || '', ch.chunkType || 'content',
          ch.contextualText || ch.text, JSON.stringify(ch.entities || {})
        ]
      );
      
      // Enhanced FTS with contextual text for better semantic search
      await this.db.run(
        `INSERT INTO chunks_fts (chunk_id, document_id, text) VALUES (?, ?, ?)`,
        [chunkId, docId, ch.contextualText || ch.text]
      );
    }
  }

  async openNativeFolderDialog(initialPath) {
    const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    if (!hasDisplay && process.platform !== 'win32' && process.platform !== 'darwin') {
      return { success: false, unsupported: true, error: 'Tidak ada visual display aktif' };
    }

    return new Promise((resolve) => {
      let cmd = '';
      let args = [];

      if (process.platform === 'linux') {
        cmd = 'zenity';
        args = ['--file-selection', '--directory', '--title=Pilih Folder Dokumen untuk ATLAS'];
        if (initialPath) {
          args.push(`--filename=${initialPath}/`);
        }
      } else if (process.platform === 'darwin') {
        cmd = 'osascript';
        args = ['-e', 'POSIX path of (choose folder with prompt "Pilih Folder Dokumen untuk ATLAS")'];
      } else if (process.platform === 'win32') {
        cmd = 'powershell';
        args = [
          '-NoProfile',
          '-Command',
          `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Pilih Folder Dokumen untuk ATLAS'; ${initialPath ? `$f.SelectedPath = '${initialPath}';` : ''} if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }`
        ];
      } else {
        return resolve({ success: false, unsupported: true, error: 'Platform tidak didukung untuk dialog native' });
      }

      execFile(cmd, args, { timeout: 180000 }, (error, stdout) => {
        if (error) {
          if (error.code === 1 || error.killed) {
            // User cancelled or closed dialog window
            return resolve({ success: false, cancelled: true });
          }
          if (error.code === 127 || error.code === 'ENOENT') {
            return resolve({ success: false, unsupported: true, error: `${cmd} tidak terpasang di sistem` });
          }
          return resolve({ success: false, error: error.message });
        }

        const selectedPath = (stdout || '').trim().replace(/\r\n/g, '\n').split('\n')[0];
        if (!selectedPath) {
          return resolve({ success: false, cancelled: true });
        }

        resolve({ success: true, path: selectedPath });
      });
    });
  }

  async getStats() {
    const folders = await this.db.get('SELECT COUNT(*) as count FROM folders');
    const documents = await this.db.get('SELECT COUNT(*) as count, SUM(size) as total_size FROM documents');
    const recentDoc = await this.db.get('SELECT MAX(indexed_at) as last_indexed FROM documents');

    return {
      folders: folders?.count || 0,
      documents: documents?.count || 0,
      indexed: documents?.count || 0,
      totalSize: documents?.total_size || 0,
      lastIndexed: recentDoc?.last_indexed || null
    };
  }

  getFallbackHTML() {
    return `<!DOCTYPE html><html><body><h1>ATLAS is loading...</h1><p>Please ensure public/index.html is created.</p></body></html>`;
  }
}

// Start ATLAS
const atlas = new SimpleATLAS();
atlas.start().catch(console.error);
