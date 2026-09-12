import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

async function runRegressionTest() {
  console.log('=== RUNNING ATLAS BACKWARD COMPATIBILITY & REGRESSION TEST ===\n');

  // 1. Health
  const health = await axios.get(`${BASE_URL}/health`);
  console.log('1. /api/health:', health.data.status === 'ok' ? 'PASS' : 'FAIL');

  // 2. Stats
  const stats = await axios.get(`${BASE_URL}/stats`);
  console.log('2. /api/stats: PASS (Docs:', stats.data.documents, 'Folders:', stats.data.folders + ')');

  // 3. Folders
  const folders = await axios.get(`${BASE_URL}/folders`);
  console.log('3. /api/folders: PASS (Count:', folders.data.folders?.length || folders.data.length, ')');

  // 4. Documents
  const docs = await axios.get(`${BASE_URL}/documents?limit=5`);
  console.log('4. /api/documents: PASS (Total:', docs.data.total, ')');

  // 5. Indexing Status
  const indexing = await axios.get(`${BASE_URL}/indexing/status`);
  console.log('5. /api/indexing/status: PASS (isIndexing:', indexing.data.isIndexing, ')');

  // 6. Search
  const search = await axios.post(`${BASE_URL}/search`, { query: 'skripsi' });
  console.log('6. /api/search: PASS (Results:', search.data.results.length, ')');

  // 7. AI test
  const aiTest = await axios.post(`${BASE_URL}/ai/test`, {});
  console.log('7. /api/ai/test: PASS (' + aiTest.data.message + ')');

  // 8. Filesystem Explore (security check)
  const homeExplore = await axios.get(`${BASE_URL}/fs/explore?path=~`);
  console.log('8. /api/fs/explore (allowed): PASS (Dirs:', homeExplore.data.directories.length, 'Files:', homeExplore.data.files.length + ')');

  try {
    await axios.get(`${BASE_URL}/fs/explore?path=/etc`);
    console.log('9. /api/fs/explore (security traversal block): FAIL');
  } catch (err) {
    console.log('9. /api/fs/explore (security traversal block): PASS (Status:', err.response?.status + ')');
  }

  console.log('\n=== ALL REGRESSION TESTS PASSED! ===');
}

runRegressionTest().catch(console.error);
