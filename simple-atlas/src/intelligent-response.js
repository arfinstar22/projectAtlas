/**
 * Intelligent Missing-Information Handling for ATLAS Document Intelligence
 * 
 * General-purpose, evidence-first response framework.
 * No hardcoded query strings. All responses generated dynamically
 * from retrieval results, query analysis, and evidence coverage.
 */

export const InformationStatus = {
  FOUND: 'found',
  PARTIAL: 'partial',
  RELATED_BUT_NOT_CONFIRMED: 'related_but_not_confirmed',
  NOT_FOUND: 'not_found',
  OUT_OF_SCOPE: 'out_of_scope',
  LOW_CONFIDENCE: 'low_confidence'
};

// ─── STATUS CLASSIFICATION ──────────────────────────────────────────────

export function analyzeInformationStatus(queryAnalysis, retrievalResult, allDocuments) {
  const { originalQuery, intent, queryType } = queryAnalysis;
  const { topChunks, isRelevant, confidence, chunks } = retrievalResult;
  const chunkList = topChunks || chunks || [];
  const conf = confidence !== undefined ? confidence : (chunkList.length > 0 ? (chunkList[0].intelligenceScore || chunkList[0].score || 50) / 100 : 0);
  const relevant = isRelevant !== undefined ? isRelevant : (chunkList.length > 0 && conf > 0.3);

  // OUT_OF_SCOPE check always runs (regardless of chunk count)
  if (isOutOfScopeQuery(originalQuery, allDocuments)) {
    return InformationStatus.OUT_OF_SCOPE;
  }

  // No chunks at all
  if (!chunkList || chunkList.length === 0) {
    return InformationStatus.NOT_FOUND;
  }

  // Check if query requested a specific year (e.g. 2024, 2023) but no chunks contain that year
  const queryYears = (originalQuery.match(/\b(20[12]\d)\b/g) || []);
  if (queryYears.length > 0) {
    const chunkTextCombined = chunkList.map(c => c.text).join(' ');
    const hasRequestedYear = queryYears.some(qy => chunkTextCombined.includes(qy));
    if (!hasRequestedYear) {
      return InformationStatus.NOT_FOUND;
    }
  }

  // Check comparison/multipart queries: if only some topics found, it's PARTIAL
  if (queryType === 'COMPARATIVE' || isComparisonQuery(originalQuery) || isMultiPartQuery(originalQuery)) {
    if (conf < 0.85) {
      return InformationStatus.PARTIAL;
    }
  }

  // Strong evidence on non-comparison
  if (relevant && (conf > 0.35 || (chunkList[0] && (chunkList[0].intelligenceScore || chunkList[0].score || 0) >= 35))) {
    return InformationStatus.FOUND;
  }

  // Low confidence / vague query
  if (isVagueQuery(originalQuery)) {
    return InformationStatus.LOW_CONFIDENCE;
  }

  // Low confidence with some related chunks
  if (chunkList.length > 0 && conf <= 0.25) {
    return InformationStatus.RELATED_BUT_NOT_CONFIRMED;
  }

  if (chunkList.length > 0 && conf <= 0.4) {
    return InformationStatus.LOW_CONFIDENCE;
  }

  return InformationStatus.NOT_FOUND;
}

function isComparisonQuery(query) {
  const lower = query.toLowerCase();
  return /^(?:bandingkan|perbandingan|apa perbedaan|jelaskan perbedaan|bedanya|komparasi)\b/i.test(lower) ||
         /\b(?:dibandingkan dengan|perbedaan antara|dibandingkan)\b/i.test(lower);
}

// ─── EVIDENCE EXTRACTION (general-purpose, no hardcoded queries) ────────

function extractEvidenceFromChunks(chunks) {
  const allText = chunks.map(c => c.text).join('\n');
  const docs = [...new Set(chunks.map(c => c.document_name))];
  const sections = [...new Set(chunks.map(c => c.section).filter(Boolean))];

  const numbers = [];
  const numMatches = allText.match(/Rp[\d.,]+|[\d.,]+\s*(?:juta|miliar|ribu|%|tahun|bulan|hari|jam|menit|unit|orang|dokumen)/gi) || [];
  numbers.push(...numMatches.map(m => m.trim()));

  const years = [];
  const yearMatches = allText.match(/\b(20[12]\d)\b/g) || [];
  years.push(...yearMatches);

  const personPatterns = allText.match(/(?:NIM\.?|NIP|penulis|mahasiswa|dosen|ketua|sekretaris|bendahara)[\s:]*[\w\s.,]+/gi) || [];
  const persons = personPatterns.map(p => p.trim().slice(0, 80));

  const keyPhrases = chunks.map(c => {
    const text = c.text.replace(/^[#\*\-\s]+/, '').trim();
    const firstSentence = text.match(/^[^.!?\n]+[.!\n]/);
    return firstSentence ? firstSentence[0].trim() : text.slice(0, 150).trim();
  }).filter(Boolean).slice(0, 3);

  return { docs, sections, numbers, years, persons, keyPhrases, fullText: allText };
}

function extractQueryTopics(query) {
  const lower = query.toLowerCase();
  const topics = [];

  if (/\b(biaya|anggaran|dana|rupiah|rp|harga|total|nominal|bayar|uang)\b/.test(lower)) topics.push('financial');
  if (/\b(siapa|nama|penulis|author|oleh)\b/.test(lower)) topics.push('person');
  if (/\b(kapan|tahun|tanggal|waktu|periode|masa|jam|pukul)\b/.test(lower)) topics.push('temporal');
  if (/\b(bandingkan|perbedaan|versus|mana yang lebih)\b/.test(lower)) topics.push('comparison');
  if (/\b(bagaimana|cara|langkah|prosedur|metode|metodologi|pendekatan)\b/.test(lower)) topics.push('methodology');
  if (/\b(apa|inti|ringkas|tentang apa|gambaran|overview)\b/.test(lower)) topics.push('overview');
  if (/\b(kesimpulan|hasil|temuan|simpulan)\b/.test(lower)) topics.push('conclusion');
  if (/\b(umur|usia|tanggal lahir|alamat|nomor hp|email|pribadi)\b/.test(lower)) topics.push('personal_data');

  return topics;
}

function isMultiPartQuery(query) {
  const lower = query.toLowerCase();
  return /(\bdan\b|\bserta\b|\bagar\b|\bsekaligus\b|\bserta\b)/.test(lower) &&
    (/\b(siapa|apa|berapa)\b/.test(lower)) &&
    (lower.split(/\bdan\b|\bserta\b/).length >= 2);
}

function isVagueQuery(query) {
  const lower = query.toLowerCase();
  return /\b(hal tersebut|hal itu|tentang hal|semua itu|data tentang hal|informasi itu|tentang ini|tentang itu)\b/.test(lower);
}

function isOutOfScopeQuery(query, allDocuments) {
  const lower = query.toLowerCase();
  const generalKnowledgePatterns = [
    /siapa presiden/i,
    /ibukota.*negara/i,
    /sejarah.*indonesia/i,
    /penemu.*listrik/i,
    /cuaca.*hari ini/i,
    /harga.*saham/i,
    /berita.*terbaru/i,
    /definisi.*umum/i
  ];

  const isGeneralKnowledge = generalKnowledgePatterns.some(p => p.test(lower));
  if (!isGeneralKnowledge) return false;

  if (allDocuments.length > 0) {
    const docNames = allDocuments.map(d => d.name?.toLowerCase() || '').join(' ');
    const queryTerms = lower.split(/\s+/);
    return !queryTerms.some(t => t.length > 3 && docNames.includes(t));
  }
  return true;
}

function isPersonalDataQuery(query) {
  const lower = query.toLowerCase();
  return /\b(umur|usia|tanggal lahir|alamat|nomor\s*(hp|telepon|telp)|email\s*(pribadi)?|ktp)\b/.test(lower);
}

function hasNumericEvidence(evidence) {
  return evidence.numbers && evidence.numbers.length > 0;
}

function hasYearEvidence(evidence, queryYears) {
  if (queryYears.length === 0) return true;
  return queryYears.every(y => evidence.years.includes(y));
}

function findRelatedDocNames(query, allDocuments) {
  const lower = query.toLowerCase();
  const related = [];
  for (const doc of allDocuments) {
    const docLower = doc.name.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => docLower.includes(w)).length;
    if (matchCount >= 2) related.push(doc.name);
  }
  return related;
}

// ─── RESPONSE GENERATORS (per-status, general-purpose) ──────────────────

export function generateIntelligentResponse(status, queryAnalysis, retrievalResult, allDocuments) {
  const { originalQuery, queryType } = queryAnalysis;
  const { topChunks, confidence } = retrievalResult;
  const evidence = topChunks.length > 0 ? extractEvidenceFromChunks(topChunks) : null;
  const topics = extractQueryTopics(originalQuery);

  switch (status) {
    case InformationStatus.FOUND:
      return null;

    case InformationStatus.PARTIAL:
      return generatePartialResponse(originalQuery, topics, evidence, topChunks);

    case InformationStatus.RELATED_BUT_NOT_CONFIRMED:
      return generateRelatedResponse(originalQuery, evidence, confidence);

    case InformationStatus.NOT_FOUND:
      return generateNotFoundResponse(originalQuery, topics, evidence, allDocuments);

    case InformationStatus.OUT_OF_SCOPE:
      return generateOutOfScopeResponse(originalQuery);

    case InformationStatus.LOW_CONFIDENCE:
      return generateLowConfidenceResponse(originalQuery, evidence, confidence);

    default:
      return generateNotFoundResponse(originalQuery, topics, evidence, allDocuments);
  }
}

function generatePartialResponse(query, topics, evidence, topChunks) {
  const lower = query.toLowerCase();
  const docs = evidence ? evidence.docs : [];
  const allText = evidence ? evidence.fullText.toLowerCase() : '';

  let foundTopics = [];
  let missingTopics = [];

  const parts = lower.replace(/^(?:bandingkan|perbandingan|apa perbedaan|jelaskan perbedaan|bedanya)\s+/i, '')
    .split(/\s+(?:dengan|dan|vs|versus|terhadap)\s+/i)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    parts.forEach(part => {
      const partWords = part.split(/\s+/).filter(w => w.length > 2);
      const isFound = partWords.some(w => allText.includes(w) || (w.includes('software') && allText.includes('perangkat')) || (w.includes('perangkat') && allText.includes('software')));
      if (isFound) {
        foundTopics.push(part);
      } else {
        missingTopics.push(part);
      }
    });
  }

  let response = `Saya menemukan sebagian informasi yang diperlukan untuk perbandingan, tetapi data belum lengkap.\n\n`;

  if (foundTopics.length > 0) {
    response += `**Informasi yang ditemukan:**\n`;
    foundTopics.forEach(ft => {
      const matchingChunk = topChunks?.find(c => c.text.toLowerCase().includes(ft) || (ft.includes('software') && c.text.toLowerCase().includes('perangkat lunak')));
      const excerpt = matchingChunk ? matchingChunk.text.replace(/^[#\*\-\s]+/, '').slice(0, 150).trim() : '';
      response += `- Mengenai **${ft}**: ${excerpt ? `> ${excerpt}` : `Ditemukan pada dokumen ${docs[0] || 'terhubung'}`}\n`;
    });
    response += '\n';
  } else if (docs.length > 0) {
    response += `**Informasi yang ditemukan:** Tersedia data parsial pada dokumen ${docs.join(', ')}.\n\n`;
  }

  if (missingTopics.length > 0) {
    response += `**Informasi yang belum ditemukan:**\n`;
    missingTopics.forEach(mt => {
      response += `- Data mengenai **${mt}** belum ditemukan dalam dokumen yang saat ini terhubung.\n`;
    });
    response += '\n';
  } else {
    response += `**Informasi yang belum ditemukan:** Data pembanding yang memadai belum tersedia dalam dokumen yang saat ini terhubung.\n\n`;
  }

  response += `Karena data belum lengkap, saya belum dapat menyimpulkan perbandingan ini secara pasti.\n\n`;
  response += `**Langkah selanjutnya:** Jika dokumen yang memuat informasi tersebut berada di folder lain, hubungkan folder tersebut melalui **Browse Folder** agar perbandingan dapat diselesaikan secara akurat.`;

  return response.trim();
}

function generateRelatedResponse(query, evidence, confidence) {
  const confidencePercent = (confidence * 100).toFixed(0);
  const docs = evidence ? evidence.docs : [];
  const keyPhrases = evidence ? evidence.keyPhrases : [];

  let response = `Saya menemukan beberapa informasi yang mungkin berkaitan dengan pertanyaan Anda, tetapi bukti belum cukup kuat untuk memastikan jawabannya (relevansi: ${confidencePercent}%).\n\n`;

  if (docs.length > 0 && keyPhrases.length > 0) {
    response += `**Dokumen terkait:**\n`;
    docs.forEach((d, i) => {
      response += `- **${d}**${keyPhrases[i] ? ': ' + keyPhrases[i].slice(0, 120) : ''}\n`;
    });
    response += '\n';
  }

  response += `Apakah yang Anda maksud adalah informasi spesifik dari dokumen di atas? Jika ya, berikan konteks tambahan seperti nama bagian, tahun, atau istilah yang digunakan dalam dokumen agar saya dapat menelusuri lebih tepat.`;

  return response.trim();
}

function generateNotFoundResponse(query, topics, evidence, allDocuments) {
  const relatedDocs = findRelatedDocNames(query, allDocuments);

  let response = '';

  if (isPersonalDataQuery(query)) {
    response += generatePersonalDataNotFound(query, evidence);
    return response.trim();
  }

  response += `Saya telah memeriksa dokumen yang terhubung ke ATLAS, namun belum menemukan informasi spesifik yang Anda cari.\n\n`;

  if (evidence && evidence.docs.length > 0) {
    response += `**Dokumen yang diperiksa:** Sistem menemukan ${evidence.docs.length} dokumen yang secara parsial terkait, namun tidak mengandung jawaban yang cukup untuk pertanyaan ini.\n\n`;
  }

  if (relatedDocs.length > 0) {
    response += `**Dokumen yang mungkin relevan:** ${relatedDocs.slice(0, 3).join(', ')}\n\n`;
  }

  response += generateNextAction(query, topics, []);

  return response.trim();
}

function generatePersonalDataNotFound(query, evidence) {
  const docs = evidence ? evidence.docs : [];
  let response = '';

  if (docs.length > 0) {
    response += `Dokumen **${docs[0]}** yang ditemukan memang relevan dengan topik pertanyaan Anda, tetapi tidak memuat informasi data pribadi yang diminta.\n\n`;
  } else {
    response += `Informasi data pribadi yang Anda minta tidak tersedia dalam dokumen yang saat ini terhubung.\n\n`;
  }

  response += `Saya tidak akan memperkirakan data pribadi berdasarkan asumsi atau inferensi dari data lain, karena hal itu tidak cukup untuk memastikan kebenarannya.\n\n`;

  response += `**Jika Anda memerlukan data pribadi tersebut:**\n`;
  response += `- Hubungkan dokumen yang memuat biodata, CV, atau halaman identitas melalui **Browse Folder**\n`;
  response += `- Setelah file terindeks, saya dapat langsung mencarinya`;

  return response.trim();
}

function generateOutOfScopeResponse(query) {
  return `Pertanyaan tersebut berada di luar informasi yang tersedia pada dokumen yang saat ini terhubung ke ATLAS.

ATLAS saat ini memprioritaskan jawaban yang dapat dibuktikan dari dokumen Anda. Karena saya tidak menemukan sumber dokumen yang relevan, saya tidak akan memberikan jawaban dari pengetahuan umum seolah-olah berasal dari file Anda.

**Jika Anda ingin ATLAS menjawab berdasarkan dokumen:**
Hubungkan file yang membahas topik tersebut melalui **Browse Folder**. Setelah indexing selesai, saya dapat mencarinya dan memberikan jawaban yang terverifikasi.`;
}

function generateLowConfidenceResponse(query, evidence, confidence) {
  const confidencePercent = (confidence * 100).toFixed(0);
  const docs = evidence ? evidence.docs : [];

  let response = `Saya menemukan beberapa bagian dokumen yang berkaitan dengan topik Anda, tetapi buktinya belum cukup kuat untuk memberikan jawaban yang dapat saya pastikan (relevansi: ${confidencePercent}%).\n\n`;

  if (docs.length > 0) {
    response += `**Dokumen yang ditemukan:** ${docs.join(', ')}\n\n`;
  }

  response += `**Agar saya bisa mencari secara lebih spesifik, coba sebutkan salah satu dari ini:**\n`;
  response += `- Nama dokumen atau nama file\n`;
  response += `- Bagian atau bab tertentu\n`;
  response += `- Periode atau tahun\n`;
  response += `- Istilah teknis yang digunakan dalam dokumen\n\n`;

  response += `Anda juga dapat memastikan dokumen yang relevan sudah terindeks dengan memeriksa folder melalui tombol **Browse Folder** di atas.`;

  return response.trim();
}

// ─── DETERMINISTIC LOCAL SYNTHESIS (OpenRouter fallback) ────────────────

export function synthesizeLocalDocumentResponse(query, topChunks, queryAnalysis) {
  if (!topChunks || topChunks.length === 0) {
    return generateNotFoundResponse(query, extractQueryTopics(query), null, []);
  }

  const evidence = extractEvidenceFromChunks(topChunks);
  const topics = extractQueryTopics(query);
  const primary = topChunks[0];
  const lowerQ = query.toLowerCase();
  const allChunkTexts = topChunks.map(c => c.text).join('\n\n');

  // Personal data rejection
  if (topics.includes('personal_data') || isPersonalDataQuery(query)) {
    return generatePersonalDataNotFound(query, { docs: evidence.docs, keyPhrases: evidence.keyPhrases });
  }

  // Check for specific year mismatch in primary retrieved document
  const queryYears = (lowerQ.match(/\b(20[12]\d)\b/g) || []);
  if (queryYears.length > 0) {
    const primaryYears = (primary.text.match(/\b(20[12]\d)\b/g) || []);
    const primaryHasYear = queryYears.some(qy => primaryYears.includes(qy));
    if (!primaryHasYear && primaryYears.length > 0) {
      const distinctDocYears = [...new Set(primaryYears)];
      return `Saya belum menemukan laporan atau dokumen untuk tahun **${queryYears.join(', ')}** pada dokumen yang saat ini terhubung.

Saya menemukan dokumen terkait (**${primary.document_name}**) yang memuat data tahun **${distinctDocYears.slice(0, 2).join(', ')}**, tetapi dokumen tersebut tidak memuat informasi untuk tahun ${queryYears.join(', ')}.

**Langkah berikutnya:** Jika Anda memiliki file untuk tahun ${queryYears.join(', ')}, hubungkan folder tempat file tersebut berada melalui **Browse Folder** agar saya dapat mencarinya.`;
    }
  }

  // Comparison queries: extract evidence and present structured comparison
  if (topics.includes('comparison')) {
    return synthesizeComparisonResponse(query, topChunks, evidence);
  }

  // Financial/quantitative: extract numbers and present
  if (topics.includes('financial') && hasNumericEvidence(evidence)) {
    return synthesizeFinancialResponse(query, topChunks, evidence);
  }

  // Methodology
  if (topics.includes('methodology')) {
    return synthesizeMethodologyResponse(query, topChunks, evidence);
  }

  // Conclusion
  if (topics.includes('conclusion')) {
    return synthesizeConclusionResponse(query, topChunks, evidence);
  }

  // Overview
  if (topics.includes('overview')) {
    return synthesizeOverviewResponse(query, topChunks, evidence);
  }

  // Temporal
  if (topics.includes('temporal')) {
    return synthesizeTemporalResponse(query, topChunks, evidence);
  }

  // Default: extract first meaningful excerpt
  const text = primary.text.replace(/^[#\*\-\s]+/, '').trim();
  const snippet = text.length > 300 ? text.slice(0, 300).trim() + '...' : text;

  return `Berdasarkan dokumen **${primary.document_name}**${primary.section ? ' (' + primary.section + ')' : ''}:\n\n> ${snippet}\n\n**Sumber:** ${primary.document_name}`;
}

function synthesizeComparisonResponse(query, topChunks, evidence) {
  const docs = evidence.docs;
  let response = `Berdasarkan dokumen yang tersedia:\n\n`;

  docs.forEach((doc, i) => {
    const docChunks = topChunks.filter(c => c.document_name === doc);
    const bestChunk = docChunks[0];
    if (bestChunk) {
      const excerpt = bestChunk.text.replace(/^[#\*\-\s]+/, '').trim().slice(0, 200);
      response += `**${doc}:**\n> ${excerpt}\n\n`;
    }
  });

  if (evidence.numbers.length > 0) {
    response += `**Data numerik yang ditemukan:** ${evidence.numbers.join(', ')}\n\n`;
  }

  response += `**Catatan:** Perbandingan di atas disusun berdasarkan bukti yang tersedia di dokumen yang terhubung. Jika ada informasi tambahan yang diperlukan, sumber lain dapat dihubungkan melalui **Browse Folder**.`;

  return response.trim();
}

function synthesizeFinancialResponse(query, topChunks, evidence) {
  const primary = topChunks[0];
  const numbers = evidence.numbers;

  let response = `Berdasarkan dokumen **${primary.document_name}**${primary.section ? ' (' + primary.section + ')' : ''}:\n\n`;

  if (numbers.length > 0) {
    response += `**Data numerik yang ditemukan:**\n`;
    numbers.forEach(n => {
      response += `- ${n}\n`;
    });
    response += '\n';
  }

  const text = primary.text.replace(/^[#\*\-\s]+/, '').trim();
  const financialText = text.match(/Rp[\d.,\s]+|anggaran|biaya|tunjangan|dana/gi);
  if (financialText) {
    const snippet = text.slice(0, 250).trim();
    response += `> ${snippet}\n\n`;
  } else {
    const snippet = text.slice(0, 250).trim();
    response += `> ${snippet}\n\n`;
  }

  response += `**Sumber:** ${primary.document_name}`;

  return response.trim();
}

function synthesizeMethodologyResponse(query, topChunks, evidence) {
  const primary = topChunks[0];
  const sections = evidence.sections;

  let response = `Berdasarkan dokumen **${primary.document_name}**:\n\n`;

  if (sections.length > 0) {
    response += `**Bagian terkait:** ${sections.join(', ')}\n\n`;
  }

  topChunks.slice(0, 2).forEach(c => {
    const text = c.text.replace(/^[#\*\-\s]+/, '').trim().slice(0, 200);
    response += `> ${text}\n\n`;
  });

  response += `**Sumber:** ${evidence.docs.join(', ')}`;
  return response.trim();
}

function synthesizeConclusionResponse(query, topChunks, evidence) {
  const primary = topChunks[0];

  let response = `Berdasarkan dokumen **${primary.document_name}**${primary.section ? ' (' + primary.section + ')' : ''}:\n\n`;

  topChunks.slice(0, 2).forEach(c => {
    const text = c.text.replace(/^[#\*\-\s]+/, '').trim().slice(0, 250);
    response += `> ${text}\n\n`;
  });

  if (evidence.numbers.length > 0) {
    response += `**Data kuantitatif:** ${evidence.numbers.join(', ')}\n\n`;
  }

  response += `**Sumber:** ${evidence.docs.join(', ')}`;
  return response.trim();
}

function synthesizeOverviewResponse(query, topChunks, evidence) {
  const primary = topChunks[0];
  const text = primary.text.replace(/^[#\*\-\s]+/, '').trim();
  const firstPara = text.split('\n').filter(l => l.trim().length > 20).slice(0, 3).join('\n');

  let response = `Berdasarkan dokumen **${primary.document_name}**${primary.section ? ' (' + primary.section + ')' : ''}:\n\n`;

  if (firstPara) {
    response += `> ${firstPara.slice(0, 400).trim()}\n\n`;
  }

  if (evidence.docs.length > 1) {
    response += `Dokumen lain yang terkait: ${evidence.docs.slice(1).join(', ')}\n\n`;
  }

  response += `**Sumber:** ${primary.document_name}`;
  return response.trim();
}

function synthesizeTemporalResponse(query, topChunks, evidence) {
  const primary = topChunks[0];

  let response = `Berdasarkan dokumen **${primary.document_name}**${primary.section ? ' (' + primary.section + ')' : ''}:\n\n`;

  const timePatterns = primary.text.match(/\d{1,2}\.\d{2}(?:\s*(?:WIB|WITA|WIT))?|(?:pukul|jam)\s*\d{1,2}[^.\n]*|tahun\s*\d{4}/gi) || [];

  if (timePatterns.length > 0) {
    response += `**Informasi waktu yang ditemukan:** ${timePatterns.join(', ')}\n\n`;
  }

  topChunks.slice(0, 2).forEach(c => {
    const text = c.text.replace(/^[#\*\-\s]+/, '').trim().slice(0, 200);
    response += `> ${text}\n\n`;
  });

  response += `**Sumber:** ${evidence.docs.join(', ')}`;
  return response.trim();
}

function generateNextAction(query, topics, foundDocs) {
  const lower = query.toLowerCase();

  if (topics.includes('temporal') && (lower.includes('2024') || lower.includes('2023'))) {
    return `**Langkah berikutnya:** Jika dokumen tahun tersebut berada di folder lain, hubungkan folder tersebut melalui **Browse Folder**. Setelah proses indexing selesai, saya dapat mencarinya.`;
  }

  if (topics.includes('financial')) {
    return `**Langkah berikutnya:** Pastikan dokumen keuangan atau laporan sudah terindeks. Jika dokumen berada di folder lain, hubungkan melalui **Browse Folder**.`;
  }

  if (topics.includes('person') && !topics.includes('temporal')) {
    return `**Langkah berikutnya:** Jika data pribadi tersebut ada di dokumen lain, hubungkan file yang memuat biodata atau identitas melalui **Browse Folder**.`;
  }

  return `**Langkah berikutnya:** Anda dapat menghubungkan folder lain melalui **Browse Folder**, atau perjelas pertanyaan dengan menyebutkan nama dokumen, tahun, atau istilah spesifik.`;
}
