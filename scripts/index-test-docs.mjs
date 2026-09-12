import axios from 'axios';
import path from 'path';

const BASE_URL = 'http://localhost:3000/api';

async function indexTestDocuments() {
  console.log('=== INDEXING TEST DOCUMENTS ===\n');

  try {
    // 1. Add folder
    const dataDir = path.resolve('./data');
    console.log(`Adding folder: ${dataDir}`);
    const folderRes = await axios.post(`${BASE_URL}/folders`, {
      path: dataDir
    });
    console.log('Folder added:', folderRes.data);

    // Wait for indexing to complete
    console.log('Waiting for indexing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check stats
    const stats = await axios.get(`${BASE_URL}/stats`);
    console.log('Current stats:', stats.data);

  } catch (error) {
    console.error('Error during indexing:', error.response?.data || error.message);
  }
}

indexTestDocuments();