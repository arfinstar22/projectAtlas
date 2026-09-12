import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runMissingInformationTests() {
  console.log('=================================================================');
  console.log('🧠 ATLAS INTELLIGENT MISSING-INFORMATION HANDLING TEST SUITE');
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
  // TEST A: NO RELEVANT DOCUMENT
  // ==============================================
  await testCase('TEST A: Missing Document -> Actionable Response', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Cari laporan keuangan 2024' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Should explain what was checked
    const explainsChecked = response.includes('memeriksa') || response.includes('dokumen yang terhubung');
    if (!explainsChecked) {
      throw new Error('Response does not explain what was checked');
    }
    
    // Should give concrete next steps
    const hasNextSteps = response.includes('browse folder') || response.includes('langkah selanjutnya');
    if (!hasNextSteps) {
      throw new Error('Response does not provide actionable next steps');
    }
    
    // Should have 0 sources (honest reporting)
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources, got: ${res.data.sources.length}`);
    }
  });

  // ==============================================
  // TEST B: PARTIAL INFORMATION (Comparison)
  // ==============================================
  await testCase('TEST B: Partial Information -> Explain Available vs Missing', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Bandingkan anggaran software dan perjalanan dinas' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Should mention what was found
    const mentionsFound = response.includes('software') || response.includes('30.000.000');
    if (!mentionsFound) {
      throw new Error('Response does not mention the available information');
    }
    
    // Should mention what is missing
    const mentionsMissing = response.includes('perjalanan dinas') && 
                           (response.includes('belum') || response.includes('tidak') || response.includes('memerlukan'));
    if (!mentionsMissing) {
      throw new Error('Response does not explain what information is missing');
    }
    
    // Should not make a definitive conclusion without full data
    const avoidsPrematureConclusion = !response.includes('lebih besar') || response.includes('belum');
    if (!avoidsPrematureConclusion) {
      throw new Error('Response made premature conclusion with partial data');
    }
  });

  // ==============================================
  // TEST C: OUT OF SCOPE QUESTION
  // ==============================================
  await testCase('TEST C: Out-of-Scope -> Explain Knowledge Boundary', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Siapa presiden pertama Indonesia?' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Should explain boundary
    const explainsBoundary = response.includes('tidak dapat saya jawab') || 
                            response.includes('di luar') || 
                            response.includes('hanya');
    if (!explainsBoundary) {
      throw new Error('Response does not explain knowledge boundary');
    }
    
    // Should explain why (document-grounded)
    const explainsReason = response.includes('dokumen') && 
                          (response.includes('sumber') || response.includes('terhubung'));
    if (!explainsReason) {
      throw new Error('Response does not explain document-grounded policy');
    }
    
    // Must have 0 sources
    if (res.data.sources.length > 0) {
      throw new Error(`Expected 0 sources for out-of-scope, got: ${res.data.sources.length}`);
    }
  });

  // ==============================================
  // TEST D: MISSING PERSONAL DATA (Anti-Hallucination)
  // ==============================================
  await testCase('TEST D: Missing Personal Data -> Reject + Suggest Location', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Berapa umur penulis skripsi?' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Must NOT hallucinate age
    const hasHallucinatedAge = res.data.response.match(/\b\d{2}\s*(tahun|thn|th)\b/i);
    if (hasHallucinatedAge) {
      throw new Error(`Hallucinated age found: ${hasHallucinatedAge[0]}`);
    }
    
    // Must explain personal data is not in research doc
    const explainsMissingData = response.includes('tidak') && 
                               (response.includes('umur') || response.includes('pribadi') || response.includes('biodata'));
    if (!explainsMissingData) {
      throw new Error('Response does not explain missing personal data');
    }
  });

  // ==============================================
  // TEST E: LOW CONFIDENCE RETRIEVAL
  // ==============================================
  await testCase('TEST E: Low Confidence -> Ask for Specific Context', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Jelaskan data tentang hal tersebut' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Should ask for clarification/context
    const asksForContext = response.includes('konteks') || 
                          response.includes('spesifik') || 
                          response.includes('bantu saya') ||
                          response.includes('nama dokumen');
    if (!asksForContext) {
      throw new Error('Response does not ask for more specific context');
    }
  });

  // ==============================================
  // TEST F: PROACTIVE HELPFULNESS
  // ==============================================
  await testCase('TEST F: Proactive Helpfulness -> Suggest Browse Folder', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Cari SOP pengadaan barang' 
    });
    
    const response = res.data.response.toLowerCase();
    
    // Should mention Browse Folder when document not found
    const mentionsBrowse = response.includes('browse folder') || response.includes('hubungkan folder');
    if (!mentionsBrowse) {
      throw new Error('Response does not suggest using Browse Folder');
    }
  });

  console.log('\n=================================================================');
  console.log(`🧠 INTELLIGENT MISSING-INFORMATION TEST SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('=================================================================\n');

  return { passed, failed, total: passed + failed };
}

runMissingInformationTests().catch(err => {
  console.error('💥 TEST SUITE ERROR:', err.message);
  process.exit(1);
});