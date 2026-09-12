import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runComprehensiveTests() {
  console.log('=====================================================');
  console.log(' ATLAS ADVANCED RAG PIPELINE COMPREHENSIVE TEST SUITE ');
  console.log('=====================================================\n');

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

  // 1. Health & Security
  await testCase('/api/health check', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    if (res.data.status !== 'ok' || !res.data.aiConfigured) {
      throw new Error(`Invalid health response: ${JSON.stringify(res.data)}`);
    }
  });

  await testCase('/api/stats check', async () => {
    const res = await axios.get(`${BASE_URL}/stats`);
    if (res.data.documents < 10 || res.data.chunks < 100) {
      throw new Error(`Too few documents or chunks in stats: ${JSON.stringify(res.data)}`);
    }
  });

  await testCase('Filesystem traversal protection', async () => {
    try {
      await axios.get(`${BASE_URL}/fs/explore?path=/etc/shadow`);
      throw new Error('Should have rejected path outside allowed roots');
    } catch (err) {
      if (err.response?.status !== 403) {
        throw new Error(`Expected 403 but got ${err.response?.status}`);
      }
    }
  });

  // 2. Anti-Hallucination Gate Tests
  await testCase('Anti-Hallucination: "Apa warna mobil saya?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa warna mobil saya?' });
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources but got ${res.data.sources.length}`);
    }
    if (!res.data.response.includes('belum menemukan informasi') && !res.data.response.includes('tidak ditemukan')) {
      throw new Error(`Expected reject message, got: ${res.data.response}`);
    }
  });

  await testCase('Anti-Hallucination: "Siapa presiden pertama Indonesia?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Siapa presiden pertama Indonesia?' });
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources but got ${res.data.sources.length}`);
    }
  });

  // 3. Paraphrase & Concept Retrieval Test
  await testCase('Paraphrase: "Kapan pegawai mulai bekerja?" -> panduan-karyawan.md', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Kapan pegawai mulai bekerja?' });
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.includes('panduan-karyawan.md')) {
      throw new Error(`Expected panduan-karyawan.md in sources, got: ${sourceNames.join(', ')}`);
    }
    if (!res.data.response.includes('08.00')) {
      throw new Error(`Expected response to contain 08.00, got: ${res.data.response}`);
    }
  });

  // 4. Document-Level Overview / Summary Test
  await testCase('Overview: "Apa inti dari skripsi ini?" -> dokumen_skripsi.txt', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa inti dari skripsi ini?' });
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.includes('dokumen_skripsi.txt')) {
      throw new Error(`Expected dokumen_skripsi.txt in sources, got: ${sourceNames.join(', ')}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('deep learning') && !lower.includes('cnn') && !lower.includes('citra') && !lower.includes('resnet')) {
      throw new Error(`Response missing key thesis concepts: ${res.data.response}`);
    }
  });

  // 5. Methodology & Reasoning Test
  await testCase('Methodology: "Metode apa yang digunakan dalam skripsi dan mengapa?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Metode apa yang digunakan dalam skripsi dan mengapa?' });
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.includes('dokumen_skripsi.txt')) {
      throw new Error(`Expected dokumen_skripsi.txt in sources, got: ${sourceNames.join(', ')}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('eksperimental') && !lower.includes('resnet') && !lower.includes('cnn')) {
      throw new Error(`Response missing methodology details: ${res.data.response}`);
    }
  });

  // 6. Explanation in simple language
  await testCase('Explanation: "Jelaskan isi dokumen skripsi ini secara sederhana."', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jelaskan isi dokumen skripsi ini secara sederhana.' });
    if (res.data.sources.length === 0) {
      throw new Error('Sources should not be empty');
    }
    if (res.data.response.length < 50) {
      throw new Error(`Response too short: ${res.data.response}`);
    }
  });

  // 7. Conclusion Test
  await testCase('Conclusion: "Apa kesimpulan dari dokumen skripsi?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa kesimpulan dari dokumen skripsi?' });
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.includes('dokumen_skripsi.txt')) {
      throw new Error(`Expected dokumen_skripsi.txt, got: ${sourceNames.join(', ')}`);
    }
    if (!res.data.response.includes('94.8%') && !res.data.response.includes('akurasi')) {
      throw new Error(`Response missing conclusion metrics: ${res.data.response}`);
    }
  });

  // 8. Vision Document Test
  await testCase('Vision: "Ringkas visi dan misi organisasi PRINT."', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Ringkas visi dan misi organisasi PRINT.' });
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.includes('dokumen_visi.txt')) {
      throw new Error(`Expected dokumen_visi.txt, got: ${sourceNames.join(', ')}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('penyiaran') && !lower.includes('media') && !lower.includes('kreatif')) {
      throw new Error(`Response missing vision details: ${res.data.response}`);
    }
  });

  // 9. Multi-Document Comparison Test
  await testCase('Comparison: "Bandingkan anggaran software dengan tunjangan komunikasi karyawan."', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan anggaran pengembangan perangkat lunak dengan tunjangan komunikasi karyawan.'
    });
    const sourceNames = res.data.sources.map(s => s.documentName);
    const hasKeuangan = sourceNames.some(s => s.includes('keuangan'));
    const hasKaryawan = sourceNames.some(s => s.includes('karyawan'));
    if (!hasKeuangan || !hasKaryawan) {
      throw new Error(`Expected both financial and employee sources, got: ${sourceNames.join(', ')}`);
    }
    if (!res.data.response.includes('30.000.000') || !res.data.response.includes('500.000')) {
      throw new Error(`Expected numbers (30.000.000 and 500.000) in response: ${res.data.response}`);
    }
  });

  // 10. Cross-Document Comparison (Praktikum vs Skripsi)
  await testCase('Cross-Document: "Bandingkan tujuan praktikum dengan metodologi skripsi."', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan tujuan praktikum dengan metodologi skripsi.'
    });
    const sourceNames = res.data.sources.map(s => s.documentName);
    const hasPraktikum = sourceNames.some(s => s.includes('praktikum'));
    const hasSkripsi = sourceNames.some(s => s.includes('skripsi'));
    if (!hasPraktikum || !hasSkripsi) {
      throw new Error(`Expected both praktikum and skripsi sources, got: ${sourceNames.join(', ')}`);
    }
  });

  // 11. Follow-up Context Reasoning Test
  await testCase('Follow-up Question: Q1 -> Q2 ("kenapa metode itu dipilih?")', async () => {
    const convId = 'test_follow_up_' + Date.now();
    const q1Res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Apa metodologi penelitian skripsi?',
      conversationId: convId
    });
    if (!q1Res.data.sources.some(s => s.documentName.includes('skripsi'))) {
      throw new Error('Q1 failed to retrieve skripsi');
    }

    const q2Res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Kenapa metode tersebut digunakan?',
      conversationId: convId
    });
    const q2Sources = q2Res.data.sources.map(s => s.documentName);
    if (!q2Sources.some(s => s.includes('skripsi'))) {
      throw new Error(`Follow-up failed to inherit skripsi document context: ${q2Sources.join(', ')}`);
    }
  });

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('=====================================================\n');
}

runComprehensiveTests().catch(err => {
  console.error('Fatal test error:', err);
});
