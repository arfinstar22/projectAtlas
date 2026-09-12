/**
 * ATLAS — Hybrid Local Document Intelligence
 * Modern, Responsive Dark Theme Client Application
 */

// Application State
const state = {
  currentView: 'dashboard',
  stats: { folders: 0, documents: 0, indexed: 0, totalSize: 0 },
  folders: [],
  documents: [],
  selectedFolderId: null,
  fileTypeFilter: 'all',
  currentFsPath: null,
  parentFsPath: null,
  pendingDeleteFolderId: null,
  activePreviewDoc: null,
  isSearching: false,
  isChatting: false,
  aiConfigured: false
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  setupKeyboardShortcuts();
  await refreshAllData();
  await checkAiStatus();
  
  // Start polling for indexing progress every 3 seconds
  setInterval(pollIndexingStatus, 3000);
});

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl + K or Cmd + K: Focus Global Search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusGlobalSearch();
    }
    // Escape: Close any open modal
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  // Global search enter key
  const globalInput = document.getElementById('global-search-input');
  if (globalInput) {
    globalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && globalInput.value.trim()) {
        const query = globalInput.value.trim();
        navigateView('search');
        const mainInput = document.getElementById('main-search-input');
        if (mainInput) mainInput.value = query;
        performSearch(query);
      }
    });
  }
}

// ==========================================================================
// NAVIGATION & VIEW SWITCHING
// ==========================================================================

function navigateView(viewName) {
  state.currentView = viewName;

  // Update sidebar active link
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update panels visibility
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(`view-${viewName}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Update breadcrumb
  const breadcrumb = document.getElementById('breadcrumb-current');
  if (breadcrumb) {
    const titles = {
      dashboard: 'Dashboard',
      folders: 'Kelola Folder',
      browse: 'Jelajahi Berkas',
      search: 'Pencarian Dokumen',
      chat: 'Tanya ATLAS (AI)',
      settings: 'Pengaturan'
    };
    breadcrumb.textContent = titles[viewName] || viewName;
  }

  // Auto close mobile sidebar
  toggleSidebar(false);

  // Trigger view-specific loads
  if (viewName === 'folders') loadFoldersView();
  if (viewName === 'browse') {
    if (!state.browseTab) state.browseTab = 'explorer';
    switchBrowseTab(state.browseTab);
  }
  if (viewName === 'settings') loadSettingsView();
}

function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
  } else {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
  }
}

function focusGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (input) {
    input.focus();
    input.select();
  }
}

// ==========================================================================
// DATA LOADING & REFRESH
// ==========================================================================

async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadFolders(),
    loadRecentDocuments()
  ]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    state.stats = data;

    // Update Dashboard counts
    setElemText('dash-folders-count', data.folders || 0);
    setElemText('dash-docs-count', data.documents || 0);
    setElemText('dash-indexed-count', data.indexed || 0);
    setElemText('dash-storage-count', formatBytes(data.totalSize || 0));

    // Update Sidebar badges
    setElemText('sidebar-folders-count', data.folders || 0);
    setElemText('sidebar-docs-count', data.documents || 0);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadFolders() {
  try {
    const res = await fetch('/api/folders');
    if (!res.ok) return;
    const data = await res.json();
    state.folders = data.folders || [];
    renderSidebarFolderList();
  } catch (err) {
    console.error('Failed to load folders:', err);
  }
}

function renderSidebarFolderList() {
  const container = document.getElementById('sidebar-folder-list');
  if (!container) return;

  if (state.folders.length === 0) {
    container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted); padding:4px 8px;">Belum ada folder</span>`;
    return;
  }

  container.innerHTML = state.folders.map(f => `
    <div class="sidebar-folder-item" title="${escapeHtml(f.path)}" onclick="openFolderInBrowse('${f.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
      <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(f.name)}</span>
      <span style="margin-left:auto; font-size:0.7rem; color:var(--text-muted);">${f.document_count || 0}</span>
    </div>
  `).join('');
}

async function loadRecentDocuments() {
  try {
    const res = await fetch('/api/documents?limit=5&sort=modified_desc');
    if (!res.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('dashboard-recent-tbody');
    if (!tbody) return;

    if (!data.documents || data.documents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">Belum ada dokumen yang terhubung. Silakan tambahkan folder terlebih dahulu.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.documents.map(doc => `
      <tr>
        <td>
          <div class="file-cell">
            ${getFileExtBadge(doc.extension)}
            <span style="word-break:break-all;">${escapeHtml(doc.name)}</span>
          </div>
        </td>
        <td><span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(doc.folder_name || '-')}</span></td>
        <td>${formatBytes(doc.size || 0)}</td>
        <td>
          <button class="btn btn-outline-green btn-sm" onclick="openDocumentPreview('${doc.id}')">
            Pratinjau
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load recent docs:', err);
  }
}

// ==========================================================================
// FOLDERS VIEW (FOLDER MANAGER)
// ==========================================================================

async function loadFoldersView() {
  await loadFolders();
  const grid = document.getElementById('folders-page-grid');
  if (!grid) return;

  if (state.folders.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg);">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" style="color:var(--accent-green); margin-bottom:12px;"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
        <h3 style="font-size:1.15rem; color:var(--text-primary); margin-bottom:6px;">Belum Ada Folder Terhubung</h3>
        <p style="color:var(--text-secondary); font-size:0.88rem; max-width:400px; margin:0 auto 20px;">
          ATLAS membaca file dari komputer Anda secara lokal. Hubungkan folder dokumen untuk memulai.
        </p>
        <button class="btn btn-primary" onclick="openBrowseFolderModal()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
          <span>Pilih Folder Pertama</span>
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.folders.map(f => `
    <div class="folder-card">
      <div>
        <div class="folder-card-top">
          <div class="folder-icon-large">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          </div>
          <div class="folder-info">
            <h4>${escapeHtml(f.name)}</h4>
            <div class="folder-path-text">${escapeHtml(f.path)}</div>
          </div>
        </div>

        <div class="folder-meta-row">
          <span>Status</span>
          <span style="color:var(--accent-green-bright); display:flex; align-items:center; gap:6px;">
            <span class="status-dot"></span> Terindeks
          </span>
        </div>

        <div class="folder-meta-row" style="border-top:none;">
          <span>Dokumen</span>
          <strong style="color:var(--text-primary);">${f.document_count || 0} berkas</strong>
        </div>

        <div class="folder-meta-row" style="border-top:none;">
          <span>Terakhir Diindeks</span>
          <span>${f.last_indexed ? formatDate(f.last_indexed) : 'Baru saja'}</span>
        </div>
      </div>

      <div class="folder-actions">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openFolderInBrowse('${f.id}')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Jelajahi</span>
        </button>
        <button class="btn btn-outline-green btn-sm" onclick="triggerReindexFolder('${f.id}')" title="Indeks ulang folder">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>
        <button class="btn btn-danger btn-sm" onclick="promptDeleteFolder('${f.id}', '${escapeJsArg(f.name)}')" title="Hapus dari indeks">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ==========================================================================
// BROWSE FILES (INTERACTIVE FILE EXPLORER & LIBRARY)
// ==========================================================================

function switchBrowseTab(tabName) {
  state.browseTab = tabName;
  const btnExplorer = document.getElementById('tab-btn-explorer');
  const btnLibrary = document.getElementById('tab-btn-library');
  const paneExplorer = document.getElementById('browse-tab-explorer');
  const paneLibrary = document.getElementById('browse-tab-library');

  if (tabName === 'explorer') {
    if (btnExplorer) btnExplorer.classList.add('active');
    if (btnLibrary) btnLibrary.classList.remove('active');
    if (paneExplorer) paneExplorer.style.display = 'block';
    if (paneLibrary) paneLibrary.style.display = 'none';
    if (!state.browseFsData) loadFsBrowse();
  } else {
    if (btnLibrary) btnLibrary.classList.add('active');
    if (btnExplorer) btnExplorer.classList.remove('active');
    if (paneLibrary) paneLibrary.style.display = 'block';
    if (paneExplorer) paneExplorer.style.display = 'none';
    loadDocumentsView();
  }
}

function refreshBrowseView() {
  if (!state.browseTab || state.browseTab === 'explorer') {
    loadFsBrowse(state.currentBrowseFsPath);
  } else {
    loadDocumentsView();
  }
}

async function loadFsBrowse(targetPath) {
  const dirsGrid = document.getElementById('fs-browse-dirs-grid');
  const filesTbody = document.getElementById('fs-browse-files-tbody');
  const pathLabel = document.getElementById('fs-browse-path-label');
  const quickLocationsElem = document.getElementById('fs-browse-quick-locations');

  if (dirsGrid) dirsGrid.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:var(--text-muted); font-size:0.82rem; text-align:center;">Memuat folder...</div>`;
  if (filesTbody) filesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Memuat berkas direktori...</td></tr>`;

  try {
    const url = targetPath ? `/api/fs/explore?path=${encodeURIComponent(targetPath)}` : '/api/fs/explore';
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      if (dirsGrid) dirsGrid.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:var(--color-danger); font-size:0.82rem; text-align:center;">${escapeHtml(err.error || 'Akses ditolak')}</div>`;
      return;
    }

    const data = await res.json();
    state.browseFsData = data;
    state.currentBrowseFsPath = data.currentPath;
    state.parentBrowseFsPath = data.parentPath;

    if (!state.fsBrowseHistory) state.fsBrowseHistory = [];
    if (state.fsBrowseHistory[state.fsBrowseHistory.length - 1] !== data.currentPath) {
      state.fsBrowseHistory.push(data.currentPath);
    }

    if (pathLabel) {
      pathLabel.textContent = data.currentPath;
      pathLabel.title = data.currentPath;
    }

    // Quick shortcuts
    if (quickLocationsElem && data.quickLocations && data.quickLocations.length > 0) {
      quickLocationsElem.innerHTML = data.quickLocations.map(q => `
        <span class="chip" onclick="loadFsBrowse('${escapeJsArg(q.path)}')">${q.icon || '📁'} ${escapeHtml(q.label || q.name)}</span>
      `).join('');
    }

    renderFsBrowseContent(data.directories || [], data.files || []);
  } catch (err) {
    if (dirsGrid) dirsGrid.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:var(--color-danger); font-size:0.82rem; text-align:center;">Gagal memuat direktori: ${err.message}</div>`;
  }
}

function renderFsBrowseContent(directories, files) {
  const dirsGrid = document.getElementById('fs-browse-dirs-grid');
  const filesTbody = document.getElementById('fs-browse-files-tbody');
  const dirsCountElem = document.getElementById('fs-dirs-count');
  const filesCountElem = document.getElementById('fs-files-count');

  if (dirsCountElem) dirsCountElem.textContent = directories.length;
  if (filesCountElem) filesCountElem.textContent = files.length;

  // Render Subfolders
  if (dirsGrid) {
    if (directories.length === 0) {
      dirsGrid.innerHTML = `<div style="grid-column:1/-1; padding:14px; color:var(--text-muted); font-size:0.82rem;">Tidak ada subfolder di dalam direktori ini.</div>`;
    } else {
      dirsGrid.innerHTML = directories.map(d => `
        <div class="action-card" style="padding:12px 14px; cursor:pointer;" onclick="loadFsBrowse('${escapeJsArg(d.path)}')">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          </div>
          <div style="flex:1; overflow:hidden;">
            <strong style="font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(d.name)}</strong>
            <span style="font-size:0.75rem; color:var(--accent-green-bright); display:flex; align-items:center; gap:4px; margin-top:2px;">
              Buka Folder →
            </span>
          </div>
        </div>
      `).join('');
    }
  }

  // Render Files
  if (filesTbody) {
    if (files.length === 0) {
      filesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada berkas di dalam direktori ini.</td></tr>`;
    } else {
      filesTbody.innerHTML = files.map(f => {
        const isIndexedBadge = f.isIndexed ? 
          `<span style="color:var(--accent-green-bright); font-size:0.8rem; display:flex; align-items:center; gap:5px;"><span class="status-dot"></span> Terindeks</span>` :
          `<span style="color:var(--text-muted); font-size:0.8rem; display:flex; align-items:center; gap:5px;">○ Belum diindeks</span>`;

        const actionBtn = f.isIndexed && f.documentId ? 
          `<button class="btn btn-outline-green btn-sm" onclick="openDocumentPreview('${f.documentId}')">Pratinjau</button>` :
          (f.isSupported ? `<button class="btn btn-secondary btn-sm" onclick="connectCurrentBrowsingFolder()" title="Hubungkan folder ini untuk mengindeks file">Indeks Folder</button>` : `<span style="font-size:0.75rem; color:var(--text-muted);">-</span>`);

        return `
          <tr>
            <td>
              <div class="file-cell">
                ${getFileExtBadge(f.extension)}
                <span style="font-weight:500; color:var(--text-primary); word-break:break-all;">${escapeHtml(f.name)}</span>
              </div>
            </td>
            <td>${formatBytes(f.size || 0)}</td>
            <td><span style="font-size:0.8rem; color:var(--text-muted);">${formatDate(f.modified_at)}</span></td>
            <td>${isIndexedBadge}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

function navigateFsBrowseBack() {
  if (state.fsBrowseHistory && state.fsBrowseHistory.length > 1) {
    state.fsBrowseHistory.pop(); // remove current directory
    const prev = state.fsBrowseHistory.pop(); // retrieve previous directory
    if (prev) loadFsBrowse(prev);
  } else {
    showToast('Batas Navigasi', 'Tidak ada riwayat folder sebelumnya di sesi ini', 'info');
  }
}

function navigateFsBrowseParent() {
  if (state.parentBrowseFsPath) {
    loadFsBrowse(state.parentBrowseFsPath);
  } else {
    showToast('Batas Direktori', 'Sudah berada pada tingkat direktori teratas', 'info');
  }
}

function filterFsBrowseList() {
  const query = (document.getElementById('fs-browse-filter-input')?.value || '').toLowerCase().trim();
  if (!state.browseFsData) return;

  const filteredDirs = (state.browseFsData.directories || []).filter(d => d.name.toLowerCase().includes(query));
  const filteredFiles = (state.browseFsData.files || []).filter(f => f.name.toLowerCase().includes(query));
  renderFsBrowseContent(filteredDirs, filteredFiles);
}

function connectCurrentBrowsingFolder() {
  if (!state.currentBrowseFsPath) return;
  const dirName = state.currentBrowseFsPath.split('/').filter(Boolean).pop() || state.currentBrowseFsPath;
  state.selectedCandidateFolder = { path: state.currentBrowseFsPath, name: dirName };

  setElemText('confirm-connect-name', dirName);
  setElemText('confirm-connect-path', state.currentBrowseFsPath);
  openModal('modal-confirm-connect');
}

let librarySearchTimer = null;
function debounceLibrarySearch() {
  if (librarySearchTimer) clearTimeout(librarySearchTimer);
  librarySearchTimer = setTimeout(() => {
    loadDocumentsView();
  }, 250);
}

async function loadDocumentsView() {
  const sortSelect = document.getElementById('sort-docs-select');
  const sort = sortSelect ? sortSelect.value : 'modified_desc';
  const typeParam = state.fileTypeFilter !== 'all' ? `&type=${state.fileTypeFilter}` : '';
  const folderParam = state.selectedFolderId ? `&folderId=${state.selectedFolderId}` : '';
  const searchInput = document.getElementById('library-search-input');
  const searchParam = searchInput && searchInput.value.trim() ? `&search=${encodeURIComponent(searchInput.value.trim())}` : '';

  try {
    const res = await fetch(`/api/documents?sort=${sort}${typeParam}${folderParam}${searchParam}`);
    if (!res.ok) return;
    const data = await res.json();
    state.documents = data.documents || [];

    // Update filter counts & library total badge when viewing all documents so badges remain stable
    if (state.fileTypeFilter === 'all' && !searchParam && !folderParam) {
      updateFileTypeCounts(state.documents);
      setElemText('library-total-count', state.documents.length);
    }

    const tbody = document.getElementById('documents-table-body');
    if (!tbody) return;

    if (state.documents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">Tidak ada dokumen yang sesuai dengan filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.documents.map(doc => `
      <tr>
        <td>
          <div class="file-cell">
            ${getFileExtBadge(doc.extension)}
            <span style="font-weight:600; color:var(--text-primary); cursor:pointer;" onclick="openDocumentPreview('${doc.id}')">${escapeHtml(doc.name)}</span>
          </div>
        </td>
        <td><span style="color:var(--text-secondary); font-size:0.82rem;">${escapeHtml(doc.folder_name || '-')}</span></td>
        <td>${formatBytes(doc.size || 0)}</td>
        <td><span style="font-size:0.8rem; color:var(--text-muted);">${formatDate(doc.modified_at || doc.indexed_at)}</span></td>
        <td><span style="color:var(--accent-green-bright); font-size:0.8rem; display:flex; align-items:center; gap:5px;"><span class="status-dot"></span> Terindeks</span></td>
        <td>
          <button class="btn btn-outline-green btn-sm" onclick="openDocumentPreview('${doc.id}')">
            Pratinjau
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load docs view:', err);
  }
}

function updateFileTypeCounts(docs) {
  let pdf = 0, docx = 0, txt = 0, md = 0;
  docs.forEach(d => {
    const ext = (d.extension || '').toLowerCase();
    if (ext.includes('pdf')) pdf++;
    else if (ext.includes('docx')) docx++;
    else if (ext.includes('txt')) txt++;
    else if (ext.includes('md')) md++;
  });

  setElemText('count-type-all', docs.length);
  setElemText('count-type-pdf', pdf);
  setElemText('count-type-docx', docx);
  setElemText('count-type-txt', txt);
  setElemText('count-type-md', md);
}

function setFileTypeFilter(type, btn) {
  state.fileTypeFilter = type;
  document.querySelectorAll('.filter-pills .pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadDocumentsView();
}

function openFolderInBrowse(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  navigateView('browse');
  if (folder && folder.path) {
    switchBrowseTab('explorer');
    loadFsBrowse(folder.path);
  } else {
    switchBrowseTab('library');
    state.selectedFolderId = folderId;
    loadDocumentsView();
  }
}

// ==========================================================================
// REAL BROWSE FOLDER & FILESYSTEM NAVIGATION (LOCAL-FIRST)
// ==========================================================================

async function handleBrowseFolderClick() {
  const btn = document.getElementById('btn-browse-folder');
  const btnText = document.getElementById('btn-browse-folder-text');

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" class="spin" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Membuka...`;

  try {
    // 1. Try Native OS folder dialog via backend first
    const res = await fetch('/api/fs/browse-dialog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPath: state.currentFsPath })
    });

    const data = await res.json();

    if (data.success && data.path) {
      // Selected via OS dialog!
      selectFsDirectory(data.path, data.name || data.path.split('/').pop());
      loadFsExplorer(data.path);
      showToast('Folder Dipilih', `Berhasil memilih: ${data.name || data.path}`, 'success');
      return;
    }

    if (data.cancelled) {
      // User cancelled dialog - no error needed
      return;
    }

    if (data.unsupported || !res.ok) {
      // Fallback to browser picker if native OS dialog unsupported
      await openBrowserFolderPickerFallback();
    } else if (data.error) {
      showToast('Perhatian', data.error, 'warning');
    }
  } catch (err) {
    console.warn('Native dialog error, fallback to browser picker:', err);
    await openBrowserFolderPickerFallback();
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '📁 Browse Folder';
  }
}

async function openBrowserFolderPickerFallback() {
  // Option A: window.showDirectoryPicker (modern Chromium)
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      if (!dirHandle) return;

      const folderName = dirHandle.name;
      const sampleFiles = [];
      try {
        for await (const entry of dirHandle.values()) {
          sampleFiles.push(entry.name);
          if (sampleFiles.length >= 5) break;
        }
      } catch (_) {}

      // Resolve absolute path via backend
      const resolveRes = await fetch('/api/fs/resolve-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName,
          sampleFiles,
          currentPath: state.currentFsPath
        })
      });

      const resolveData = await resolveRes.json();
      if (resolveData.success && resolveData.path) {
        selectFsDirectory(resolveData.path, resolveData.name || folderName);
        loadFsExplorer(resolveData.path);
        showToast('Folder Dipilih', `Berhasil memilih folder: ${resolveData.name}`, 'success');
      } else {
        const assumedPath = state.currentFsPath ? `${state.currentFsPath}/${folderName}` : folderName;
        selectFsDirectory(assumedPath, folderName);
        showToast('Folder Terdeteksi', `Folder "${folderName}" terdeteksi. Silakan konfirmasi pada bagian "Folder Terpilih".`, 'info');
      }
      return;
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        return;
      }
      console.warn('showDirectoryPicker error:', pickerErr);
    }
  }

  // Option B: input webkitdirectory fallback
  const input = document.getElementById('browser-folder-picker-input');
  if (input) {
    input.value = '';
    input.click();
  } else {
    showToast('Info', 'Silakan pilih folder langsung melalui daftar direktori di bawah.', 'info');
  }
}

async function handleBrowserFolderSelected(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const firstFile = files[0];
  const relativePath = firstFile.webkitRelativePath || '';
  const folderName = relativePath.split('/')[0] || firstFile.name;
  const sampleFiles = Array.from(files).slice(0, 5).map(f => f.name);
  const absoluteFilePath = firstFile.path || '';

  try {
    const resolveRes = await fetch('/api/fs/resolve-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderName,
        sampleFiles,
        currentPath: state.currentFsPath,
        absolutePath: absoluteFilePath ? absoluteFilePath.substring(0, absoluteFilePath.lastIndexOf('/')) : null
      })
    });

    const resolveData = await resolveRes.json();
    if (resolveData.success && resolveData.path) {
      selectFsDirectory(resolveData.path, resolveData.name || folderName);
      loadFsExplorer(resolveData.path);
      showToast('Folder Dipilih', `Berhasil memilih folder: ${resolveData.name}`, 'success');
    } else {
      const fallbackPath = state.currentFsPath ? `${state.currentFsPath}/${folderName}` : folderName;
      selectFsDirectory(fallbackPath, folderName);
      showToast('Folder Dipilih', `Folder "${folderName}" dipilih. Anda dapat memverifikasi dari daftar direktori.`, 'info');
    }
  } catch (err) {
    showToast('Info', 'Silakan pilih folder langsung melalui daftar direktori di bawah.', 'info');
  }
}

function openBrowseFolderModal() {
  // Reset candidate selection
  state.selectedCandidateFolder = null;
  const nameElem = document.getElementById('selected-folder-name');
  const pathElem = document.getElementById('selected-folder-path');
  const inputElem = document.getElementById('modal-folder-path-input');

  if (nameElem) nameElem.textContent = 'Pilih folder di atas';
  if (pathElem) pathElem.textContent = 'Klik tombol "Pilih" pada folder di daftar';
  if (inputElem) inputElem.value = '';

  openModal('modal-browse-folder');
  loadFsExplorer();
}

// Server Filesystem Directory Explorer
async function loadFsExplorer(targetPath) {
  const container = document.getElementById('fs-explorer-dir-list');
  const pathLabel = document.getElementById('fs-current-path-label');
  const quickLocationsElem = document.getElementById('fs-quick-locations');
  if (!container) return;

  container.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-size:0.82rem; text-align:center;">Memuat daftar folder...</div>`;

  try {
    const url = targetPath ? `/api/fs/explore?path=${encodeURIComponent(targetPath)}` : '/api/fs/explore';
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      container.innerHTML = `<div style="padding:16px; color:var(--color-danger); font-size:0.82rem; text-align:center;">${escapeHtml(err.error || 'Akses direktori ditolak')}</div>`;
      return;
    }

    const data = await res.json();
    state.currentFsPath = data.currentPath;
    state.parentFsPath = data.parentPath;

    if (pathLabel) {
      pathLabel.textContent = data.currentPath;
      pathLabel.title = data.currentPath;
    }

    // Render Quick Shortcuts if available
    if (quickLocationsElem && data.quickLocations && data.quickLocations.length > 0) {
      quickLocationsElem.innerHTML = data.quickLocations.map(q => `
        <span class="chip" onclick="loadFsExplorer('${escapeJsArg(q.path)}')">${q.icon || '📁'} ${escapeHtml(q.label || q.name)}</span>
      `).join('');
    }

    if (!data.directories || data.directories.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 16px; color:var(--text-muted); font-size:0.82rem; text-align:center;">
          <div>📁 Tidak ada subfolder di dalam direktori ini.</div>
          <button class="btn btn-outline-green btn-sm" style="margin-top:8px;" onclick="selectCurrentBrowsingDirectory()">Pilih Direktori Ini</button>
        </div>
      `;
      return;
    }

    container.innerHTML = data.directories.map(d => {
      const isSelected = state.selectedCandidateFolder && state.selectedCandidateFolder.path === d.path;
      return `
        <div class="fs-dir-item ${isSelected ? 'selected' : ''}" onclick="selectFsDirectory('${escapeJsArg(d.path)}', '${escapeJsArg(d.name)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; font-weight:500;">${escapeHtml(d.name)}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline-green btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="event.stopPropagation(); selectFsDirectory('${escapeJsArg(d.path)}', '${escapeJsArg(d.name)}')">Pilih</button>
            <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="event.stopPropagation(); loadFsExplorer('${escapeJsArg(d.path)}')">Masuk →</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="padding:16px; color:var(--color-danger); font-size:0.82rem; text-align:center;">Gagal memuat direktori: ${err.message}</div>`;
  }
}

// Select specific directory from list
function selectFsDirectory(dirPath, dirName) {
  state.selectedCandidateFolder = { path: dirPath, name: dirName };

  const input = document.getElementById('modal-folder-path-input');
  const nameElem = document.getElementById('selected-folder-name');
  const pathElem = document.getElementById('selected-folder-path');

  if (input) input.value = dirPath;
  if (nameElem) nameElem.textContent = dirName;
  if (pathElem) pathElem.textContent = dirPath;

  // Highlight selected item in UI
  document.querySelectorAll('.fs-dir-item').forEach(item => {
    item.classList.remove('selected');
  });

  // Re-highlight clicked element if possible
  const items = document.querySelectorAll('.fs-dir-item');
  items.forEach(it => {
    if (it.textContent.includes(dirName)) {
      it.classList.add('selected');
    }
  });

  showToast('Folder Terpilih', dirName, 'info', 2000);
}

// Select currently browsing directory as candidate
function selectCurrentBrowsingDirectory() {
  if (!state.currentFsPath) return;
  const dirName = state.currentFsPath.split('/').filter(Boolean).pop() || state.currentFsPath;
  selectFsDirectory(state.currentFsPath, dirName);
}

function navigateFsParent() {
  if (state.parentFsPath) {
    loadFsExplorer(state.parentFsPath);
  } else {
    showToast('Batas Direktori', 'Sudah berada pada tingkat direktori teratas', 'info');
  }
}

// Open custom confirmation modal
function requestConnectFolderConfirmation() {
  const input = document.getElementById('modal-folder-path-input');
  const folderPath = input ? input.value.trim() : '';

  if (!folderPath) {
    showToast('Pilih Folder', 'Silakan pilih folder pada daftar di atas terlebih dahulu', 'warning');
    return;
  }

  const folderName = state.selectedCandidateFolder ? state.selectedCandidateFolder.name : (folderPath.split('/').filter(Boolean).pop() || folderPath);

  // Populate confirmation modal details
  setElemText('confirm-connect-name', folderName);
  setElemText('confirm-connect-path', folderPath);

  // Close browse modal and open confirmation modal
  closeModal('modal-browse-folder');
  openModal('modal-confirm-connect');
}

// Execute connection after confirmation
async function executeConnectFolder() {
  const input = document.getElementById('modal-folder-path-input');
  const folderPath = input ? input.value.trim() : '';

  if (!folderPath) {
    closeModal('modal-confirm-connect');
    showToast('Pilih Folder', 'Path folder tidak boleh kosong', 'warning');
    return;
  }

  const btn = document.getElementById('btn-execute-connect');
  if (btn) btn.disabled = true;

  closeModal('modal-confirm-connect');
  showToast('Mengindeks folder', 'Sedang memproses dokumen...', 'info');

  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast('Gagal menghubungkan folder', data.error || 'Folder tidak ditemukan atau tidak dapat diakses.', 'error');
      return;
    }

    if (data.alreadyExists) {
      showToast('Folder sudah terhubung', data.message || 'Folder ini sebelumnya sudah ditambahkan ke ATLAS.', 'warning');
    } else {
      showToast('Folder berhasil terhubung', `${data.name} siap diindeks.`, 'success');
    }

    if (input) input.value = '';
    state.selectedCandidateFolder = null;

    // Refresh data and start checking status
    await refreshAllData();
    pollIndexingStatus();
  } catch (err) {
    showToast('Gagal menghubungkan folder', `Koneksi gagal: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ==========================================================================
// FOLDER ACTIONS: REINDEX & REMOVE
// ==========================================================================

async function triggerReindexFolder(folderId) {
  try {
    showToast('Memulai indeks ulang folder...', 'info');
    const res = await fetch(`/api/folders/${folderId}/reindex`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Pengindeksan ulang dimulai', 'success');
      pollIndexingStatus();
    } else {
      showToast(data.error || 'Gagal re-index', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function triggerReindexAll() {
  try {
    showToast('Memulai indeks ulang seluruh folder...', 'info');
    const res = await fetch('/api/reindex-all', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Pengindeksan ulang seluruh folder dimulai', 'success');
      pollIndexingStatus();
    } else {
      showToast(data.error || 'Gagal re-index', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function promptDeleteFolder(folderId, folderName) {
  state.pendingDeleteFolderId = folderId;
  setElemText('delete-target-name', folderName);
  openModal('modal-confirm-delete');
}

async function executeConfirmedDelete() {
  if (!state.pendingDeleteFolderId) return;
  const folderId = state.pendingDeleteFolderId;

  try {
    const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Folder dihapus dari indeks ATLAS', 'success');
      closeModal('modal-confirm-delete');
      state.pendingDeleteFolderId = null;
      await refreshAllData();
      if (state.currentView === 'folders') loadFoldersView();
      if (state.currentView === 'browse') loadDocumentsView();
    } else {
      showToast(data.error || 'Gagal menghapus folder', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ==========================================================================
// DOCUMENT PREVIEW MODAL
// ==========================================================================

async function openDocumentPreview(docId) {
  openModal('modal-doc-preview');
  const titleElem = document.getElementById('preview-doc-title');
  const textElem = document.getElementById('preview-text-content');
  const extBadge = document.getElementById('preview-badge-ext');
  const metaFolder = document.getElementById('preview-meta-folder');
  const metaSize = document.getElementById('preview-meta-size');
  const metaDate = document.getElementById('preview-meta-date');

  if (titleElem) titleElem.textContent = 'Memuat berkas...';
  if (textElem) textElem.textContent = 'Mengekstrak teks pratinjau...';

  try {
    const res = await fetch(`/api/documents/${docId}`);
    if (!res.ok) {
      if (textElem) textElem.textContent = 'Dokumen tidak ditemukan atau gagal dimuat.';
      return;
    }
    const data = await res.json();
    const doc = data.document;
    state.activePreviewDoc = doc;

    if (titleElem) titleElem.textContent = doc.name;
    if (extBadge) {
      extBadge.className = `ext-badge ext-${(doc.extension || '').replace('.', '')}`;
      extBadge.textContent = (doc.extension || 'FILE').replace('.', '').toUpperCase();
    }
    if (metaFolder) metaFolder.textContent = doc.folder_name || '-';
    if (metaSize) metaSize.textContent = formatBytes(doc.size || 0);
    if (metaDate) metaDate.textContent = formatDate(doc.modified_at || doc.indexed_at);
    if (textElem) {
      textElem.textContent = doc.content || '(Dokumen ini kosong atau tidak memiliki lapisan teks)';
    }
  } catch (err) {
    if (textElem) textElem.textContent = `Error: ${err.message}`;
  }
}

function copyPreviewContent() {
  if (!state.activePreviewDoc || !state.activePreviewDoc.content) {
    showToast('Tidak ada konten teks untuk disalin', 'error');
    return;
  }
  navigator.clipboard.writeText(state.activePreviewDoc.content).then(() => {
    showToast('✓ Teks dokumen berhasil disalin ke clipboard', 'success');
  }).catch(() => {
    showToast('Gagal menyalin teks ke clipboard', 'error');
  });
}

// ==========================================================================
// SEARCH EXPERIENCE
// ==========================================================================

function handleSearchKey(e) {
  if (e.key === 'Enter') {
    performSearch();
  }
}

async function performSearch(customQuery) {
  const input = document.getElementById('main-search-input');
  const query = customQuery !== undefined ? customQuery : (input ? input.value.trim() : '');

  if (!query) {
    showToast('Ketik kata kunci pencarian terlebih dahulu', 'info');
    return;
  }

  const resultsContainer = document.getElementById('search-results-list');
  const counterElem = document.getElementById('search-status-counter');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = `
    <div style="text-align:center; padding:50px; color:var(--text-secondary);">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" class="spin" style="color:var(--accent-green); margin-bottom:10px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <div>Menelusuri indeks dokumen FTS5...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 30 })
    });

    const data = await res.json();
    if (!res.ok) {
      resultsContainer.innerHTML = `<div style="padding:20px; color:var(--color-danger); text-align:center;">${escapeHtml(data.error || 'Terjadi kesalahan pencarian')}</div>`;
      return;
    }

    const results = data.results || [];
    if (counterElem) counterElem.textContent = `${results.length} hasil untuk "${query}"`;

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg);">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" style="color:var(--text-muted); margin-bottom:12px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <h3 style="color:var(--text-primary); font-size:1.1rem; margin-bottom:6px;">Dokumen Tidak Ditemukan</h3>
          <p style="color:var(--text-secondary); font-size:0.88rem; max-width:400px; margin:0 auto;">
            Tidak ada dokumen yang memuat kata kunci "${escapeHtml(query)}". Coba kata kunci yang lebih umum.
          </p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = results.map(r => `
      <div class="search-result-card">
        <div class="result-card-header">
          <div class="result-file-title">
            ${getFileExtBadge(r.extension)}
            <span>${escapeHtml(r.name)}</span>
          </div>
          <button class="btn btn-outline-green btn-sm" onclick="openDocumentPreview('${r.documentId}')">
            Buka Dokumen
          </button>
        </div>

        <div class="result-snippet">
          ${r.snippet}
        </div>

        <div class="result-card-footer">
          <span>📁 ${escapeHtml(r.folderName || 'Folder')} &nbsp;•&nbsp; <code>${escapeHtml(r.path)}</code></span>
          <span>${formatBytes(r.size || 0)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    resultsContainer.innerHTML = `<div style="padding:20px; color:var(--color-danger); text-align:center;">Gagal melakukan pencarian: ${err.message}</div>`;
  }
}

function executeSearchFromChip(query) {
  navigateView('search');
  const input = document.getElementById('main-search-input');
  if (input) input.value = query;
  performSearch(query);
}

// ==========================================================================
// ASK ATLAS (AI CHAT & GROUNDED CITATIONS)
// ==========================================================================

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function askFromChip(question) {
  navigateView('chat');
  const input = document.getElementById('chat-input-textarea');
  if (input) input.value = question;
  sendChatMessage(question);
}

async function sendChatMessage(customMsg) {
  if (state.isChatting) return;

  const textarea = document.getElementById('chat-input-textarea');
  const message = customMsg !== undefined ? customMsg : (textarea ? textarea.value.trim() : '');

  if (!message) return;

  if (textarea) textarea.value = '';

  const messagesArea = document.getElementById('chat-messages');
  if (!messagesArea) return;

  // Append user bubble
  appendChatBubble('user', escapeHtml(message));

  // Append temporary thinking bubble
  const thinkingId = 'thinking-' + Date.now();
  appendThinkingBubble(thinkingId);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  state.isChatting = true;
  const sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    removeElement(thinkingId);

    if (!res.ok) {
      appendChatBubble('assistant', `⚠️ Maaf, terjadi kendala: ${data.error || 'Server tidak dapat memproses permintaan'}`);
      return;
    }

    // Append AI bubble with citations
    appendAiResponseBubble(data.response, data.sources || []);
  } catch (err) {
    removeElement(thinkingId);
    appendChatBubble('assistant', `⚠️ Gagal menghubungi server: ${err.message}`);
  } finally {
    state.isChatting = false;
    if (sendBtn) sendBtn.disabled = false;
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }
}

function appendChatBubble(role, htmlContent) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;

  const avatar = role === 'user' ? 
    `<div class="avatar user-avatar">U</div>` : 
    `<div class="avatar ai-avatar">A</div>`;

  bubble.innerHTML = `
    ${avatar}
    <div class="bubble-content">
      ${htmlContent}
    </div>
  `;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendThinkingBubble(id) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.id = id;
  bubble.className = 'chat-bubble assistant';
  bubble.innerHTML = `
    <div class="avatar ai-avatar">A</div>
    <div class="bubble-content" style="display:flex; align-items:center; gap:8px; color:var(--text-secondary);">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <span>Sedang mencari dokumen dan menyusun jawaban...</span>
    </div>
  `;
  container.appendChild(bubble);
}

function appendAiResponseBubble(responseText, sources) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble assistant';

  // Format simple markdown paragraphs, bold, blockquotes
  const formattedText = formatMarkdownToHtml(responseText);

  let citationsHtml = '';
  if (sources && sources.length > 0) {
    citationsHtml = `
      <div class="citation-box">
        <div class="citation-header">📄 Dokumen Sumber Rujukan (${sources.length})</div>
        <div class="citation-cards-row">
          ${sources.map(s => `
            <div class="citation-card-btn" onclick="openDocumentPreview('${s.documentId}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style="font-weight:600;">${escapeHtml(s.documentName)}</span>
              ${s.section ? `<span style="font-size:0.75rem; color:var(--text-muted);">(${escapeHtml(s.section)})</span>` : ''}
              <span style="font-size:0.75rem; color:var(--accent-green-bright); margin-left:auto;">Lihat Pratinjau →</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bubble.innerHTML = `
    <div class="avatar ai-avatar">A</div>
    <div class="bubble-content">
      <div>${formattedText}</div>
      ${citationsHtml}
    </div>
  `;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function checkAiStatus() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();
    state.aiConfigured = data.aiConfigured;

    const chatPill = document.getElementById('chat-ai-status-badge');
    const chatText = document.getElementById('chat-status-text');
    const chatDot = document.getElementById('chat-status-dot');

    const headerPill = document.getElementById('header-ai-pill');
    const headerText = document.getElementById('ai-pill-text');

    if (data.aiConfigured) {
      if (chatPill) chatPill.classList.add('active');
      if (chatText) chatText.textContent = `🟢 AI Aktif (${data.aiModel || 'OpenRouter'})`;
      if (chatDot) chatDot.style.backgroundColor = 'var(--accent-green)';

      if (headerPill) headerPill.classList.add('active');
      if (headerText) headerText.textContent = '🟢 AI Aktif';
    } else {
      if (chatPill) chatPill.classList.remove('active');
      if (chatText) chatText.textContent = '🟡 Mode Lokal';
      if (chatDot) chatDot.style.backgroundColor = 'var(--color-warning)';

      if (headerPill) headerPill.classList.remove('active');
      if (headerText) headerText.textContent = '🟡 Mode Lokal';
    }
  } catch (err) {
    console.error('Failed to check AI status:', err);
  }
}

// ==========================================================================
// SETTINGS
// ==========================================================================

async function loadSettingsView() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();

    const apiKeyInput = document.getElementById('setting-api-key');
    const modelSelect = document.getElementById('setting-ai-model');
    const chunkSizeInput = document.getElementById('setting-chunk-size');
    const chunkOverlapInput = document.getElementById('setting-chunk-overlap');
    const portInput = document.getElementById('setting-port');

    if (apiKeyInput) {
      apiKeyInput.value = data.apiKeyMasked || '';
    }
    if (modelSelect && data.aiModel) {
      modelSelect.value = data.aiModel;
    }
    if (chunkSizeInput) chunkSizeInput.value = data.chunkSize || 1200;
    if (chunkOverlapInput) chunkOverlapInput.value = data.chunkOverlap || 200;
    if (portInput) portInput.value = data.port || 3001;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const apiKey = (document.getElementById('setting-api-key')?.value || '').trim();
  const aiModel = document.getElementById('setting-ai-model')?.value || '';
  const chunkSize = parseInt(document.getElementById('setting-chunk-size')?.value) || 1200;
  const chunkOverlap = parseInt(document.getElementById('setting-chunk-overlap')?.value) || 200;

  const payload = { aiModel, chunkSize, chunkOverlap };
  if (apiKey && !apiKey.startsWith('••••')) {
    payload.apiKey = apiKey;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      showToast('✓ Pengaturan berhasil disimpan!', 'success');
      await checkAiStatus();
      await loadSettingsView();
    } else {
      showToast(data.error || 'Gagal menyimpan pengaturan', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function testAiConnection() {
  const btn = document.getElementById('btn-test-ai');
  if (btn) btn.disabled = true;
  showToast('Menguji koneksi ke OpenRouter AI...', 'info');

  const apiKeyInput = document.getElementById('setting-api-key')?.value || '';
  const aiModel = document.getElementById('setting-ai-model')?.value || '';
  const payload = { aiModel };
  if (apiKeyInput && !apiKeyInput.startsWith('••••')) {
    payload.apiKey = apiKeyInput;
  }

  try {
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || '✓ Koneksi AI sukses!', 'success');
      await checkAiStatus();
    } else {
      showToast(data.error || 'Uji koneksi AI gagal', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('setting-api-key');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ==========================================================================
// LIVE INDEXING STATUS POLLING
// ==========================================================================

let prevIsIndexing = false;

async function pollIndexingStatus() {
  try {
    const res = await fetch('/api/indexing/status');
    if (!res.ok) return;
    const data = await res.json();

    const liveCard = document.getElementById('live-indexing-card');
    const bar = document.getElementById('indexing-live-bar');
    const pct = document.getElementById('indexing-live-pct');
    const currentFile = document.getElementById('indexing-current-filename');
    const processedCount = document.getElementById('indexing-processed-count');

    const pill = document.getElementById('header-indexing-pill');
    const pillText = document.getElementById('indexing-pill-text');
    const pillDot = document.getElementById('indexing-pill-dot');

    if (data.isIndexing) {
      // Active indexing
      if (liveCard) liveCard.classList.add('visible');
      const progressPct = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;

      if (bar) bar.style.width = `${progressPct}%`;
      if (pct) pct.textContent = `${progressPct}%`;
      if (currentFile) currentFile.textContent = `Memproses: ${data.currentFile || '...'}`;
      if (processedCount) processedCount.textContent = `${data.processed} / ${data.total} berkas`;

      if (pill) pill.classList.add('active');
      if (pillText) pillText.textContent = `Mengindeks (${progressPct}%)`;
      if (pillDot) pillDot.classList.add('pulsing');
    } else {
      // Transition from active indexing to completed
      if (prevIsIndexing) {
        const count = data.processed || state.stats.documents || 0;
        showToast('✓ Indexing selesai', `${count} dokumen berhasil diindeks.`, 'success');
        refreshAllData();
        if (state.currentView === 'folders') loadFoldersView();
        if (state.currentView === 'browse') loadDocumentsView();
      }

      // Idle
      if (liveCard) liveCard.classList.remove('visible');
      if (pill) pill.classList.remove('active');
      if (pillText) pillText.textContent = 'Siap';
      if (pillDot) pillDot.classList.remove('pulsing');
    }

    prevIsIndexing = Boolean(data.isIndexing);
  } catch (err) {
    // Silently ignore polling errors
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS (ENHANCED UX)
// ==========================================================================

function showToast(titleOrMsg, descOrType, typeParam = 'info', durationParam = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  let title = '';
  let description = '';
  let type = 'info';

  const validTypes = ['success', 'info', 'warning', 'error'];

  if (validTypes.includes(descOrType)) {
    title = titleOrMsg;
    description = '';
    type = descOrType;
  } else {
    title = titleOrMsg || '';
    description = descOrType || '';
    type = validTypes.includes(typeParam) ? typeParam : 'info';
  }

  const icons = {
    success: '✓',
    info: '↻',
    warning: '!',
    error: '✕'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconText = icons[type] || 'ℹ';
  
  toast.innerHTML = `
    <div class="toast-icon-wrap">${iconText}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${description ? `<div class="toast-desc">${escapeHtml(description)}</div>` : ''}
    </div>
    <button class="toast-close-btn" onclick="this.closest('.toast').remove()">×</button>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto dismiss duration: 4s for success/info/warning, 6s for error
  const duration = durationParam || (type === 'error' ? 6000 : 4000);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 280);
  }, duration);
}

// ==========================================================================
// MODAL HELPERS
// ==========================================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
}

// Close modal when clicking on backdrop
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    closeAllModals();
  }
});

// ==========================================================================
// UTILITIES
// ==========================================================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return isoString;
  }
}

function getFileExtBadge(extension) {
  const clean = (extension || '').toLowerCase().replace('.', '');
  const classMap = {
    pdf: 'ext-pdf',
    docx: 'ext-docx',
    txt: 'ext-txt',
    md: 'ext-md'
  };
  const cls = classMap[clean] || 'ext-txt';
  return `<span class="ext-badge ${cls}">${(clean || 'FILE').toUpperCase()}</span>`;
}

function formatMarkdownToHtml(md) {
  if (!md) return '';
  let safe = escapeHtml(md);
  
  // Format bold **text**
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Format italic *text*
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Format code `code`
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Format blockquotes > quote
  safe = safe.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  // Format linebreaks
  safe = safe.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

  return safe;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJsArg(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function setElemText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}
