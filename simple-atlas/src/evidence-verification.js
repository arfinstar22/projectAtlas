const SYNONYMS = {
  pegawai: ['karyawan', 'pekerja', 'staf', 'staff', 'tenaga kerja'],
  karyawan: ['pegawai', 'pekerja', 'staf', 'staff', 'tenaga kerja'],
  mulai: ['dimulai', 'masuk', 'awal', 'pukul', 'jam'],
  masuk: ['mulai', 'dimulai', 'kerja', 'pukul', 'jam'],
  bekerja: ['kerja', 'operasional', 'jam kerja', 'waktu kerja'],
  biaya: ['anggaran', 'dana', 'alokasi', 'pengeluaran', 'harga', 'rupiah'],
  anggaran: ['biaya', 'dana', 'alokasi', 'keuangan', 'pengeluaran'],
  software: ['perangkat lunak', 'aplikasi', 'sistem', 'program'],
  skripsi: ['penelitian', 'tugas akhir', 'riset', 'studi'],
  metodologi: ['metode', 'pendekatan', 'tahapan', 'prosedur', 'eksperimen'],
  praktikum: ['modul', 'laboratorium', 'jaringan', 'vlan', 'ospf', 'routing'],
  tahunan: ['bulanan', 'per bulan', 'per tahun', 'setahun', 'sebulan'],
  bulanan: ['tahunan', 'per bulan', 'per tahun', 'setahun', 'sebulan']
};

const STOP_WORDS = new Set([
  'apakah', 'ada', 'tahun', 'cari', 'dokumen', 'tentang', 'apa', 'yang', 'ini', 'itu',
  'adakah', 'pada', 'di', 'ke', 'dari', 'untuk', 'dengan', 'dan', 'atau', 'dalam',
  'tolong', 'kapan', 'berapa', 'siapa', 'mana', 'jelaskan', 'sebutkan', 'mohon',
  'bandingkan', 'perbandingan', 'data', 'informasi', 'berikut', 'tersebut',
  'saya', 'ingin', 'tapi', 'lupa', 'nama', 'dokumennya', 'tentang',
  'bagaimana', 'bisakah', 'kemungkinan', 'terkait', 'berkaitan',
  'seluruh', 'semua', 'sebagian', 'beberapa', 'mengenai', 'perihal',
  'akhirnya', 'tersebutnya', 'terakhir', 'sebelumnya', 'berikut',
  'masing', 'halnya', 'pihak', 'umum', 'inti', 'warna', 'ukuran', 'gambar', 'isi',
  'rinci', 'detail', 'singkat', 'rumusan', 'telaah', 'tinjauan'
]);

export function buildEvidenceMatrix(candidates = [], querySemantics, allDocs = []) {
  const requirements = querySemantics.atomicRequirements || [];
  const matrix = requirements.map(requirement => createMatrixRow(requirement));

  if (querySemantics.isOutOfScope || candidates.length === 0) {
    return emptyEvidenceResult(matrix);
  }

  const verifiedChunks = [];
  const relatedChunks = [];
  const facts = { currencies: [], years: [], times: [], persons: [], values: [] };

  for (const candidate of candidates) {
    const evaluation = evaluateCandidate(candidate, querySemantics, matrix);

    facts.currencies.push(...evaluation.facts.currencies);
    facts.years.push(...evaluation.facts.years);
    facts.times.push(...evaluation.facts.times);
    facts.persons.push(...evaluation.facts.persons);
    facts.values.push(...evaluation.facts.values);

    for (const result of evaluation.requirementResults) {
      const row = matrix.find(item => item.requirementId === result.requirementId);
      if (row) row.evidence.push(result);
    }

    if (evaluation.directRequirementIds.length > 0) {
      verifiedChunks.push({
        ...candidate,
        evidenceScore: evaluation.score,
        directRequirementIds: evaluation.directRequirementIds,
        verificationReason: evaluation.reason
      });
    } else if (evaluation.relatedRequirementIds.length > 0) {
      relatedChunks.push({
        ...candidate,
        evidenceScore: evaluation.score,
        relatedRequirementIds: evaluation.relatedRequirementIds,
        relatedReason: evaluation.reason
      });
    }
  }

  finalizeMatrix(matrix);

  for (const key of Object.keys(facts)) {
    facts[key] = [...new Set(facts[key])];
  }

  return {
    verifiedChunks: dedupeChunks(verifiedChunks),
    relatedChunks: dedupeChunks(relatedChunks),
    requirementMatrix: matrix,
    extractedFacts: facts,
    contradictions: detectContradictions(verifiedChunks),
    overallEvidenceStrength: calculateEvidenceStrength(matrix)
  };
}

function createMatrixRow(requirement) {
  return {
    requirementId: requirement.id,
    target: requirement.target,
    category: requirement.category,
    requiredAttribute: requirement.requiredAttribute,
    expectedEvidenceType: requirement.expectedEvidenceType,
    temporalYear: requirement.temporalYear || null,
    status: 'NOT_FOUND',
    confidence: 0,
    evidence: [],
    verifiedSources: [],
    relatedSources: [],
    snippet: ''
  };
}

function emptyEvidenceResult(matrix) {
  return {
    verifiedChunks: [],
    relatedChunks: [],
    requirementMatrix: matrix,
    extractedFacts: { currencies: [], years: [], times: [], persons: [], values: [] },
    contradictions: [],
    overallEvidenceStrength: 0
  };
}

function evaluateCandidate(candidate, semantics, matrix) {
  const text = candidate.text || '';
  const documentName = candidate.document_name || '';
  const section = candidate.section || '';
  const normalized = `${text} ${documentName} ${section}`.toLowerCase();
  const facts = extractFacts(text);
  const baseScore = candidate.intelligenceScore || candidate.finalScore || candidate.score || 0;
  const requirementResults = [];
  const directRequirementIds = [];
  const relatedRequirementIds = [];

  for (const row of matrix) {
    const result = evaluateRequirement(row, normalized, text, documentName, facts, semantics, baseScore);
    requirementResults.push(result);
    if (result.directness === 'DIRECT') directRequirementIds.push(row.requirementId);
    if (result.directness === 'RELATED') relatedRequirementIds.push(row.requirementId);
  }

  return {
    score: baseScore,
    facts,
    requirementResults,
    directRequirementIds,
    relatedRequirementIds,
    reason: directRequirementIds.length > 0
      ? 'Memiliki bukti langsung untuk requirement yang diminta.'
      : 'Hanya memiliki bukti terkait atau tidak langsung.'
  };
}

function evaluateRequirement(requirement, normalized, text, documentName, facts, semantics, baseScore) {
  const temporal = evaluateTemporal(requirement, text, documentName, facts.years, semantics);
  const topic = evaluateTopic(requirement.target, normalized);
  const attribute = evaluateAttribute(requirement.requiredAttribute, text, facts, topic.matched);

  let directness = 'NONE';
  let confidence = 0;
  let reason = '';

  if (semantics.isPersonalData || requirement.requiredAttribute === 'personal_data') {
    const explicitProfile = /\b(?:umur|usia)\s*[:=]?\s*\d{1,2}\s*tahun\b/i.test(text);
    if (explicitProfile) {
      directness = 'DIRECT';
      confidence = 0.9;
      reason = 'Data pribadi disebutkan secara eksplisit.';
    } else if (topic.matched) {
      directness = 'RELATED';
      confidence = 0.3;
      reason = 'Dokumen terkait dengan subjek, tetapi tidak memuat data pribadi yang diminta.';
    }
  } else if (topic.matched && attribute.found && temporal.matched) {
    directness = 'DIRECT';
    confidence = calibrateConfidence(baseScore, topic.score, attribute.score, temporal.score);
    reason = 'Topik, atribut, dan batasan waktu memenuhi requirement.';
  } else if (topic.matched || attribute.found || temporal.related) {
    directness = 'RELATED';
    confidence = calibrateConfidence(baseScore, topic.score, attribute.score, temporal.score) * 0.55;
    reason = temporal.reason || 'Dokumen terkait, tetapi tidak menyediakan bukti langsung untuk seluruh requirement.';
  }

  return {
    requirementId: requirement.requirementId,
    target: requirement.target,
    directness,
    confidence,
    temporalMatch: temporal.matched,
    semanticMatch: topic.matched,
    attributeMatch: attribute.found,
    evidenceType: requirement.expectedEvidenceType,
    sourceDocument: documentName,
    snippet: text.slice(0, 220).trim(),
    reason
  };
}

function evaluateTopic(target, normalized) {
  const tokens = target
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token) && !/^\d{4}$/.test(token));

  if (tokens.length === 0) return { matched: true, score: 0.5 };

  const matched = tokens.filter(token => matchesTermOrSynonym(token, normalized));
  const ratio = matched.length / tokens.length;

  return {
    matched: tokens.length === 1 ? matched.length >= 1 : ratio >= 0.5,
    score: ratio
  };
}

function matchesTermOrSynonym(term, normalized) {
  const termPattern = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  if (termPattern.test(normalized)) return true;
  // Check if any synonym of the term appears in the normalized text
  if ((SYNONYMS[term] || []).some(synonym => normalized.includes(synonym))) return true;
  // Check if the normalized text contains a word that has this term as a synonym (reverse lookup)
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (syns.includes(term) && normalized.includes(key)) return true;
  }
  return false;
}

function evaluateAttribute(attribute, text, facts, topicMatched) {
  switch (attribute) {
    case 'financial_value':
      return scoreBoolean(facts.currencies.length > 0 || /\b(anggaran|biaya|dana|alokasi|tunjangan|keuangan)\b/i.test(text));
    case 'person_or_role':
      return scoreBoolean(/\b(penanggung\s*jawab|koordinator|manajer|direktur|ketua|pic)\b/i.test(text) && facts.persons.length > 0);
    case 'schedule_time':
      return scoreBoolean(facts.times.length > 0 || /\b(jam kerja|pukul|waktu kerja)\b/i.test(text));
    case 'methodology':
      return scoreBoolean(/\b(metode|metodologi|eksperimental|resnet|cnn|dataset|tahapan|pendekatan)\b/i.test(text));
    case 'conclusion_metric':
      return scoreBoolean(/\b(akurasi|sensitivitas|precision|recall|kesimpulan|temuan|hasil)\b/i.test(text));
    case 'vision_mission':
      return scoreBoolean(/\b(visi|misi|tujuan|sasaran)\b/i.test(text));
    case 'personal_data':
      return scoreBoolean(/\b(?:umur|usia)\s*[:=]?\s*\d{1,2}\s*tahun\b/i.test(text));
    case 'general_fact':
    default:
      return scoreBoolean(topicMatched && text.trim().length > 30);
  }
}

function evaluateTemporal(requirement, text, documentName, years, semantics) {
  const requestedYear = requirement.temporalYear || semantics.temporalConstraints?.primaryYear;
  if (!requestedYear) return { matched: true, related: false, score: 1, reason: '' };

  const containsYear = years.includes(requestedYear) || text.includes(requestedYear);
  const financialNeed = requirement.category === 'FINANCIAL';
  const hasCurrencyData = /Rp\s*[\d.,]+/i.test(text);
  const hasFinancialDocName = /keuangan|anggaran|neraca|laporan\s*keuangan/i.test(documentName);
  const likelyCitation = isCitationOnlyYear(text, requestedYear);

  if (containsYear && !likelyCitation) {
    if (!financialNeed) return { matched: true, related: false, score: 1, reason: '' };
    if (hasFinancialDocName || hasCurrencyData) return { matched: true, related: false, score: 1, reason: '' };
  }

  return {
    matched: false,
    related: containsYear || years.length > 0,
    score: 0,
    reason: `Batasan periode ${requestedYear} tidak dipenuhi sebagai bukti langsung.`
  };
}

function isCitationOnlyYear(text, year) {
  const escaped = year.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const citationPattern = new RegExp(`(?:dkk\\.|et al\\.|studi|menurut|referensi|sumber|\\()[^\\n]{0,90}${escaped}`, 'i');
  const directActivityPattern = new RegExp(`(?:kegiatan|program|agenda|pelaksanaan|laporan|realisasi|anggaran)[^\\n]{0,50}${escaped}`, 'i');
  return citationPattern.test(text) && !directActivityPattern.test(text);
}

function extractFacts(text) {
  return {
    currencies: text.match(/Rp\s*[\d.,]+/gi) || [],
    years: text.match(/\b(?:19\d{2}|20\d{2})\b/g) || [],
    times: text.match(/\b(?:\d{1,2}[.:]\d{2}(?:\s*(?:wib|wita|wit))?|pukul\s*\d{1,2}[.:]\d{2}|jam\s*\d{1,2}[.:]\d{2})\b/gi) || [],
    persons: text.match(/(?:penanggung\s*jawab|koordinator|manajer|direktur|ketua|penyusun|penulis|author|oleh)[\s:]*([A-Z][A-Za-z\s.,]+)/gi) || [],
    values: text.match(/Rp\s*[\d.,]+|[\d.,]+\s*(?:juta|miliar|ribu|%)/gi) || []
  };
}

function scoreBoolean(found) {
  return { found, score: found ? 1 : 0 };
}

function calibrateConfidence(baseScore, topicScore, attributeScore, temporalScore) {
  const retrieval = Math.min(Math.max(baseScore / 100, 0), 1);
  return Math.min(1, (retrieval * 0.35) + (topicScore * 0.3) + (attributeScore * 0.2) + (temporalScore * 0.15));
}

function finalizeMatrix(matrix) {
  for (const row of matrix) {
    const direct = row.evidence.filter(item => item.directness === 'DIRECT');
    const related = row.evidence.filter(item => item.directness === 'RELATED');

    row.verifiedSources = [...new Set(direct.map(item => item.sourceDocument))];
    row.relatedSources = [...new Set(related.map(item => item.sourceDocument))];

    if (direct.length > 0) {
      row.status = 'FOUND';
      row.confidence = Math.max(...direct.map(item => item.confidence));
      row.snippet = direct[0].snippet;
    } else if (related.length > 0) {
      row.status = 'RELATED_BUT_NOT_CONFIRMED';
      row.confidence = Math.max(...related.map(item => item.confidence));
      row.snippet = related[0].snippet;
    }
  }
}

function detectContradictions(chunks) {
  const policyChunks = chunks.filter(chunk => /panduan|sop|kebijakan|aturan/i.test(chunk.document_name || ''));
  if (policyChunks.length < 2) return [];

  const schedules = new Map();
  for (const chunk of policyChunks) {
    const match = chunk.text.match(/\b\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\b/);
    if (match && !schedules.has(chunk.document_name)) schedules.set(chunk.document_name, match[0]);
  }

  const entries = [...schedules.entries()];
  if (entries.length < 2 || entries[0][1] === entries[1][1]) return [];

  return [{
    type: 'SCHEDULE_DISCREPANCY',
    docA: entries[0][0], statementA: entries[0][1],
    docB: entries[1][0], statementB: entries[1][1],
    description: `Perbedaan jadwal kerja antara ${entries[0][0]} dan ${entries[1][0]}.`
  }];
}

function calculateEvidenceStrength(matrix) {
  if (matrix.length === 0) return 0;
  const scores = matrix.map(row => row.confidence || 0);
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function dedupeChunks(chunks) {
  const seen = new Set();
  return chunks.filter(chunk => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
}

export const verifyEvidenceCandidates = buildEvidenceMatrix;
