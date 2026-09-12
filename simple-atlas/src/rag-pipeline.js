/**
 * ATLAS Advanced Document-Aware RAG Pipeline
 * 
 * Pipeline:
 * USER QUESTION
 *       ↓
 * Query Understanding & Intent Detection
 *       ↓
 * Query Expansion & Concept Mapping
 *       ↓
 * Hybrid Multi-Tier Retrieval (Document-targeted, Semantic, Phrase, Keyword, FTS5)
 *       ↓
 * Context Ranking & Anti-Hallucination Gate
 *       ↓
 * Context Assembly & Continuity Stitching
 *       ↓
 * LLM Reasoning (Document-Grounded System Prompt via OpenRouter)
 *       ↓
 * Natural Answer + Grounded Sources
 */

export const QueryIntent = {
  DOCUMENT_OVERVIEW: 'document_overview',
  SUMMARY: 'summary',
  EXPLANATION: 'explanation',
  METHODOLOGY: 'methodology',
  COMPARISON: 'comparison',
  PEOPLE_RESPONSIBILITY: 'people_responsibility',
  DATE_TIME: 'date_time',
  FINANCIAL: 'financial',
  PROCEDURE: 'procedure',
  FACTUAL: 'factual'
};

// Indonesian stop words for query normalization
export const INDONESIAN_STOP_WORDS = new Set([
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

export function normalizeIndonesianStem(word) {
  if (!word || word.length <= 4) return null;
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

export function extractCoreQueryTerms(question) {
  if (!question || typeof question !== 'string') return [];
  const clean = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = clean.split(/\s+/).filter(t => t.length > 1);
  const core = tokens.filter(t => !INDONESIAN_STOP_WORDS.has(t));
  const rawTerms = core.length > 0 ? core : tokens;
  return rawTerms.map(term => ({
    raw: term,
    stem: normalizeIndonesianStem(term)
  }));
}

// Indonesian conceptual dictionary for precision expansion
const INDONESIAN_CONCEPT_EXPANSIONS = {
  karyawan: ['pegawai', 'pekerja', 'staf', 'staff', 'tenaga kerja', 'jam kerja', 'waktu kerja', 'operasional', 'masuk kerja', 'pukul'],
  pegawai: ['karyawan', 'pekerja', 'staf', 'staff', 'jam kerja', 'waktu kerja', 'operasional', 'masuk kerja', 'pukul', 'jam', '08.00'],
  kerja: ['operasional', 'tugas', 'karyawan', 'pegawai', 'waktu kerja', 'jam kerja', 'masuk'],
  bekerja: ['mulai', 'operasional', 'jam kerja', 'waktu kerja', 'masuk kerja', 'pukul', 'jam'],
  mulai: ['dimulai', 'awal', 'pukul', 'jam operasional', 'masuk', 'jam', 'waktu'],
  kapan: ['waktu', 'jam', 'pukul', 'jadwal', 'jam berapa', 'tanggal'],
  jam: ['waktu', 'pukul', 'jadwal', 'operasional'],
  waktu: ['jam', 'pukul', 'jadwal', 'operasional'],
  biaya: ['anggaran', 'dana', 'uang', 'alokasi', 'keuangan', 'pengeluaran', 'harga', 'rupiah', 'rp', 'cost'],
  dana: ['anggaran', 'biaya', 'uang', 'alokasi', 'keuangan', 'rupiah', 'rp'],
  anggaran: ['dana', 'biaya', 'alokasi', 'keuangan', 'pengeluaran', 'belanja', 'rupiah', 'rp'],
  software: ['perangkat lunak', 'aplikasi', 'sistem', 'program'],
  perangkat_lunak: ['software', 'aplikasi', 'sistem', 'program'],
  skripsi: ['penelitian', 'tugas akhir', 'karya ilmiah', 'riset', 'studi', 'bab', 'cnn', 'resnet'],
  penelitian: ['skripsi', 'riset', 'studi', 'tugas akhir', 'metode', 'eksperimen', 'hasil'],
  metodologi: ['metode', 'tahapan', 'cara', 'prosedur', 'pendekatan', 'eksperimen', 'dataset', 'alur'],
  metode: ['metodologi', 'tahapan', 'cara', 'prosedur', 'pendekatan', 'teknik'],
  kesimpulan: ['hasil', 'temuan', 'simpulan', 'konklusi', 'pembahasan', 'akhir', 'akurasi'],
  hasil: ['kesimpulan', 'temuan', 'output', 'capaian', 'akurasi', 'evaluasi', 'pembahasan'],
  visi: ['tujuan', 'misi', 'sasaran', 'cita-cita', 'arah', 'target'],
  misi: ['tujuan', 'visi', 'program', 'kegiatan', 'sasaran'],
  tujuan: ['visi', 'misi', 'sasaran', 'target', 'maksud', 'arah'],
  tanggung_jawab: ['penanggung jawab', 'koordinator', 'manajer', 'ketua', 'pic', 'kepala'],
  praktikum: ['modul', 'laporan', 'jaringan', 'router', 'switch', 'vlan', 'ospf', 'cisco'],
  jaringan: ['praktikum', 'router', 'switch', 'vlan', 'ospf', 'konektivitas'],
  tunjangan: ['tunjangan komunikasi', 'komunikasi', 'bulanan', 'per bulan', 'setahun', 'tahunan']
};

export class SessionContextManager {
  constructor() {
    this.sessions = new Map();
    this.SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
  }

  get(sessionId) {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() - session.updatedAt > this.SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  update(sessionId, data) {
    if (!sessionId) return;
    const existing = this.get(sessionId) || {};
    this.sessions.set(sessionId, {
      ...existing,
      ...data,
      updatedAt: Date.now()
    });
  }
}

export function detectQueryIntent(question) {
  const lower = question.toLowerCase().trim();

  // 1. Comparison
  if (
    /^(?:bandingkan|perbandingan|apa perbedaan|jelaskan perbedaan|bedanya|komparasi)\b/i.test(lower) ||
    /\b(?:dibandingkan dengan|perbedaan antara|dibandingkan)\b/i.test(lower)
  ) {
    return QueryIntent.COMPARISON;
  }

  // 2. Document Overview / Core content
  if (
    /\b(?:apa inti|inti dari|apa materi|materi yang dibahas|isi dokumen|tentang apa|membahas tentang apa|ringkas isi dokumen|topik utama|gambaran umum|overview)\b/i.test(lower) ||
    /^(?:apa yang dibahas|dokumen ini tentang apa|isi dari skripsi|isi dokumen)\b/i.test(lower)
  ) {
    return QueryIntent.DOCUMENT_OVERVIEW;
  }

  // 3. Summary & Conclusion
  if (
    /\b(?:kesimpulan|simpulan|konklusi|rangkum|ringkas|rangkuman|ringkasan|poin penting)\b/i.test(lower)
  ) {
    return QueryIntent.SUMMARY;
  }

  // 4. Methodology / Process
  if (
    /\b(?:metodologi|metode penelitian|tahapan penelitian|tahapan eksperimen|arsitektur model|bagaimana cara kerja|prosedur penelitian)\b/i.test(lower)
  ) {
    return QueryIntent.METHODOLOGY;
  }

  // 5. Explanation / Relationships
  if (
    /^(?:jelaskan|mengapa|kenapa|apa hubungan|bagaimana hubungan|uraikan)\b/i.test(lower) ||
    /\b(?:bahasa sederhana|untuk orang awam|secara sederhana|maksud dari)\b/i.test(lower)
  ) {
    return QueryIntent.EXPLANATION;
  }

  // 6. People & Responsibility
  if (
    /\b(?:siapa yang bertanggung jawab|penanggung jawab|koordinator|manajer|direktur|pic|ketua)\b/i.test(lower) ||
    /^(?:siapa)\b/i.test(lower)
  ) {
    return QueryIntent.PEOPLE_RESPONSIBILITY;
  }

  // 7. Date & Time
  if (
    /\b(?:kapan|jam berapa|pukul berapa|jadwal|waktu operasional|jam kerja|mulai bekerja|jam masuk)\b/i.test(lower)
  ) {
    return QueryIntent.DATE_TIME;
  }

  // 8. Financial & Budget
  if (
    /\b(?:berapa.*(?:biaya|anggaran|dana|uang|alokasi|tarif|harga|budget|rupiah|gaji|tunjangan))\b/i.test(lower) ||
    /\b(?:biaya|anggaran|dana|tunjangan komunikasi|pengeluaran)\b/i.test(lower)
  ) {
    return QueryIntent.FINANCIAL;
  }

  // 9. Procedure
  if (
    /\b(?:bagaimana cara|langkah-langkah|alur|prosedur|tahap|panduan)\b/i.test(lower)
  ) {
    return QueryIntent.PROCEDURE;
  }

  // Default
  return QueryIntent.FACTUAL;
}

export function expandQueryConcepts(question, coreTerms, intent) {
  const expandedConcepts = new Set();
  const lowerQ = question.toLowerCase();

  // Add original core terms
  for (const t of coreTerms) {
    expandedConcepts.add(t.raw);
    if (t.stem) expandedConcepts.add(t.stem);
  }

  // Check conceptual triggers in question and terms
  for (const [key, synonyms] of Object.entries(INDONESIAN_CONCEPT_EXPANSIONS)) {
    const cleanKey = key.replace('_', ' ');
    if (lowerQ.includes(cleanKey) || coreTerms.some(t => t.raw === key || t.stem === key)) {
      for (const syn of synonyms) {
        expandedConcepts.add(syn);
      }
    }
  }

  // Intent-guided specific concept expansions
  if (intent === QueryIntent.DATE_TIME) {
    expandedConcepts.add('jam');
    expandedConcepts.add('pukul');
    expandedConcepts.add('waktu');
    expandedConcepts.add('operasional');
    expandedConcepts.add('kerja');
  } else if (intent === QueryIntent.FINANCIAL) {
    expandedConcepts.add('anggaran');
    expandedConcepts.add('biaya');
    expandedConcepts.add('dana');
    expandedConcepts.add('rp');
    expandedConcepts.add('rupiah');
  } else if (intent === QueryIntent.METHODOLOGY) {
    expandedConcepts.add('metode');
    expandedConcepts.add('metodologi');
    expandedConcepts.add('eksperimental');
    expandedConcepts.add('tahapan');
    expandedConcepts.add('dataset');
  } else if (intent === QueryIntent.SUMMARY || intent === QueryIntent.DOCUMENT_OVERVIEW) {
    expandedConcepts.add('pendahuluan');
    expandedConcepts.add('tujuan');
    expandedConcepts.add('kesimpulan');
    expandedConcepts.add('hasil');
    expandedConcepts.add('latar');
  } else if (intent === QueryIntent.PEOPLE_RESPONSIBILITY) {
    expandedConcepts.add('penanggung');
    expandedConcepts.add('jawab');
    expandedConcepts.add('koordinator');
  }

  return Array.from(expandedConcepts);
}

/**
 * Detects if the question mentions specific document names or document types
 */
export function identifyTargetDocumentReferences(question, allDocuments = []) {
  if (!question || typeof question !== 'string') return [];
  const lowerQ = question.toLowerCase();
  const matchedDocIds = new Set();

  for (const doc of allDocuments) {
    if (!doc || !doc.name) continue;
    const docNameLower = doc.name.toLowerCase();
    const nameWithoutExt = docNameLower.replace(/\.[^/.]+$/, '');
    const cleanNameWords = nameWithoutExt.replace(/[-_]/g, ' ').split(/\s+/).filter(w => w.length > 2);

    // Direct filename substring match
    if (lowerQ.includes(nameWithoutExt) || nameWithoutExt.includes(lowerQ)) {
      matchedDocIds.add(doc.id);
      continue;
    }

    // Specific domain document mappings
    if (lowerQ.includes('skripsi') && docNameLower.includes('skripsi')) {
      matchedDocIds.add(doc.id);
    }
    if (lowerQ.includes('visi') && docNameLower.includes('visi')) {
      matchedDocIds.add(doc.id);
    }
    if (lowerQ.includes('praktikum') && docNameLower.includes('praktikum')) {
      matchedDocIds.add(doc.id);
    }
    if ((lowerQ.includes('karyawan') || lowerQ.includes('pegawai')) && (docNameLower.includes('karyawan') || docNameLower.includes('pegawai'))) {
      matchedDocIds.add(doc.id);
    }
    if ((lowerQ.includes('keuangan') || lowerQ.includes('anggaran')) && (docNameLower.includes('keuangan') || docNameLower.includes('anggaran'))) {
      matchedDocIds.add(doc.id);
    }
    if (lowerQ.includes('keamanan') && docNameLower.includes('keamanan')) {
      matchedDocIds.add(doc.id);
    }

    // Multi-word name match
    let matchCount = 0;
    for (const w of cleanNameWords) {
      if (lowerQ.includes(w)) matchCount++;
    }
    if (cleanNameWords.length > 0 && matchCount >= Math.min(2, cleanNameWords.length)) {
      matchedDocIds.add(doc.id);
    }
  }

  return Array.from(matchedDocIds);
}

/**
 * Detects if a question is a follow-up referring to previous context
 */
export function isFollowUpQuestion(question) {
  const lower = question.toLowerCase().trim();
  const followUpIndicators = [
    /^(?:kenapa|mengapa)\s+(?:metode|hal|itu|tersebut)\b/i,
    /\b(?:metode itu|dokumen itu|penelitian itu|tujuan itu|hal tersebut|hal itu|kenapa demikian)\b/i,
    /^(?:bagaimana dengan|lalu bagaimana|kalau begitu)\b/i,
    /^(?:siapa mereka|kapan itu|berapa totalnya)\b/i
  ];
  return followUpIndicators.some(pattern => pattern.test(lower));
}

/**
 * Advanced Context Ranking that balances semantic and keyword signals
 */
export function calculateDocumentAwareRelevance(chunk, queryAnalysis) {
  const { coreTerms, expandedConcepts, intent, targetDocIds, fullQuestion } = queryAnalysis;
  const chunkText = chunk.text || '';
  const docName = chunk.document_name || '';
  const section = chunk.section || '';
  const combined = `${chunkText} ${docName} ${section}`.toLowerCase();

  let score = 0;
  let exactRawMatches = 0;
  let stemMatches = 0;
  let conceptMatches = 0;
  const matchedTerms = [];

  // 1. Target Document Bonus
  if (targetDocIds && targetDocIds.includes(chunk.document_id)) {
    score += 40; // High confidence document match
  }

  // 2. Exact Phrase Match Bonus
  const qStr = fullQuestion || queryAnalysis.rawQuestion || '';
  const cleanFullQ = qStr.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (cleanFullQ.length > 8 && combined.includes(cleanFullQ)) {
    score += 50;
  }

  // 3. Core Term Matching
  for (const term of coreTerms) {
    const rawLower = term.raw.toLowerCase();
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${rawLower}([^a-zA-Z0-9]|$)`, 'i');
    if (regex.test(combined)) {
      exactRawMatches++;
      score += 15;
      matchedTerms.push(term.raw);
      if (docName.toLowerCase().includes(rawLower)) score += 12;
      if (section.toLowerCase().includes(rawLower)) score += 8;
    } else if (term.stem) {
      const stemRegex = new RegExp(`(^|[^a-zA-Z0-9])${term.stem}([^a-zA-Z0-9]|$)`, 'i');
      if (stemRegex.test(combined)) {
        stemMatches++;
        score += 6;
        matchedTerms.push(term.stem + '~');
      }
    }
  }

  // 4. Expanded Concepts & Semantic Matching
  for (const concept of expandedConcepts) {
    if (!coreTerms.some(t => t.raw === concept)) {
      const conceptRegex = new RegExp(`(^|[^a-zA-Z0-9])${concept}([^a-zA-Z0-9]|$)`, 'i');
      if (conceptRegex.test(combined)) {
        conceptMatches++;
        score += 5;
      }
    }
  }

  // 5. Intent Alignment Bonuses
  if (intent === QueryIntent.DATE_TIME) {
    if (/\b(?:\d{1,2}[:.]\d{2}|pukul|jam\s+\d+|hari\s+senin|wib)\b/i.test(chunkText)) {
      score += 20;
    }
  } else if (intent === QueryIntent.FINANCIAL) {
    if (/\b(?:rp\s*[\d.,]+|rupiah|anggaran|dana|biaya|tunjangan)\b/i.test(chunkText)) {
      score += 20;
    }
  } else if (intent === QueryIntent.METHODOLOGY) {
    if (/\b(?:metode|metodologi|tahapan|resnet|cnn|dataset|pelatihan|eksperimental)\b/i.test(chunkText)) {
      score += 20;
    }
  } else if (intent === QueryIntent.DOCUMENT_OVERVIEW || intent === QueryIntent.SUMMARY) {
    // Favor introductory, objective, and concluding sections
    if (chunk.chunk_index === 0 || /\b(?:bab\s+1|pendahuluan|latar\s+belakang|tujuan|kesimpulan|hasil|bab\s+5)\b/i.test(combined)) {
      score += 25;
    }
  } else if (intent === QueryIntent.PEOPLE_RESPONSIBILITY) {
    if (/\b(?:koordinator|penanggung\s+jawab|manajer|ketua|direktur|pic)\b/i.test(chunkText)) {
      score += 25;
    }
  }

  // Calculate Threshold Gate (Anti-Hallucination)
  const totalCore = coreTerms.length;
  let isRelevant = false;

  if (targetDocIds && targetDocIds.includes(chunk.document_id)) {
    // If user specifically asked about this document or subject, lower keyword barrier
    isRelevant = score >= 20;
  } else if (intent === QueryIntent.DATE_TIME && conceptMatches >= 2 && (exactRawMatches >= 1 || combined.includes('jam') || combined.includes('waktu'))) {
    isRelevant = score >= 25;
  } else if (intent === QueryIntent.FINANCIAL && (exactRawMatches >= 1 || conceptMatches >= 2) && /\b(?:rp|rupiah|anggaran|biaya|dana|tunjangan)\b/i.test(chunkText)) {
    isRelevant = score >= 25;
  } else if (totalCore === 1) {
    isRelevant = exactRawMatches >= 1 && score >= 15;
  } else if (totalCore === 2) {
    isRelevant = (exactRawMatches >= 2 || (exactRawMatches >= 1 && conceptMatches >= 1)) && score >= 20;
  } else if (totalCore >= 3) {
    const coverage = (exactRawMatches + stemMatches + Math.min(conceptMatches, 2)) / totalCore;
    isRelevant = (coverage >= 0.5 && exactRawMatches >= 1) || score >= 35;
  }

  return {
    score,
    isRelevant,
    exactRawMatches,
    stemMatches,
    conceptMatches,
    matchedTerms
  };
}

/**
 * Selects the chunks that will be sent to the LLM for context.
 * One chunk per unique document, max 2 documents.
 * Used by both buildDocumentContext and source attribution.
 */
export function selectContextChunks(topChunks) {
  if (!topChunks || topChunks.length === 0) return [];
  const uniqueByDoc = [];
  const seenDocs = new Set();
  for (const c of topChunks) {
    if (!seenDocs.has(c.document_id)) {
      seenDocs.add(c.document_id);
      uniqueByDoc.push(c);
      if (uniqueByDoc.length >= 2) break;
    }
  }
  return uniqueByDoc.length > 0 ? uniqueByDoc : topChunks.slice(0, 2);
}

/**
 * Builds coherent document context for LLM with clear source anchors
 */
export function buildDocumentContext(topChunks) {
  const selected = selectContextChunks(topChunks);
  return selected.map((c) => {
    const textSnippet = c.text.length > 200 ? c.text.slice(0, 200).trim() + '...' : c.text.trim();
    return `[${c.document_name}${c.section ? ' - ' + c.section : ''}]:\n${textSnippet}`;
  }).join('\n\n');
}

/**
 * Enhanced Document Intelligence System Prompts for LLM Reasoning
 */
export function buildGroundedPrompts(question, contextText, queryAnalysis) {
  const systemPrompt = `Kamu adalah ATLAS, asisten Document Intelligence. Jawab pertanyaan pengguna HANYA berdasarkan konteks dokumen yang diberikan. Jika informasi tidak ada di dokumen, katakan tidak ditemukan. Jangan mengarang. Sebutkan sumber dokumen.`;

  const userPrompt = `DOKUMEN:
${contextText}

PERTANYAAN: ${question}

Jawab dengan akurat dan ringkas berdasarkan dokumen di atas.`;

  return { systemPrompt, userPrompt };
}
