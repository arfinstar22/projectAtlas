import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runAdvancedMissingInfoTests() {
  console.log('=================================================================');
  console.log('🧠 ATLAS ADVANCED INTELLIGENT MISSING-INFORMATION TEST SUITE');
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

  // A. Missing document
  await testCase('A. Missing document: "Apakah ada laporan keuangan tahun 2024?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Apakah ada laporan keuangan tahun 2024?' });
    const lower = res.data.response.toLowerCase();
    const explainsChecked = lower.includes('memeriksa') || lower.includes('terhubung') || lower.includes('belum');
    const hasNextAction = lower.includes('browse folder') || lower.includes('hubungkan') || lower.includes('langkah');
    if (!explainsChecked || !hasNextAction) {
      throw new Error(`Expected checked explanation and next action: ${res.data.response}`);
    }
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources for missing doc, got: ${res.data.sources.length}`);
    }
  });

  // B. Missing year
  await testCase('B. Missing year: "Dokumen mana yang membahas kegiatan tahun 2023?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Dokumen mana yang membahas kegiatan tahun 2023?' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('belum') && !lower.includes('tidak')) {
      throw new Error(`Expected missing year explanation: ${res.data.response}`);
    }
  });

  // C. Missing person data
  await testCase('C. Missing person data: "Berapa umur penulis skripsi?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Berapa umur penulis skripsi?' });
    const hasHallucinatedAge = res.data.response.match(/\b\d{2}\s*(tahun|thn|th)\b/i);
    if (hasHallucinatedAge) {
      throw new Error(`Hallucinated age found: ${hasHallucinatedAge[0]}`);
    }
    const lower = res.data.response.toLowerCase();
    const explainsMissingData = lower.includes('tidak') && (lower.includes('umur') || lower.includes('pribadi') || lower.includes('data'));
    if (!explainsMissingData) {
      throw new Error(`Expected missing data explanation: ${res.data.response}`);
    }
  });

  // D. Partial information
  await testCase('D. Partial information: "Bandingkan anggaran software dan perjalanan dinas"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Bandingkan anggaran software dan perjalanan dinas' });
    const lower = res.data.response.toLowerCase();
    const mentionsFound = lower.includes('software') || lower.includes('30.000.000') || lower.includes('perangkat');
    const mentionsMissing = lower.includes('perjalanan') && (lower.includes('belum') || lower.includes('tidak'));
    if (!mentionsFound || !mentionsMissing) {
      throw new Error(`Expected found vs missing distinction: ${res.data.response}`);
    }
  });

  // E. Related but unconfirmed
  await testCase('E. Related but unconfirmed: "Cari dokumen tentang SOP pengadaan barang"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Cari dokumen tentang SOP pengadaan barang' });
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('belum') && !lower.includes('tidak') && !lower.includes('browse folder')) {
      throw new Error(`Expected helpful missing explanation: ${res.data.response}`);
    }
  });

  // F. Out of scope
  await testCase('F. Out of scope: "Siapa presiden pertama Indonesia?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Siapa presiden pertama Indonesia?' });
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources, got: ${res.data.sources.length}`);
    }
    const lower = res.data.response.toLowerCase();
    const explainsBoundary = lower.includes('di luar') || lower.includes('tidak dapat') || lower.includes('dokumen yang saat ini terhubung');
    if (!explainsBoundary) {
      throw new Error(`Expected boundary explanation: ${res.data.response}`);
    }
  });

  // G. Low confidence
  await testCase('G. Low confidence: "Jelaskan data tentang hal tersebut"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Jelaskan data tentang hal tersebut' });
    const lower = res.data.response.toLowerCase();
    const asksContext = lower.includes('konteks') || lower.includes('spesifik') || lower.includes('bantu') || lower.includes('sebutkan');
    if (!asksContext) {
      throw new Error(`Expected clarification request: ${res.data.response}`);
    }
  });

  // H. Ambiguous question with guidance
  await testCase('H. Ambiguous question: "Saya ingin informasi tentang pegawai, tapi lupa nama dokumennya"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Saya ingin informasi tentang pegawai, tapi lupa nama dokumennya' });
    if (res.data.sources.length === 0 && !res.data.response.includes('panduan-karyawan')) {
      throw new Error('Should suggest or find employee guide');
    }
  });

  // I. Follow-up question context retention
  await testCase('I. Follow-up question context: Q1 -> Q2', async () => {
    const convId = 'adv_conv_' + Date.now();
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

  // J. Multi-document partial information
  await testCase('J. Multi-document: "Bandingkan visi organisasi PRINT dengan anggaran pemeliharaan server"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, {
      message: 'Bandingkan visi organisasi PRINT dengan anggaran pemeliharaan server'
    });
    if (res.data.sources.length === 0 && !res.data.response.includes('PRINT')) {
      throw new Error('Should retrieve relevant documents or explain relation');
    }
  });

  console.log('\n=================================================================');
  console.log(`🧠 ADVANCED MISSING-INFO SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('=================================================================\n');

  if (failed > 0) process.exit(1);
}

runAdvancedMissingInfoTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
