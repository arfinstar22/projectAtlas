import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('=== ATLAS RAG ENHANCEMENT TESTS ===\n');

  // Test 1: Health check
  try {
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✓ Health check:', health.data.status);
  } catch (error) {
    console.log('✗ Health check failed:', error.message);
  }

  // Test 2: Stats
  try {
    const stats = await axios.get(`${BASE_URL}/stats`);
    console.log('✓ Stats check:', stats.data);
  } catch (error) {
    console.log('✗ Stats check failed:', error.message);
  }

  // Test 3: Query Understanding & RAG Chat
  const testQueries = [
    {
      type: 'FACTUAL',
      query: 'Kapan pegawai mulai bekerja?',
      expectedIntent: 'factual'
    },
    {
      type: 'SUMMARY',
      query: 'Apa inti dari dokumen ini?',
      expectedIntent: 'summary'
    },
    {
      type: 'EXPLANATION',
      query: 'Jelaskan metodologi penelitian dalam skripsi secara sederhana',
      expectedIntent: 'explanation'
    },
    {
      type: 'COMPARISON',
      query: 'Bandingkan anggaran software dengan tunjangan karyawan',
      expectedIntent: 'comparison'
    },
    {
      type: 'ANTI-HALLUCINATION',
      query: 'Apa warna mobil saya?',
      expectedIntent: 'factual',
      shouldReject: true
    },
    {
      type: 'ANTI-HALLUCINATION 2',
      query: 'Siapa presiden pertama Indonesia?',
      expectedIntent: 'factual',
      shouldReject: true
    }
  ];

  console.log('\n--- Testing Chat Queries ---');
  for (const test of testQueries) {
    try {
      console.log(`\nTesting [${test.type}]: "${test.query}"`);
      const response = await axios.post(`${BASE_URL}/chat`, {
        message: test.query
      });

      console.log(`Response: ${response.data.response.substring(0, 100)}...`);
      console.log(`Sources count: ${response.data.sources.length}`);
      
      if (test.shouldReject) {
        if (response.data.sources.length === 0) {
          console.log('✓ Anti-hallucination check: PASS (rejected properly)');
        } else {
          console.log('✗ Anti-hallucination check: FAIL (not rejected)');
        }
      } else {
        console.log('✓ Query processed successfully');
      }

    } catch (error) {
      console.log(`✗ Test failed: ${error.message}`);
    }
  }

  console.log('\n=== TESTS COMPLETED ===');
}

runTests();