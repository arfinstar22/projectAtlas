import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runDocumentIntelligenceTests() {
  console.log('=================================================================');
  console.log('🧠 ATLAS DOCUMENT INTELLIGENCE SYSTEM COMPREHENSIVE TEST SUITE');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  async function testCase(name, fn) {
    process.stdout.write(`TEST: ${name} ... `);
    try {
      await fn();
      console.log('✓ PASS');
      passed++;
    } catch (err) {
      console.log(`✗ FAIL (${err.message})`);
      failed++;
    }
  }

  // ==============================================
  // 1. SEMANTIC UNDERSTANDING TESTS
  // ==============================================
  
  await testCase('Semantic Paraphrasing: "Jam berapa karyawan harus mulai bekerja?" (should find pegawai/jam kerja)', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Jam berapa karyawan harus mulai bekerja?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources found for paraphrased query');
    }
    const hasRelevantDoc = res.data.sources.some(s => 
      s.documentName.includes('karyawan') || s.documentName.includes('panduan')
    );
    if (!hasRelevantDoc) {
      throw new Error(`Expected karyawan/panduan document, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
    if (!res.data.response.includes('08.00')) {
      throw new Error('Response missing expected time information');
    }
  });

  await testCase('Concept Understanding: "Bagaimana pendekatan penelitian dilakukan?" (methodology)', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Bagaimana pendekatan penelitian dilakukan?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources found for methodology query');
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('metode') && !lower.includes('eksperimental') && !lower.includes('penelitian')) {
      throw new Error('Response missing methodology concepts');
    }
  });

  // ==============================================
  // 2. DOCUMENT INTELLIGENCE TESTS
  // ==============================================

  await testCase('Document Overview: "Apa inti dari skripsi ini secara keseluruhan?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Apa inti dari skripsi ini secara keseluruhan?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources for document overview');
    }
    const hasSkripsi = res.data.sources.some(s => s.documentName.includes('skripsi'));
    if (!hasSkripsi) {
      throw new Error(`Expected skripsi document, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
    const lower = res.data.response.toLowerCase();
    const hasKeyElements = ['deep learning', 'cnn', 'resnet', 'citra', 'klasifikasi', 'akurasi'].some(term => 
      lower.includes(term)
    );
    if (!hasKeyElements) {
      throw new Error('Response missing key thesis concepts');
    }
  });

  await testCase('Multi-Document Reasoning: "Bandingkan metodologi skripsi dengan tujuan praktikum"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Bandingkan metodologi skripsi dengan tujuan praktikum' 
    });
    if (res.data.sources.length < 2) {
      throw new Error(`Expected multiple sources, got: ${res.data.sources.length}`);
    }
    const docNames = res.data.sources.map(s => s.documentName.toLowerCase());
    const hasSkripsi = docNames.some(n => n.includes('skripsi'));
    const hasPraktikum = docNames.some(n => n.includes('praktikum'));
    if (!hasSkripsi || !hasPraktikum) {
      throw new Error(`Expected both skripsi and praktikum docs, got: ${docNames.join(', ')}`);
    }
  });

  // ==============================================
  // 3. NUMERICAL REASONING TESTS
  // ==============================================

  await testCase('Quantitative Analysis: "Berapa total tunjangan komunikasi dalam setahun?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Berapa total tunjangan komunikasi dalam setahun?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources for calculation query');
    }
    const lower = res.data.response.toLowerCase();
    const hasCalculation = lower.includes('6.000.000') || lower.includes('6000000') || 
                          lower.includes('500.000') && lower.includes('12');
    if (!hasCalculation) {
      throw new Error('Response missing calculation result');
    }
  });

  await testCase('Comparative Calculation: "Mana yang lebih besar: anggaran software atau tunjangan komunikasi per tahun?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Mana yang lebih besar: anggaran software atau tunjangan komunikasi per tahun?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources for comparative calculation');
    }
    const lower = res.data.response.toLowerCase();
    const hasComparison = (lower.includes('30.000.000') || lower.includes('30000000')) && 
                         (lower.includes('6.000.000') || lower.includes('6000000'));
    if (!hasComparison) {
      throw new Error('Response missing comparative values');
    }
  });

  // ==============================================
  // 4. FOLLOW-UP CONTEXT TESTS  
  // ==============================================

  await testCase('Follow-up Reasoning: Q1->Q2 contextual understanding', async () => {
    const convId = 'test_intelligence_' + Date.now();
    
    const q1 = await axios.post(`${BASE_URL}/chat`, {
      message: 'Apa metode yang digunakan dalam penelitian skripsi?',
      conversationId: convId
    });
    if (!q1.data.sources.some(s => s.documentName.includes('skripsi'))) {
      throw new Error('Q1 failed to retrieve skripsi');
    }

    const q2 = await axios.post(`${BASE_URL}/chat`, {
      message: 'Kenapa metode tersebut dipilih untuk penelitian ini?',
      conversationId: convId
    });
    const q2Sources = q2.data.sources.map(s => s.documentName.toLowerCase());
    if (!q2Sources.some(s => s.includes('skripsi'))) {
      throw new Error(`Follow-up failed to maintain skripsi context: ${q2Sources.join(', ')}`);
    }
  });

  // ==============================================
  // 5. ANTI-HALLUCINATION INTELLIGENCE TESTS
  // ==============================================

  await testCase('Anti-Hallucination: "Berapa umur penulis skripsi?" (should reject)', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Berapa umur penulis skripsi?' 
    });
    if (res.data.sources.length > 0 && res.data.response.match(/\d+\s*(tahun|umur)/)) {
      throw new Error('System hallucinated age information not in documents');
    }
    const lower = res.data.response.toLowerCase();
    const indicatesNotFound = lower.includes('tidak ditemukan') || 
                              lower.includes('tidak tersedia') || 
                              lower.includes('tidak terdapat') ||
                              lower.includes('tidak mencakup');
    if (!indicatesNotFound) {
      throw new Error('Expected rejection message for unavailable information');
    }
  });

  await testCase('Anti-Hallucination: "Siapa presiden pertama Indonesia?" (should reject)', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Siapa presiden pertama Indonesia?' 
    });
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources for irrelevant query, got: ${res.data.sources.length}`);
    }
  });

  // ==============================================
  // 6. EXPLANATION & SYNTHESIS TESTS
  // ==============================================

  await testCase('Explanation Intelligence: "Jelaskan hasil penelitian dengan bahasa sederhana"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Jelaskan hasil penelitian skripsi dengan bahasa sederhana' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources for explanation request');
    }
    if (res.data.response.length < 100) {
      throw new Error('Response too short for explanation request');
    }
    const lower = res.data.response.toLowerCase();
    const hasSimpleExplanation = !lower.includes('confusion matrix') || 
                                lower.includes('akurasi') || 
                                lower.includes('berhasil');
    if (!hasSimpleExplanation) {
      throw new Error('Response not simplified for general audience');
    }
  });

  // ==============================================
  // 7. SOURCE QUALITY & CITATION TESTS
  // ==============================================

  await testCase('Source Quality: Citations match actual content used', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Apa kesimpulan dari penelitian skripsi?' 
    });
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    // Verify that sources contain content referenced in response
    const responseNumbers = res.data.response.match(/94\.8%|92\.3%/);
    if (responseNumbers) {
      const sourceTexts = res.data.sources.map(s => s.snippet).join(' ');
      const hasMatchingNumbers = responseNumbers.some(num => 
        sourceTexts.includes(num.replace('%', ''))
      );
      if (!hasMatchingNumbers) {
        throw new Error('Response numbers not found in source citations');
      }
    }
  });

  // ==============================================
  // 8. REGRESSION TESTS
  // ==============================================

  await testCase('Regression: All core APIs functional', async () => {
    const health = await axios.get(`${BASE_URL}/health`);
    const stats = await axios.get(`${BASE_URL}/stats`);
    const search = await axios.post(`${BASE_URL}/search`, { query: 'metodologi' });
    
    if (health.data.status !== 'ok') throw new Error('Health check failed');
    if (stats.data.documents < 10) throw new Error('Too few documents indexed');
    if (search.data.results.length === 0) throw new Error('Search functionality broken');
  });

  await testCase('Regression: Browse folder functionality preserved', async () => {
    const fsExplore = await axios.get(`${BASE_URL}/fs/explore?path=~`);
    if (!fsExplore.data.directories || !fsExplore.data.quickLocations) {
      throw new Error('Browse folder functionality broken');
    }
  });

  console.log('\n=================================================================');
  console.log(`🧠 DOCUMENT INTELLIGENCE TEST SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('=================================================================\n');

  return { passed, failed, total: passed + failed };
}

runDocumentIntelligenceTests().catch(err => {
  console.error('💥 CRITICAL TEST ERROR:', err.message);
  process.exit(1);
});