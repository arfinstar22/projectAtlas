/**
 * Generic Query Decomposition & Semantic Parser for ATLAS Document Intelligence
 * 
 * Decomposes complex user queries into atomic requirements, targets, temporal constraints,
 * expected evidence types, and logical relations.
 */

import {
  QueryIntent,
  detectQueryIntent,
  extractCoreQueryTerms,
  expandQueryConcepts,
  identifyTargetDocumentReferences,
  isFollowUpQuestion
} from './rag-pipeline.js';

import {
  classifyQueryType,
  assessQueryComplexity,
  detectMultiDocumentNeed
} from './document-intelligence.js';

export function parseAndDecomposeQuery(question, conversationContext = null, allDocs = []) {
  const cleanQ = (question || '').trim();
  const lowerQ = cleanQ.toLowerCase();

  // 1. Intent classification
  const intent = detectQueryIntent(cleanQ);

  // 2. Term extraction & concept expansion
  const coreTerms = extractCoreQueryTerms(cleanQ);
  const expandedConcepts = expandQueryConcepts(cleanQ, coreTerms, intent);

  // 3. Document target references
  let targetDocIds = identifyTargetDocumentReferences(cleanQ, allDocs);
  let inheritedContext = false;
  let contextualQuery = cleanQ;

  const isFollowUp = isFollowUpQuestion(cleanQ);
  if (isFollowUp && conversationContext?.lastDocIds?.length > 0) {
    if (targetDocIds.length > 0) {
      // Rule 7: explicit doc reference in Q2 overrides inherited context
    } else {
      targetDocIds = [...new Set(conversationContext.lastDocIds)];
      inheritedContext = true;
      // Enrich FTS query with context from Q1 for better retrieval
      if (conversationContext.lastDocNames?.length > 0) {
        contextualQuery = `${cleanQ} ${conversationContext.lastDocNames.join(' ')}`;
      }
    }
  }

  // 4. Temporal constraints (year, quarter, month, period, relative terms)
  const temporalConstraints = extractTemporalConstraints(cleanQ);

  // 5. Comparison targets decomposition
  const comparisonTargets = extractComparisonTargets(cleanQ, intent);

  // 6. Generic Atomic Requirements Decomposition
  const atomicRequirements = decomposeIntoAtomicRequirements(cleanQ, intent, comparisonTargets, temporalConstraints);

  // 7. General classification flags
  const isOutOfScope = checkIsOutOfScope(cleanQ, allDocs);
  const isPersonalData = checkIsPersonalData(cleanQ, atomicRequirements);
  const isVagueOrAmbiguous = checkIsVagueOrAmbiguous(cleanQ, coreTerms, targetDocIds, inheritedContext);
  const userAssumption = detectUserAssumption(cleanQ);

  return {
    rawQuestion: cleanQ,
    normalizedQuestion: lowerQ.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(),
    originalQuery: cleanQ,
    intent,
    queryType: classifyQueryType(cleanQ),
    complexity: assessQueryComplexity(cleanQ),
    requiresMultiDocument: detectMultiDocumentNeed(cleanQ),
    coreTerms,
    expandedConcepts,
    targetDocIds,
    inheritedContext,
    temporalConstraints,
    comparisonTargets,
    atomicRequirements,
    isOutOfScope,
    isPersonalData,
    isVagueOrAmbiguous,
    userAssumption,
    contextualQuery,
    conversationContext
  };
}

/**
 * Decomposes complex/multi-part questions into atomic verifiable requirements
 */
function decomposeIntoAtomicRequirements(query, intent, comparisonTargets, temporalConstraints) {
  const requirements = [];
  const lower = query.toLowerCase();

  // Mode A: Comparison Query -> Decompose into requirement per target
  if (comparisonTargets.isComparison && comparisonTargets.targetA && comparisonTargets.targetB) {
    requirements.push({
      id: 'req_target_a',
      target: comparisonTargets.targetA,
      category: determineRequirementCategory(comparisonTargets.targetA),
      expectedEvidenceType: determineEvidenceTypeForText(comparisonTargets.targetA),
      requiredAttribute: extractPrimaryAttribute(comparisonTargets.targetA),
      temporalYear: temporalConstraints.primaryYear
    });

    requirements.push({
      id: 'req_target_b',
      target: comparisonTargets.targetB,
      category: determineRequirementCategory(comparisonTargets.targetB),
      expectedEvidenceType: determineEvidenceTypeForText(comparisonTargets.targetB),
      requiredAttribute: extractPrimaryAttribute(comparisonTargets.targetB),
      temporalYear: temporalConstraints.primaryYear
    });

    return requirements;
  }

  // Mode B: Multi-part conjunctive query (e.g. "Berapa biaya proyek dan siapa penanggung jawabnya?")
  const conjunctiveParts = splitConjunctiveQuestions(query);
  if (conjunctiveParts.length >= 2) {
    // Check if this is a methodology + reason pair
    const isMethodReasonPair = isMethodologyReasonPair(conjunctiveParts);
    
    conjunctiveParts.forEach((part, idx) => {
      const req = {
        id: `req_part_${idx + 1}`,
        target: part.trim(),
        category: determineRequirementCategory(part),
        expectedEvidenceType: determineEvidenceTypeForText(part),
        requiredAttribute: extractPrimaryAttribute(part),
        temporalYear: temporalConstraints.primaryYear
      };
      
      // If this is the second part of a method+reason pair, link it to the first
      if (isMethodReasonPair && idx === 1) {
        req.linkedTo = 'req_part_1';
        req.linkType = 'REASON_FOR';
        req.category = 'RESEARCH_METHODOLOGY';
        req.requiredAttribute = 'methodology_reason';
        req.expectedEvidenceType = 'RESEARCH_METHODOLOGY';
      }
      
      requirements.push(req);
    });
    return requirements;
  }

  // Mode C: Single Atomic Requirement
  requirements.push({
    id: 'req_primary',
    target: query,
    category: determineRequirementCategory(query),
    expectedEvidenceType: determineEvidenceTypeForText(query),
    requiredAttribute: extractPrimaryAttribute(query),
    temporalYear: temporalConstraints.primaryYear
  });

  return requirements;
}

function splitConjunctiveQuestions(query) {
  const lower = query.toLowerCase();
  if (!/\b(dan|serta|sekaligus)\b/i.test(lower)) return [];

  // Match patterns like "berapa biaya... dan siapa penanggung jawab..."
  const regex = /^(.*?)\s+(?:dan|serta|sekaligus)\s+(.*?)$/i;
  const match = query.match(regex);
  if (match && match[1] && match[2]) {
    const part1 = match[1].trim();
    const part2 = match[2].trim();
    
    // Check if part2 is a short reason/why clause that needs context from part1
    const enrichedPart2 = enrichReasonClause(part1, part2);
    if (enrichedPart2) {
      return [part1, enrichedPart2];
    }
    
    if (part1.length > 5 && part2.length > 5) {
      return [part1, part2];
    }
  }
  return [];
}

/**
 * Detects if part2 is a short "why/reason" clause that needs context from part1.
 * E.g., "mengapa?" -> enriches with subject from part1 to become "mengapa [subject]?"
 */
function enrichReasonClause(part1, part2) {
  const part2Lower = part2.toLowerCase().trim();
  
  // Patterns that indicate a short reason clause needing context
  const reasonPatterns = [
    /^(?:dan\s+)?(?:mengapa|kenapa)\s*\??$/i,
    /^(?:dan\s+)?(?:mengapa|kenapa)\s+(?:tersebut|itu|digunakan|dipakai|dipilih)\s*\??$/i,
    /^(?:serta\s+)?(?:apa\s+)?alasannya\s*\??$/i,
    /^(?:dan\s+)?(?:apa\s+)?alasan(?:nya)?\s*\??$/i,
    /^(?:serta\s+)?alasan\s+pemilihannya\s*\??$/i
  ];
  
  const isReasonClause = reasonPatterns.some(p => p.test(part2Lower));
  if (!isReasonClause) return null;
  
  // Extract subject/object from part1 to enrich part2
  const subjectFromPart1 = extractSubjectFromPart1(part1);
  if (!subjectFromPart1) return null;
  
  // Build enriched part2 with context
  if (/^dan\s+(?:mengapa|kenapa)/i.test(part2)) {
    return `mengapa ${subjectFromPart1}`;
  } else if (/^(?:mengapa|kenapa)/i.test(part2Lower)) {
    return `mengapa ${subjectFromPart1}`;
  } else if (/alasannya/i.test(part2Lower)) {
    return `alasan ${subjectFromPart1}`;
  } else if (/alasan\s+pemilihannya/i.test(part2Lower)) {
    return `alasan pemilihan ${subjectFromPart1}`;
  } else if (/apa\s+alasan/i.test(part2Lower)) {
    return `apa alasan ${subjectFromPart1}`;
  }
  
  return `mengapa ${subjectFromPart1}`;
}

/**
 * Extracts the core subject/object from part1 for use in part2.
 * E.g., "Metode apa yang digunakan dalam skripsi" -> "metode tersebut digunakan"
 */
function extractSubjectFromPart1(part1) {
  const lower = part1.toLowerCase();
  
  // Pattern: [Subject] apa yang [verb] ...
  const subjectMatch = lower.match(/^(\w+)\s+apa\s+yang\s+(\w+)/);
  if (subjectMatch) {
    const subject = subjectMatch[1];
    const verb = subjectMatch[2];
    // Reconstruct with "tersebut" for reference
    return `${subject} tersebut ${verb}`;
  }
  
  // Pattern: Apa [subject] [yang/ini] ...
  const apaSubjectMatch = lower.match(/^apa\s+(\w+)\s+(?:yang|ini|tersebut)/);
  if (apaSubjectMatch) {
    return `${apaSubjectMatch[1]} tersebut`;
  }
  
  // Pattern: [Subject] apa yang dipakai/digunakan/dipilih
  const passiveMatch = lower.match(/^(\w+)\s+apa\s+yang\s+(?:dipakai|digunakan|dipilih)/);
  if (passiveMatch) {
    return `${passiveMatch[1]} tersebut digunakan`;
  }
  
  // Generic: extract first meaningful noun (metode, teknik, algoritma, etc.)
  const methodologyNouns = ['metode', 'metodologi', 'teknik', 'algoritma', 'pendekatan', 'cara', 'strategi'];
  for (const noun of methodologyNouns) {
    if (lower.includes(noun)) {
      return `${noun} tersebut digunakan`;
    }
  }
  
  return null;
}

/**
 * Detects if conjunctive parts form a methodology + reason pair.
 * E.g., ["Metode apa yang digunakan", "mengapa metode tersebut"] -> true
 */
function isMethodologyReasonPair(parts) {
  if (parts.length !== 2) return false;
  
  const part1Lower = parts[0].toLowerCase();
  const part2Lower = parts[1].toLowerCase();
  
  // Part1 should be about methodology/what
  const isPart1Methodology = /\b(metode|metodologi|teknik|algoritma|pendekatan|cara|strategi)\b/i.test(part1Lower);
  
  // Part2 should be about reason/why
  const isPart2Reason = /\b(mengapa|kenapa|alasan|alasannya|alasan pemilihan)\b/i.test(part2Lower);
  
  // Part2 should NOT have its own independent subject (other than pronouns like "tersebut")
  const hasOwnSubject = /\b(metode|teknik|algoritma|pendekatan)\b/i.test(part2Lower) && 
                         !/\btersebut\b/i.test(part2Lower);
  
  return isPart1Methodology && isPart2Reason && !hasOwnSubject;
}

function determineRequirementCategory(text) {
  const lower = text.toLowerCase();
  if (/\b(biaya|anggaran|dana|tarif|harga|rupiah|rp|nominal|keuangan|uang|gaji|tunjangan)\b/i.test(lower)) return 'FINANCIAL';
  if (/\b(siapa|penanggung\s*jawab|koordinator|manajer|direktur|pic|ketua|pimpinan|pejabat)\b/i.test(lower)) return 'ORGANIZATIONAL_ROLE';
  if (/\b(umur|usia|tanggal\s*lahir|alamat|nomor\s*(?:hp|telepon)|email\s*pribadi|ktp)\b/i.test(lower)) return 'PERSONAL_DATA';
  if (/\b(jam|pukul|kapan|waktu|jadwal|mulai|masuk|istirahat)\b/i.test(lower)) return 'TEMPORAL_SCHEDULE';
  if (/\b(metode|metodologi|pendekatan|tahapan|arsitektur|dataset|algoritma)\b/i.test(lower)) return 'RESEARCH_METHODOLOGY';
  if (/\b(kesimpulan|hasil|akurasi|sensitivitas|output|temuan|capaian)\b/i.test(lower)) return 'OUTCOME_METRIC';
  if (/\b(visi|misi|tujuan|sasaran|target)\b/i.test(lower)) return 'VISION_MISSION';
  if (/\b(sop|panduan|tata\s*tertib|prosedur|aturan)\b/i.test(lower)) return 'POLICY_PROCEDURE';
  return 'GENERAL_FACT';
}

function determineEvidenceTypeForText(text) {
  const lower = text.toLowerCase();
  if (/\b(biaya|anggaran|dana|harga|tarif|rupiah|rp|nominal|tunjangan|total|selisih)\b/i.test(lower)) return 'NUMERIC_CURRENCY';
  if (/\b(jam|pukul|waktu|jadwal|08\.00|16\.00)\b/i.test(lower)) return 'TIME_SPECIFICATION';
  if (/\b(siapa|penanggung\s*jawab|koordinator|manajer|direktur|pic|ketua)\b/i.test(lower)) return 'PERSON_NAME_OR_TITLE';
  if (/\b(umur|usia|tanggal\s*lahir|identitas\s*pribadi)\b/i.test(lower)) return 'PERSONAL_PROFILE';
  if (/\b(metode|metodologi|resnet|cnn|dataset|eksperimental)\b/i.test(lower)) return 'RESEARCH_METHODOLOGY';
  if (/\b(akurasi|sensitivitas|%|kesimpulan|hasil)\b/i.test(lower)) return 'OUTCOME_METRIC';
  if (/\b(visi|misi|tujuan|program)\b/i.test(lower)) return 'ORGANIZATIONAL_STATEMENT';
  return 'FACTUAL_STATEMENT';
}

function extractPrimaryAttribute(text) {
  const lower = text.toLowerCase();
  if (/\b(biaya|anggaran|dana|harga|tunjangan|alokasi|uang|cost|keuangan|laporan\s*keuangan)\b/i.test(lower)) return 'financial_value';
  if (/\b(penanggung\s*jawab|koordinator|manajer|direktur|pic|ketua)\b/i.test(lower)) return 'person_or_role';
  if (/\b(umur|usia|tanggal\s*lahir)\b/i.test(lower)) return 'personal_data';
  if (/\b(jam|pukul|waktu|jadwal|mulai|masuk)\b/i.test(lower)) return 'schedule_time';
  if (/\b(metode|metodologi|arsitektur|dataset)\b/i.test(lower)) return 'methodology';
  if (/\b(kesimpulan|hasil|akurasi|sensitivitas)\b/i.test(lower)) return 'conclusion_metric';
  if (/\b(visi|misi|tujuan)\b/i.test(lower)) return 'vision_mission';
  return 'general_fact';
}

function extractTemporalConstraints(query) {
  const lower = query.toLowerCase();
  const years = (query.match(/\b(19\d{2}|20\d{2})\b/g) || []);
  
  let periodUnit = null;
  if (/\b(per\s*tahun|setahun|dalam\s*setahun|tahunan|1\s*tahun)\b/i.test(lower)) {
    periodUnit = 'ANNUAL';
  } else if (/\b(per\s*bulan|sebulan|dalam\s*sebulan|bulanan|1\s*bulan)\b/i.test(lower)) {
    periodUnit = 'MONTHLY';
  } else if (/\b(per\s*hari|sehari|harian)\b/i.test(lower)) {
    periodUnit = 'DAILY';
  } else if (/\b(per\s*semester|semesteran|1\s*semester)\b/i.test(lower)) {
    periodUnit = 'SEMESTER';
  }

  let relativePeriod = null;
  if (/\b(tahun\s*lalu|tahun\s*sebelumnya|kemarin)\b/i.test(lower)) {
    relativePeriod = 'PREVIOUS_YEAR';
  } else if (/\b(tahun\s*depan|tahun\s*berikutnya|mendatang)\b/i.test(lower)) {
    relativePeriod = 'NEXT_YEAR';
  }

  return {
    requestedYears: years,
    primaryYear: years.length > 0 ? years[0] : null,
    periodUnit,
    relativePeriod,
    hasExplicitYear: years.length > 0
  };
}

function extractComparisonTargets(query, intent) {
  const cleanQ = query.replace(/[.,?!]/g, '').trim();
  const lower = cleanQ.toLowerCase();

  const isComparison = intent === QueryIntent.COMPARISON || 
    /^(?:bandingkan|perbandingan|apa perbedaan|jelaskan perbedaan|bedanya|komparasi)\b/i.test(lower) ||
    /\b(?:dibandingkan dengan|perbedaan antara|dibandingkan)\b/i.test(lower) ||
    /\bmana yang lebih besar\b/i.test(lower) || /\bmana yang lebih kecil\b/i.test(lower) ||
    /\blebih besar\b.*\b(?:atau|dengan|versus)\b/i.test(lower) ||
    /\b(?:anggaran|biaya)\b.*\b(?:atau|dengan|versus)\b.*\b(?:anggaran|biaya|tunjangan)\b/i.test(lower) ||
    /\bberapa\s+(?:selisih|perbedaan)\b/i.test(lower) ||
    /\bselisih\b.*\b(?:antara|dengan|dari)\b/i.test(lower);

  if (!isComparison) {
    return { isComparison: false, targetA: null, targetB: null, rawParts: [] };
  }

  const subpart = cleanQ.replace(/^(?:mana yang lebih besar\s*:?\s*|berapa\s+selisih\s*:?\s*|berapa\s+perbedaan\s*:?\s*|bandingkan|perbandingan|apa perbedaan|jelaskan perbedaan|bedanya|komparasi)\s*/i, '');
  const parts = subpart.split(/\s+(?:dengan|dan|atau|vs|versus|terhadap|dibandingkan dengan|antara)\s+/i).map(p => p.trim()).filter(Boolean);

  return {
    isComparison: true,
    targetA: parts[0] || null,
    targetB: parts[1] || null,
    rawParts: parts
  };
}

function checkIsOutOfScope(query, allDocs = []) {
  const lower = query.toLowerCase().trim();
  const generalKnowledgePatterns = [
    /^siapa presiden/i,
    /^presiden pertama indonesia/i,
    /^ibukota/i,
    /^sejarah indonesia/i,
    /^penemu listrik/i,
    /^cuaca hari ini/i,
    /^harga saham/i,
    /^berapa populasi/i,
    /^definisi umum/i
  ];

  const matchesGeneral = generalKnowledgePatterns.some(p => p.test(lower));
  if (!matchesGeneral) return false;

  if (allDocs.length > 0) {
    const docNames = allDocs.map(d => d.name?.toLowerCase() || '').join(' ');
    const substantiveWords = lower.split(/\s+/).filter(w => w.length > 3 && !['siapa', 'berapa', 'indonesia', 'pertama'].includes(w));
    const hasMatch = substantiveWords.some(w => docNames.includes(w));
    return !hasMatch;
  }

  return true;
}

function checkIsPersonalData(query, atomicRequirements) {
  if (atomicRequirements.some(req => req.category === 'PERSONAL_DATA')) return true;
  const lower = query.toLowerCase();
  return /\b(umur|usia|tanggal\s*lahir|tempat\s*tinggal|alamat\s*rumah|nomor\s*telepon|no\s*hp|email\s*pribadi|ktp|nik)\b/i.test(lower);
}

function checkIsVagueOrAmbiguous(query, coreTerms, targetDocIds, inheritedContext) {
  const lower = query.toLowerCase().trim();
  
  const hasVaguePronoun = /\b(hal tersebut|hal itu|tentang hal|semua itu|data tentang hal|informasi itu|dokumen itu|tentang ini)\b/i.test(lower);
  if (hasVaguePronoun && targetDocIds.length === 0 && !inheritedContext) {
    return true;
  }

  const genericWords = ['data', 'dokumen', 'informasi', 'hal', 'file', 'berkas', 'tentang', 'ada', 'apa', 'tolong'];
  if (coreTerms.length === 1 && genericWords.includes(coreTerms[0].raw.toLowerCase()) && targetDocIds.length === 0) {
    return true;
  }

  return false;
}

function detectUserAssumption(query) {
  const lower = query.toLowerCase();
  // Detects if user assumes causation, correlation, or completion (e.g. "Apakah proyek berhasil karena anggarannya 30 juta?")
  const assumptionPatterns = [
    /\b(?:karena|disebabkan oleh|mengapa berhasil|akibat|sebab)\b.*\b(?:anggaran|biaya|dana)\b/i,
    /\b(?:apakah proyek berhasil)\b/i,
    /\b(?:apakah sudah selesai|apakah sudah rampung)\b/i
  ];

  for (const pattern of assumptionPatterns) {
    if (pattern.test(lower)) {
      return {
        hasAssumption: true,
        pattern: 'CAUSAL_OR_COMPLETION_ASSUMPTION',
        description: 'Pengguna mengasumsikan hubungan kausalitas atau status penyelesaian yang belum tentu didukung fakta dokumen.'
      };
    }
  }

  return { hasAssumption: false };
}

export const parseQuerySemantics = parseAndDecomposeQuery;

