import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}/api`;

async function main() {
  console.log(`Checking ATLAS server on ${BASE_URL}...`);
  
  // 1. Health check
  const health = await axios.get(`${BASE_URL}/health`);
  console.log('Health:', health.data);

  // 2. Folders
  const foldersRes = await axios.get(`${BASE_URL}/folders`);
  console.log('Existing folders:', foldersRes.data.folders.length);

  for (const f of foldersRes.data.folders) {
    console.log(`Scanning existing folder ${f.name} (${f.id})...`);
    await axios.post(`${BASE_URL}/folders/${f.id}/scan`);
  }

  if (foldersRes.data.folders.length === 0) {
    const dataDir = path.resolve('./data');
    console.log(`Adding and scanning folder: ${dataDir}`);
    await axios.post(`${BASE_URL}/folders`, { path: dataDir });
  }

  console.log('Waiting 5s for indexing chunks to process...');
  await new Promise(r => setTimeout(r, 5000));

  const stats = await axios.get(`${BASE_URL}/stats`);
  console.log('\n--- ATLAS STATS AFTER INDEXING ---');
  console.log(JSON.stringify(stats.data, null, 2));

  // Verify Documents
  const docsRes = await axios.get(`${BASE_URL}/documents`);
  console.log('\nIndexed documents:', docsRes.data.data.map(d => ({ name: d.name, status: d.status })));
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
});
