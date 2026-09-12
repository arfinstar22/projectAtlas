import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runProfessorLevelTestSuite() {
  console.log('========================================================================');
  console.log('🎓 ATLAS PROFESSOR-LEVEL DOCUMENT INTELLIGENCE COMPREHENSIVE TEST SUITE');
  console.log('========================================================================\n');

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

  // A. Exact fact lookup
  await testCase('A. Exact fact lookup: "Jam kerja karyawan adalah pukul berapa?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jam kerja karyawan adalah pukul berapa?' });
    if (res.data.sources.length === 0) throw new Error('Sources should not be empty');
    if (!res.data.response.includes('08.00') && !res.data.response.includes('16.00')) {
      throw new Error(`Response missing work hours: ${res.data.response}`);
    }
  });

  // B. Paraphrase understanding
  await testCase('B. Paraphrase understanding: "Kapan pegawai mulai bekerja?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Kapan pegawai mulai bekerja?' });
    if (res.data.sources.length === 0) throw new Error('Sources should not be empty for paraphrase');
    if (!res.data.response.includes('08.00')) {
      throw new Error(`Response missing 08.00: ${res.data.response}`);
    }
  });

  // C. Missing document
  await testCase('C. Missing document: "Cari dokumen SOP Pengadaan Server 2026"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Cari dokumen SOP Pengadaan Server 2026' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('belum') && !lower.includes('tidak')) {
      throw new Error('Should state document is not found');
    }
    if (!lower.includes('browse folder') && !lower.includes('hubungkan')) {
      throw new Error('Should suggest Browse Folder next step');
    }
  });

  // D. Missing year (Temporal reasoning)
  await testCase('D. Missing year: "Apakah ada laporan keuangan tahun 2024?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apakah ada laporan keuangan tahun 2024?' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('2024') || (!lower.includes('belum') && !lower.includes('tidak'))) {
      throw new Error(`Expected missing year 2024 explanation: ${res.data.response}`);
    }
    if (res.data.sources.length > 0) {
      throw new Error(`Verified sources should be 0 for missing year 2024, got: ${res.data.sources.length}`);
    }
  });

  // E. Partial information
  await testCase('E. Partial info: "Bandingkan anggaran software dan perjalanan dinas"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Bandingkan anggaran software dan perjalanan dinas' });
    const lower = res.data.response.toLowerCase();
    const mentionsFound = lower.includes('software') || lower.includes('30.000.000') || lower.includes('perangkat');
    const mentionsMissing = lower.includes('perjalanan') && (lower.includes('belum') || lower.includes('tidak'));
    if (!mentionsFound || !mentionsMissing) {
      throw new Error(`Expected available vs missing split: ${res.data.response}`);
    }
  });

  // F. Missing attribute (e.g. asking cost + unknown PIC)
  await testCase('F. Missing attribute: "Berapa biaya proyek dan siapa penanggung jawabnya?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Berapa biaya proyek dan siapa penanggung jawabnya?' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('biaya') && !lower.includes('penanggung jawab')) {
      throw new Error(`Expected attribute separation: ${res.data.response}`);
    }
  });

  // G. Out of scope
  await testCase('G. Out of scope: "Siapa presiden pertama Indonesia?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Siapa presiden pertama Indonesia?' });
    if (res.data.sources.length > 0) {
      throw new Error(`Sources must be 0 for out of scope query, got: ${res.data.sources.length}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('di luar') && !lower.includes('tidak dapat') && !lower.includes('dokumen yang saat ini terhubung')) {
      throw new Error(`Expected boundary explanation: ${res.data.response}`);
    }
  });

  // H. Low confidence
  await testCase('H. Low confidence: "Jelaskan data tentang hal tersebut"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jelaskan data tentang hal tersebut' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('konteks') && !lower.includes('spesifik') && !lower.includes('sebutkan') && !lower.includes('bantu')) {
      throw new Error(`Expected clarification request: ${res.data.response}`);
    }
  });

  // I. Ambiguous query with helpful resolution
  await testCase('I. Ambiguous query: "Saya ingin informasi tentang pegawai, tapi lupa nama dokumennya"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Saya ingin informasi tentang pegawai, tapi lupa nama dokumennya' });
    if (res.data.sources.length === 0 && !res.data.response.includes('panduan-karyawan')) {
      throw new Error('Should retrieve employee guide document');
    }
  });

  // J. Follow-up context retention
  await testCase('J. Follow-up context: Q1 -> Q2 ("kenapa metode tersebut digunakan?")', async () => {
    const convId = 'prof_follow_' + Date.now();
    const q1 = await axios.post(`${BASE_URL}/chat`, {
      message: 'Apa metodologi penelitian skripsi?',
      conversationId: convId
    });
    if (q1.data.sources.length === 0) throw new Error('Q1 returned no sources');

    const q2 = await axios.post(`${BASE_URL}/chat`, {
      message: 'Kenapa metode tersebut digunakan?',
      conversationId: convId
    });
    if (q2.data.sources.length === 0) throw new Error('Q2 returned no sources in follow-up');
  });

  // K. Multi-document comparison
  await testCase('K. Multi-doc comparison: "Bandingkan tujuan praktikum dengan metodologi skripsi."', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan tujuan praktikum dengan metodologi skripsi.'
    });
    const names = res.data.sources.map(s => s.documentName.toLowerCase());
    if (!names.some(n => n.includes('praktikum')) || !names.some(n => n.includes('skripsi'))) {
      throw new Error(`Expected both praktikum and skripsi in sources, got: ${names.join(', ')}`);
    }
  });

  // L. Different units & percentages
  await testCase('L. Units & percentages: "Berapa akurasi dan sensitivitas penelitian skripsi?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Berapa akurasi dan sensitivitas penelitian skripsi?'
    });
    if (!res.data.response.includes('94.8%') || !res.data.response.includes('92.3%')) {
      throw new Error(`Response missing accuracy metrics 94.8% and 92.3%: ${res.data.response}`);
    }
  });

  // M. Different periods (Monthly to annual normalization)
  await testCase('M. Period reasoning: "Berapa total tunjangan komunikasi dalam setahun?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Berapa total tunjangan komunikasi dalam setahun?'
    });
    if (!res.data.response.includes('6.000.000') && !res.data.response.includes('6000000')) {
      throw new Error(`Response missing annualized calculation 6.000.000: ${res.data.response}`);
    }
  });

  // N. Contradiction / Consistency check
  await testCase('N. Cross-doc budget calculation: "Bandingkan anggaran software dengan tunjangan komunikasi"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan anggaran pengembangan perangkat lunak dengan tunjangan komunikasi karyawan.'
    });
    if (!res.data.response.includes('30.000.000') || !res.data.response.includes('500.000')) {
      throw new Error(`Response missing comparative figures: ${res.data.response}`);
    }
  });

  // O. Anti-hallucination (personal data: age)
  await testCase('O. Anti-hallucination: "Berapa umur penulis skripsi?" -> No hallucinated age', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Berapa umur penulis skripsi?' });
    const hasHallucinatedAge = res.data.response.match(/\b\d{2}\s*(tahun|thn|th)\b/i);
    if (hasHallucinatedAge) {
      throw new Error(`Hallucinated age found: ${hasHallucinatedAge[0]}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('tidak') && !lower.includes('belum')) {
      throw new Error(`Expected honest unavailable explanation: ${res.data.response}`);
    }
  });

  // P. Source attribution correctness
  await testCase('P. Source attribution: Sources match claims in response', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Ringkas visi dan misi organisasi PRINT.' });
    if (res.data.sources.length === 0) throw new Error('Expected verified source');
    if (!res.data.sources.some(s => s.documentName.includes('visi'))) {
      throw new Error(`Expected dokumen_visi.txt, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
    }
  });

  // Q. Related-but-unconfirmed
  await testCase('Q. Related-but-unconfirmed: "Apakah ada data kegiatan tahun 2023?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apakah ada data kegiatan tahun 2023?' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('2023') && !lower.includes('belum') && !lower.includes('tidak')) {
      throw new Error('Expected temporal verification explanation');
    }
  });

  // R. Document discovery
  await testCase('R. Document discovery: "Apa topik utama modul praktikum jaringan?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apa topik utama modul praktikum jaringan?' });
    if (res.data.sources.length === 0) throw new Error('Expected praktikum source');
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('ospf') && !lower.includes('vlan') && !lower.includes('routing')) {
      throw new Error(`Expected OSPF/VLAN topic in response: ${res.data.response}`);
    }
  });

  // S. Numeric reasoning ratio / difference
  await testCase('S. Numeric reasoning: "Berapa selisih anggaran software dengan tunjangan tahunan?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Berapa selisih anggaran pengembangan perangkat lunak dengan tunjangan komunikasi tahunan?' });
    if (res.data.sources.length === 0) throw new Error('Sources should not be empty');
    if (!res.data.response.includes('30.000.000') && !res.data.response.includes('6.000.000')) {
      throw new Error(`Expected numeric values in calculation: ${res.data.response}`);
    }
  });

  // T. Complex multi-part question
  await testCase('T. Complex multi-part: "Jelaskan arsitektur model skripsi, dataset yang digunakan, dan akurasi akhirnya"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jelaskan arsitektur model skripsi, dataset yang digunakan, dan akurasi akhirnya' });
    if (res.data.sources.length === 0) throw new Error('Sources should not be empty');
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('resnet') || !lower.includes('94.8%')) {
      throw new Error(`Expected ResNet-50 and 94.8% accuracy in response: ${res.data.response}`);
    }
  });

  console.log('\n========================================================================');
  console.log(`🎓 PROFESSOR-LEVEL TEST SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runProfessorLevelTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
