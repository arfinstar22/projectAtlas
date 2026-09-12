import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const api = {
  // Health and stats
  getHealth: () => client.get('/health').then(res => res.data),
  getStats: () => client.get('/stats').then(res => res.data),

  // Folders
  getFolders: () => client.get('/folders').then(res => res.data),
  addFolder: (path: string) => client.post('/folders', { path }).then(res => res.data),
  removeFolder: (id: string) => client.delete(`/folders/${id}`).then(res => res.data),
  scanFolder: (id: string) => client.post(`/folders/${id}/scan`).then(res => res.data),

  // Documents
  getDocuments: (params?: {
    folderId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => client.get('/documents', { params }).then(res => res.data),
  
  getDocument: (id: string) => client.get(`/documents/${id}`).then(res => res.data),
  reindexDocument: (id: string) => client.post(`/documents/${id}/reindex`).then(res => res.data),
  getDocumentSource: (id: string) => client.get(`/documents/${id}/source`).then(res => res.data),

  // Search
  search: (query: {
    query: string;
    mode?: 'keyword' | 'semantic' | 'hybrid';
    limit?: number;
    filters?: any;
  }) => client.post('/search', query).then(res => res.data),

  getSearchStats: () => client.get('/search/stats').then(res => res.data),

  // Indexing
  getJobs: (status?: string) => client.get('/indexing/jobs', { 
    params: status ? { status } : undefined 
  }).then(res => res.data),
  
  getJob: (id: string) => client.get(`/indexing/jobs/${id}`).then(res => res.data),
  cancelJob: (id: string) => client.post(`/indexing/jobs/${id}/cancel`).then(res => res.data),
  getIndexingStats: () => client.get('/indexing/stats').then(res => res.data),

  // AI Chat
  chat: (message: string, conversationId?: string) => 
    client.post('/chat', { message, conversationId }).then(res => res.data),
  
  getAIStatus: () => client.get('/ai/status').then(res => res.data),
  testAIConnection: () => client.post('/ai/test').then(res => res.data),

  // Filesystem security
  checkPathAccess: (path: string) => 
    client.get('/fs/explore', { params: { path } }).then(res => res.data),
};