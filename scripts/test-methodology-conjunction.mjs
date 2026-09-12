/**
 * TASK 2 Regression Test: Methodology Query + Smart Conjunction Parsing
 * 
 * Tests that conjunctive methodology queries are properly decomposed
 * and responses are not generic when evidence is available.
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runMethodologyConjunctionTests() {
  console.log('================================================================');
  console.log('🔬 TASK 2: METHODOLOGY CONJUNCTION PARSING REGRESSION TEST SUITE');
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

  // Helper to check if response is generic (should not be if evidence exists)
  function isGenericResponse(response) {
    const genericPatterns = [
      /saya menemukan sebagian informasi.*tetapi data belum lengkap/i,
      /data belum lengkap untuk memberikan kesimpulan/i,
      /belum menemukan informasi spesifik/i
    ];
    return genericPatterns.some(p => p.test(response));
  }

  // Helper to check if response contains methodology info
  function hasMethodologyInfo(response) {
    const lower = response.toLowerCase();
    return lower.includes('metode') || 
           lower.includes('metodologi') ||
           lower.includes('resnet') ||
           lower.includes('cnn') ||
           lower.includes('eksperimental') ||
           lower.includes('deep learning');
  }

  // ==============================================
  // A. "Metode apa yang digunakan dalam skripsi dan mengapa?"
  // ==============================================
  await testCase('A. "Metode apa yang digunakan dalam skripsi dan mengapa?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Metode apa yang digunakan dalam skripsi dan mengapa?' 
    });
    
    // Should have sources
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    // Should contain skripsi document
    const sourceNames = res.data.sources.map(s => s.documentName);
    if (!sourceNames.some(s => s.includes('skripsi'))) {
      throw new Error(`Expected skripsi in sources, got: ${sourceNames.join(', ')}`);
    }
    
    // Response should NOT be generic
    if (isGenericResponse(res.data.response)) {
      throw new Error(`Response is generic: ${res.data.response.slice(0, 200)}`);
    }
    
    // Response should contain methodology info
    if (!hasMethodologyInfo(res.data.response)) {
      throw new Error(`Response missing methodology details: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // B. "Metode apa yang dipakai dan kenapa?"
  // ==============================================
  await testCase('B. "Metode apa yang dipakai dan kenapa?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Metode apa yang dipakai dan kenapa?' 
    });
    
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    if (isGenericResponse(res.data.response)) {
      throw new Error(`Response is generic: ${res.data.response.slice(0, 200)}`);
    }
    
    if (!hasMethodologyInfo(res.data.response)) {
      throw new Error(`Response missing methodology details: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // C. "Metodologi apa yang digunakan serta apa alasannya?"
  // ==============================================
  await testCase('C. "Metodologi apa yang digunakan serta apa alasannya?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Metodologi apa yang digunakan serta apa alasannya?' 
    });
    
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    if (isGenericResponse(res.data.response)) {
      throw new Error(`Response is generic: ${res.data.response.slice(0, 200)}`);
    }
    
    if (!hasMethodologyInfo(res.data.response)) {
      throw new Error(`Response missing methodology details: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // D. "Teknik apa yang digunakan dan kenapa teknik tersebut dipilih?"
  // ==============================================
  await testCase('D. "Teknik apa yang digunakan dan kenapa teknik tersebut dipilih?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Teknik apa yang digunakan dan kenapa teknik tersebut dipilih?' 
    });
    
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    // This query has explicit context in second clause, so should work
    if (isGenericResponse(res.data.response)) {
      throw new Error(`Response is generic: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // E. "Algoritma apa yang digunakan dan mengapa?"
  // ==============================================
  await testCase('E. "Algoritma apa yang digunakan dan mengapa?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Algoritma apa yang digunakan dan mengapa?' 
    });
    
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    // Response should not be generic
    if (isGenericResponse(res.data.response)) {
      throw new Error(`Response is generic: ${res.data.response.slice(0, 200)}`);
    }
    
    // Response should contain some algorithm/methodology information
    const lower = res.data.response.toLowerCase();
    const hasAlgorithmInfo = lower.includes('algoritma') || 
                             lower.includes('metode') ||
                             lower.includes('neural') ||
                             lower.includes('deep learning') ||
                             lower.includes('ai');
    if (!hasAlgorithmInfo) {
      throw new Error(`Response missing algorithm details: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // F. Verify non-conjunctive queries still work
  // ==============================================
  await testCase('F. Non-conjunctive: "Metode apa yang digunakan dalam skripsi?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Metode apa yang digunakan dalam skripsi?' 
    });
    
    if (res.data.sources.length === 0) {
      throw new Error('No sources provided');
    }
    
    if (!hasMethodologyInfo(res.data.response)) {
      throw new Error(`Response missing methodology details: ${res.data.response.slice(0, 200)}`);
    }
  });

  // ==============================================
  // G. Verify unrelated conjunctions still work
  // ==============================================
  await testCase('G. Unrelated conjunction: "Berapa biaya proyek dan siapa penanggung jawabnya?"', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { 
      message: 'Berapa biaya proyek dan siapa penanggung jawabnya?' 
    });
    
    // Should have sources or at least not crash
    if (!res.data.response) {
      throw new Error('No response returned');
    }
  });

  console.log('\n================================================================');
  console.log(`🔬 METHODOLOGY CONJUNCTION TEST SUMMARY:`);
  console.log(`   ✅ PASSED: ${passed}`);
  console.log(`   ❌ FAILED: ${failed}`);
  console.log(`   📊 TOTAL:  ${passed + failed}`);
  console.log(`   🎯 SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  return { passed, failed, total: passed + failed };
}

runMethodologyConjunctionTests().catch(err => {
  console.error('💥 CRITICAL TEST ERROR:', err.message);
  process.exit(1);
});
