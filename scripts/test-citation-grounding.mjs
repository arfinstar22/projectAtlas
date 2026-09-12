import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runCitationGroundingTests() {
  console.log('================================================================');
  console.log(' ATLAS CITATION / SOURCE GROUNDING REGRESSION TEST SUITE');
  console.log('================================================================\n');

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

  // 1. Sources for single-document queries come from the correct document
  await testCase('Single-doc: "Apa kesimpulan skripsi?" → sources from dokumen_skripsi.txt', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa kesimpulan dari dokumen skripsi?' });
    if (res.data.sources.length === 0) throw new Error('Sources should not be empty for FOUND status');
    const names = res.data.sources.map(s => s.documentName);
    if (!names.some(n => n.toLowerCase().includes('skripsi'))) {
      throw new Error(`Expected skripsi source, got: ${names.join(', ')}`);
    }
    // All sources should be from skripsi (single-doc query)
    const nonSkripsi = names.filter(n => !n.toLowerCase().includes('skripsi'));
    if (nonSkripsi.length > 0) {
      throw new Error(`Unexpected non-skripsi sources: ${nonSkripsi.join(', ')}`);
    }
  });

  // 2. Sources for multi-doc comparison contain both target documents
  await testCase('Multi-doc: "Bandingkan anggaran software dan tunjangan" → both docs in sources', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan anggaran pengembangan perangkat lunak dengan tunjangan komunikasi karyawan.'
    });
    if (res.data.sources.length < 2) throw new Error(`Expected >=2 sources for comparison, got ${res.data.sources.length}`);
    const names = res.data.sources.map(s => s.documentName);
    const hasKeuangan = names.some(n => n.toLowerCase().includes('keuangan'));
    const hasKaryawan = names.some(n => n.toLowerCase().includes('karyawan'));
    if (!hasKeuangan || !hasKaryawan) {
      throw new Error(`Expected both keuangan and karyawan sources, got: ${names.join(', ')}`);
    }
  });

  // 3. Source snippets are non-empty and have reasonable length
  await testCase('Snippets: All sources have non-empty, meaningful snippets', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jam kerja karyawan adalah pukul berapa?' });
    if (res.data.sources.length === 0) throw new Error('Expected sources');
    for (const source of res.data.sources) {
      if (!source.snippet || source.snippet.length < 20) {
        throw new Error(`Source ${source.documentName} has empty/short snippet: "${source.snippet}"`);
      }
    }
  });

  // 4. Source attribution: visi/misi query → dokumen_visi.txt
  await testCase('Vision query: "Visi dan misi PRINT" → dokumen_visi.txt', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Ringkas visi dan misi organisasi PRINT.' });
    if (res.data.sources.length === 0) throw new Error('Expected sources');
    if (!res.data.sources.some(s => s.documentName.toLowerCase().includes('visi'))) {
      throw new Error(`Expected dokumen_visi.txt, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
  });

  // 5. Sources for methodology query → skripsi
  await testCase('Methodology: "Metode skripsi" → dokumen_skripsi.txt', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Metode apa yang digunakan dalam skripsi?' });
    if (res.data.sources.length === 0) throw new Error('Expected sources');
    if (!res.data.sources.some(s => s.documentName.toLowerCase().includes('skripsi'))) {
      throw new Error(`Expected skripsi source, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
  });

  // 6. No sources for out-of-scope queries
  await testCase('No sources: "Siapa presiden?" → empty sources', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Siapa presiden pertama Indonesia?' });
    if (res.data.sources.length !== 0) {
      throw new Error(`Expected 0 sources for out-of-scope, got ${res.data.sources.length}: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
  });

  // 7. No sources for missing year queries
  await testCase('No sources: "Laporan 2024" → empty sources', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apakah ada laporan keuangan tahun 2024?' });
    if (res.data.sources.length !== 0) {
      throw new Error(`Expected 0 sources for missing year, got ${res.data.sources.length}`);
    }
  });

  // 8. Each source has required fields (documentId, documentName, path, chunkIndex, section, snippet)
  await testCase('Source schema: All required fields present', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa inti dari skripsi ini?' });
    if (res.data.sources.length === 0) throw new Error('Expected sources');
    const requiredFields = ['documentId', 'documentName', 'path', 'chunkIndex', 'section', 'snippet'];
    for (const source of res.data.sources) {
      for (const field of requiredFields) {
        if (!(field in source)) {
          throw new Error(`Source missing field '${field}': ${JSON.stringify(source)}`);
        }
      }
    }
  });

  // 9. Source count is bounded (max 5 per current design)
  await testCase('Source count: Max 5 sources returned', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jelaskan arsitektur model skripsi, dataset yang digunakan, dan akurasi akhirnya' });
    if (res.data.sources.length > 5) {
      throw new Error(`Expected max 5 sources, got ${res.data.sources.length}`);
    }
  });

  // 10. No duplicate sources (same chunkIndex + documentName)
  await testCase('No duplicates: Sources are deduplicated', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa inti dari skripsi ini?' });
    const keys = res.data.sources.map(s => `${s.documentName}#${s.chunkIndex}`);
    const uniqueKeys = [...new Set(keys)];
    if (keys.length !== uniqueKeys.length) {
      throw new Error(`Duplicate sources detected: ${keys.join(', ')}`);
    }
  });

  // 11. For FOUND status, informationStatus is 'found'
  await testCase('Status consistency: FOUND response has status=found', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jam kerja karyawan adalah pukul berapa?' });
    if (res.data.informationStatus !== 'found') {
      throw new Error(`Expected status 'found', got '${res.data.informationStatus}'`);
    }
    if (res.data.sources.length === 0) {
      throw new Error('FOUND status should have non-empty sources');
    }
  });

  // 12. Follow-up queries maintain source continuity
  await testCase('Follow-up: Q2 inherits document context from Q1', async () => {
    const convId = 'citation_test_' + Date.now();
    await axios.post(`${BASE_URL}/chat`, {
      message: 'Apa metodologi penelitian skripsi?',
      conversationId: convId
    });
    const q2 = await axios.post(`${BASE_URL}/chat`, {
      message: 'Kenapa metode tersebut digunakan?',
      conversationId: convId
    });
    if (q2.data.sources.length === 0) {
      throw new Error('Follow-up Q2 should have sources from inherited context');
    }
    if (!q2.data.sources.some(s => s.documentName.toLowerCase().includes('skripsi'))) {
      throw new Error(`Follow-up should reference skripsi, got: ${q2.data.sources.map(s => s.documentName).join(', ')}`);
    }
  });

  console.log('\n================================================================');
  console.log(`CITATION GROUNDING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runCitationGroundingTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
