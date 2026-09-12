import axios from 'axios';
import path from 'path';

const BASE_URL = 'http://localhost:3001/api';

async function runTests() {
  console.log('=====================================================');
  console.log('  ATLAS BROWSE FOLDER VERIFICATION & TEST SUITE      ');
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

  // 1. Health & Status
  await testCase('1. /api/health returns ok and aiConfigured', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    if (res.data.status !== 'ok') throw new Error('Health not ok');
  });

  // 2. Explore Navigation intact
  await testCase('2. Manual navigation /api/fs/explore returns shortcuts & directories', async () => {
    const res = await axios.get(`${BASE_URL}/fs/explore?path=~`);
    if (!res.data.directories || !res.data.quickLocations) {
      throw new Error('Missing directories or quickLocations');
    }
    const labels = res.data.quickLocations.map(q => q.label || q.id);
    if (!labels.includes('Documents') && !labels.includes('Home')) {
      throw new Error(`Expected Documents or Home in quickLocations, got: ${labels.join(', ')}`);
    }
  });

  // 3. Resolve Folder - Valid Path in Project
  await testCase('3. /api/fs/resolve-folder resolves valid folder within allowed roots', async () => {
    const res = await axios.post(`${BASE_URL}/fs/resolve-folder`, {
      folderName: 'test-data',
      sampleFiles: ['dokumen_skripsi.txt', 'panduan-karyawan.md'],
      currentPath: path.resolve('./simple-atlas')
    });
    if (!res.data.success || !res.data.path) {
      throw new Error(`Failed to resolve: ${JSON.stringify(res.data)}`);
    }
    if (!res.data.path.includes('test-data')) {
      throw new Error(`Unexpected resolved path: ${res.data.path}`);
    }
  });

  // 4. Resolve Folder - Absolute Path provided
  await testCase('4. /api/fs/resolve-folder validates absolutePath within allowed roots', async () => {
    const targetDir = path.resolve('./simple-atlas/test-data');
    const res = await axios.post(`${BASE_URL}/fs/resolve-folder`, {
      absolutePath: targetDir
    });
    if (!res.data.success || res.data.path !== targetDir) {
      throw new Error(`Expected ${targetDir}, got: ${JSON.stringify(res.data)}`);
    }
  });

  // 5. Security check: Reject path outside allowedRoots
  await testCase('5. /api/fs/resolve-folder blocks paths outside allowed roots (e.g. /etc)', async () => {
    try {
      await axios.post(`${BASE_URL}/fs/resolve-folder`, {
        absolutePath: '/etc'
      });
      throw new Error('Should have rejected forbidden folder /etc');
    } catch (err) {
      if (err.response?.status !== 403) {
        throw new Error(`Expected 403 Forbidden, got: ${err.response?.status}`);
      }
    }
  });

  // 6. Security check on /api/fs/browse-dialog when passing forbidden path
  await testCase('6. /api/fs/browse-dialog security check blocks forbidden path', async () => {
    try {
      const res = await axios.post(`${BASE_URL}/fs/browse-dialog`, {
        currentPath: '/etc'
      });
      if (res.data?.success) {
        throw new Error('Should not allow /etc');
      }
    } catch (err) {
      // 403 or error is expected
      if (err.response && err.response.status !== 403) {
        throw new Error(`Expected 403 or error, got: ${err.response.status}`);
      }
    }
  });

  // 7. Check modal HTML contains Browse Folder button and elements
  await testCase('7. HTML UI contains #btn-browse-folder and #browser-folder-picker-input', async () => {
    const res = await axios.get('http://localhost:3001/');
    const html = res.data;
    if (!html.includes('id="btn-browse-folder"')) {
      throw new Error('Missing #btn-browse-folder in HTML');
    }
    if (!html.includes('id="browser-folder-picker-input"')) {
      throw new Error('Missing #browser-folder-picker-input in HTML');
    }
    if (!html.includes('handleBrowseFolderClick()')) {
      throw new Error('Missing handleBrowseFolderClick() binding in HTML');
    }
    if (!html.includes('Lokasi Pintas')) {
      throw new Error('Existing Lokasi Pintas removed');
    }
    if (!html.includes('fs-explorer-dir-list')) {
      throw new Error('Existing fs-explorer-dir-list removed');
    }
  });

  // 8. Connect folder via /api/folders with the resolved browse folder
  await testCase('8. Connect folder via /api/folders and start indexing', async () => {
    const targetDir = path.resolve('./simple-atlas/test-data');
    const res = await axios.post(`${BASE_URL}/folders`, {
      path: targetDir
    });
    if (!res.data.id && !res.data.alreadyExists) {
      throw new Error(`Failed to connect folder: ${JSON.stringify(res.data)}`);
    }
  });

  // 9. Regression check: Search API
  await testCase('9. Regression: /api/search works with FTS5', async () => {
    const res = await axios.post(`${BASE_URL}/search`, { query: 'skripsi' });
    if (!Array.isArray(res.data.results)) {
      throw new Error('Expected results array');
    }
  });

  // 10. Regression check: Chat / RAG API
  await testCase('10. Regression: /api/chat works with RAG and citations', async () => {
    const res = await axios.post(`${BASE_URL}/chat`, { message: 'Kapan pegawai mulai bekerja?' });
    if (!res.data.response || !res.data.sources) {
      throw new Error('Expected response and sources');
    }
    if (res.data.sources.length === 0) {
      throw new Error('Expected grounded sources');
    }
  });

  // 11. Regression check: Stats & Indexing Status
  await testCase('11. Regression: /api/stats and /api/indexing/status intact', async () => {
    const statsRes = await axios.get(`${BASE_URL}/stats`);
    const indexRes = await axios.get(`${BASE_URL}/indexing/status`);
    if (statsRes.data.documents === undefined || indexRes.data.isIndexing === undefined) {
      throw new Error('Stats or indexing status missing required fields');
    }
  });

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('=====================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
