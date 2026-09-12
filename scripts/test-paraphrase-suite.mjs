import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runParaphraseSuite() {
  console.log('=================================================================');
  console.log('🔄 ATLAS PARAPHRASE & SEMANTIC RETRIEVAL TEST SUITE');
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

  const semanticQueries = [
    'Jam berapa karyawan harus mulai bekerja?',
    'Kapan pegawai mulai bekerja?',
    'Pukul berapa pegawai masuk kerja?',
    'Kapan karyawan mulai bekerja?',
    'Jam kerja dimulai pukul berapa?',
    'Kapan waktu masuk kerja pegawai?'
  ];

  console.log('--- 1. Testing Paraphrased Work-Schedule Queries ---');
  for (const query of semanticQueries) {
    await testCase(`Paraphrase: "${query}"`, async () => {
      const res = await axios.post(`${BASE_URL}/chat`, { message: query });
      if (res.data.sources.length === 0) {
        throw new Error('Sources should not be empty');
      }
      const hasPanduan = res.data.sources.some(s => s.documentName.toLowerCase().includes('panduan') || s.documentName.toLowerCase().includes('karyawan'));
      if (!hasPanduan) {
        throw new Error(`Expected panduan-karyawan.md in sources, got: ${res.data.sources.map(s => s.documentName).join(', ')}`);
      }
      const lower = res.data.response.toLowerCase();
      if (!lower.includes('08.00') && !lower.includes('8.00') && !lower.includes('delapan')) {
        throw new Error(`Response missing 08.00 time: ${res.data.response}`);
      }
    });
  }

  console.log('\n--- 2. Testing Anti-Hallucination & Boundaries ---');
  await testCase('Negative: "Siapa presiden pertama Indonesia?" -> 0 sources & boundary explanation', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Siapa presiden pertama Indonesia?' });
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources, got: ${res.data.sources.length}`);
    }
    const lower = res.data.response.toLowerCase();
    if (!lower.includes('tidak dapat') && !lower.includes('di luar') && !lower.includes('dokumen yang saat ini terhubung')) {
      throw new Error(`Expected boundary explanation: ${res.data.response}`);
    }
  });

  await testCase('Negative: "Berapa umur penulis skripsi?" -> No hallucinated age', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Berapa umur penulis skripsi?' });
    const hasHallucinatedAge = res.data.response.match(/\b\d{2}\s*(tahun|thn|th)\b/i);
    if (hasHallucinatedAge) {
      throw new Error(`Hallucinated age found: ${hasHallucinatedAge[0]}`);
    }
    const lower = res.data.response.toLowerCase();
    const indicatesUnavailable = lower.includes('tidak') && (lower.includes('umur') || lower.includes('pribadi') || lower.includes('data'));
    if (!indicatesUnavailable) {
      throw new Error(`Expected unavailable explanation: ${res.data.response}`);
    }
  });

  console.log('\n=================================================================');
  console.log(`🔄 PARAPHRASE TEST SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('=================================================================\n');

  if (failed > 0) process.exit(1);
}

runParaphraseSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
