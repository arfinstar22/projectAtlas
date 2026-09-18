#!/usr/bin/env node
/**
 * E2E API smoke test for ATLAS.
 * Replicates the exact request/response flows of the web pages:
 *   DocumentsPage (add folder + quick index + browse),
 *   SearchPage (hybrid search), ChatPage (chat + sources shape),
 *   SettingsPage (ai status/models/config/test).
 *
 * Usage: BASE=http://localhost:3000/api node scripts/e2e-smoke.mjs
 */

const BASE = process.env.BASE || 'http://localhost:3000/api';
const TEST_DIR = process.env.TEST_DIR || '/tmp/atlas-e2e';

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: Boolean(cond), detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function req(method, path, body, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // ===== 0. Health (Header app) =====
  const health = await req('GET', '/health');
  ok('health: server hidup', health.status === 200 && health.data?.status === 'ok');

  // ===== 1. DocumentsPage: tambah folder + Quick Index =====
  let folderId = null;
  try {
    // Guard: bersihkan sisa run sebelumnya dengan path yang sama.
    const existing = await req('GET', '/folders');
    for (const f of (existing.data?.folders || [])) {
      if (f.path === TEST_DIR) await req('DELETE', `/folders/${f.id}`);
    }
    const added = await req('POST', '/folders', { path: TEST_DIR });
    folderId = added.data?.folder?.id;
    ok('tambah folder', added.status === 200 && Boolean(folderId), `id=${folderId}`);
  } catch (e) {
    ok('tambah folder', false, e.message);
  }

  if (folderId) {
    // Quick Index (tombol "⚡ Index Cepat")
    const qi = await req('POST', `/folders/${folderId}/quick-index`, {});
    const jobId = qi.data?.indexingJobId;
    ok('quick-index dimulai', qi.status === 200 && Boolean(jobId), `job=${jobId}`);

    // Polling persis seperti DocumentsPage.handleQuickIndex
    let progress = null;
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const p = await req('GET', `/folders/${folderId}/quick-index/progress`);
      progress = p.data?.progress;
      if (progress && (progress.status === 'completed' || progress.status === 'failed')) break;
    }
    ok('quick-index selesai', progress?.status === 'completed',
      `indexed=${progress?.indexed} skipped=${progress?.skipped} failed=${progress?.failed}`);

    // Daftar dokumen (getDocuments dengan folderId)
    const docs = await req('GET', `/documents?folderId=${folderId}&limit=50`);
    const docList = docs.data?.data || [];
    ok('dokumen terindeks muncul', docList.length > 0 && docList.every(d => d.status === 'indexed'),
      `${docList.length} dokumen`);
    var firstDoc = docList[0];
  }

  // ===== 2. DocumentsPage: Filesystem explorer (/fs/browse) =====
  const browse = await req('GET', `/fs/browse?path=${encodeURIComponent(TEST_DIR)}`);
  ok('fs/browse listing', browse.status === 200
    && Array.isArray(browse.data?.files)
    && Array.isArray(browse.data?.directories)
    && Array.isArray(browse.data?.quickLocations)
    && typeof browse.data?.files?.[0]?.modified_at === 'string',
    `files=${browse.data?.files?.length}`);

  const browseDenied = await req('GET', '/fs/browse?path=/etc');
  ok('fs/browse di luar allowlist ditolak (Bug #3 guard)', browseDenied.status === 403);

  // ===== 3. SearchPage: pencarian hybrid =====
  const search = await req('POST', '/search', { query: 'anggaran', mode: 'hybrid', limit: 10 });
  const searchResults = search.data?.results || [];
  ok('search hybrid menghasilkan hasil', search.data?.total > 0 && searchResults.length > 0,
    `total=${search.data?.total}`);
  const idx = searchResults.find(r => r.sourceType === 'indexed');
  ok('hasil terindeks punya snippet + dokumen', Boolean(idx?.snippet) && Boolean(idx?.document?.name),
    idx ? `doc=${idx.document.name}` : 'tidak ada result indexed');

  // ===== 4. ChatPage: Tanya ATLAS =====
  // 4a. Percakapan (deterministik, tanpa LLM)
  const conv = await req('POST', '/chat', { message: 'halo' }, 30000);
  ok('chat sapaan responsif', conv.status === 200
    && conv.data?.responseType === 'chat'
    && typeof conv.data?.response === 'string' && conv.data.response.length > 0,
    JSON.stringify(conv.data?.response).slice(0, 60));

  // 4b. Discovery dokumen
  const disc = await req('POST', '/chat', { message: 'carikan file laporan' }, 30000);
  ok('chat discovery mengembalikan daftar dokumen', disc.data?.responseType === 'discovery'
    && Array.isArray(disc.data?.discoveryDocuments)
    && disc.data.discoveryDocuments.length > 0,
    `${disc.data?.discoveryDocuments?.length} dokumen`);

  // 4c. Pertanyaan dokumen (RAG + LLM nyata; validasi kontrak sources = FLAT, Bug #4)
  const chat = await req('POST', '/chat', { message: 'Berapa total anggaran kegiatan tahun 2026?' }, 90000);
  const chatSources = chat.data?.sources || [];
  const flatShape = chatSources.length === 0 || chatSources.every(s =>
    typeof s.documentName === 'string' && typeof s.snippet === 'string'
    && (s.document === undefined || s.document === null));
  ok('chat jawaban diterima', chat.status === 200 && typeof chat.data?.response === 'string'
    && chat.data.response.length > 0,
    `${chat.data?.response?.length || 0} chars${chat.data?.fallbackNotice ? ' [fallbackNotice]' : ''}`);
  ok('sources berbentuk FLAT (kontrak Bug #4)', flatShape,
    chatSources.length > 0
      ? `keys=${Object.keys(chatSources[0]).join(',')}`
      : 'tidak ada sumber (jawaban umum)');

  // ===== 5. SettingsPage: AI status, models, config, test =====
  const status = await req('GET', '/ai/status');
  ok('ai/status lengkap (hasApiKey+model)', status.status === 200
    && typeof status.data?.hasApiKey === 'boolean'
    && typeof status.data?.model === 'string',
    `model=${status.data?.model} hasKey=${status.data?.hasApiKey}`);

  const models = await req('GET', '/ai/models', undefined, 30000);
  ok('ai/models katalog dimuat', models.status === 200 && models.data?.success === true
    && Array.isArray(models.data?.chat) && models.data.chat.length > 0,
    `chat=${models.data?.chat?.length} embedding=${models.data?.embedding?.length}`);

  const cfg = await req('POST', '/ai/config', { apiKey: '••••••••••••••••', model: 'openai/gpt-4o-mini' });
  ok('ai/config simpan (masked key diabaikan)', cfg.status === 200 && cfg.data?.success === true
    && cfg.data?.hasApiKey === true && cfg.data?.model === 'openai/gpt-4o-mini');

  const test = await req('POST', '/ai/test', {}, 40000);
  ok('ai/test koneksi', test.data?.success === true,
    `${test.data?.chatModelCount ?? '?'} model chat`);

  // ===== 6. Cleanup: hapus folder test + verifikasi allowlist dicabut =====
  if (folderId) {
    const del = await req('DELETE', `/folders/${folderId}`);
    ok('hapus folder test', del.status === 200 && del.data?.success === true);

    const revoked = await req('GET', `/fs/browse?path=${encodeURIComponent(TEST_DIR)}`);
    ok('akses folder terhapus dicabut (403)', revoked.status === 403);
  }

  // ===== Ringkasan =====
  const failed = results.filter(r => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length > 0) {
    console.log('GAGAL:', failed.map(f => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
