import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { 
  FileText, 
  Folder, 
  Search,
  Zap,
  MoreHorizontal,
  RefreshCw,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
  Home,
  HardDrive,
  ExternalLink,
  Activity,
  BarChart3
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';
import { FolderPicker } from '../components/FolderPicker';
import toast from 'react-hot-toast';

interface FSEntry {
  name: string;
  path: string;
  extension?: string;
  size?: number;
  modified_at?: string;
  isSupported?: boolean;
  isIndexed?: boolean;
  documentId?: string;
}

interface FSExploreResult {
  currentPath: string;
  currentName: string;
  parentPath: string | null;
  directories: FSEntry[];
  files: FSEntry[];
  quickLocations: { id: string; label: string; icon: string; path: string }[];
}

interface QuickIndexProgress {
  jobId: string;
  folderId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  queued: number;
  processing: number;
  indexed: number;
  skipped: number;
  failed: number;
  bytesProcessed: number;
  error?: string;
}

interface QuickIndexState {
  jobId: string | null;
  progress: QuickIndexProgress | null;
  isPolling: boolean;
}

export function DocumentsPage() {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [exploreData, setExploreData] = useState<FSExploreResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = React.useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  
  const queryClient = useQueryClient();
  const quickIndexStateRef = useRef<QuickIndexState>({
    jobId: null,
    progress: null,
    isPolling: false
  });
  // Guards the quick-index polling loop: stops on unmount so the async loop
  // cannot keep polling (or toast) against a dead component.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: stats } = useQuery('indexing-stats', api.getIndexingStats);

  const SEP = '/';

  const loadPath = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      const data = await api.exploreFolder(path);
      setExploreData(data);
      setCurrentPath(data.currentPath);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Gagal memuat folder');
      setExploreData(null);
      setCurrentPath(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQuickIndex = useCallback(async (folderId: string) => {
    try {
      const result = await api.quickIndexFolder(folderId);
      const jobId = result.indexingJobId;
      
      quickIndexStateRef.current = {
        jobId,
        progress: null,
        isPolling: true
      };
      
      toast.loading('Memulai proses index cepat...', { id: 'quick-index-toast' });
      
      // Start polling for progress (stops on completion OR unmount)
      while (quickIndexStateRef.current.isPolling && isMountedRef.current) {
        try {
          const progressData = await api.getQuickIndexProgress(folderId);
          const progress = progressData.progress;
          
          if (progress) {
            quickIndexStateRef.current.progress = progress;
            
            if (progress.status === 'completed') {
              quickIndexStateRef.current.isPolling = false;
              if (isMountedRef.current) {
                toast.success(`Index cepat selesai: ${progress.indexed} dokumen diproses, ${progress.bytesProcessed} bytes`, { id: 'quick-index-toast' });
              }
              queryClient.invalidateQueries('indexing-stats');
              break;
            } else if (progress.status === 'failed') {
              quickIndexStateRef.current.isPolling = false;
              if (isMountedRef.current) {
                toast.error(`Index cepat gagal: ${progress.error}`, { id: 'quick-index-toast' });
              }
              break;
            }
          }
        } catch (e) {
          // Continue polling on error
        }
        
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Gagal memulai quick index');
    }
  }, [queryClient]);

  const getCurrentQuickIndexProgress = (): QuickIndexProgress | null => {
    const currentFolderId = folders ? (folders.folders?.[0]?.id || null) : null;
    if (currentFolderId) {
      const jobId = quickIndexStateRef.current.jobId;
      if (jobId) {
        return quickIndexStateRef.current.progress;
      }
    }
    return null;
  };

  const getJobIdForCurrentFolder = (): string | null => {
    const currentFolderId = folders?.folders?.[0]?.id;
    if (currentFolderId) {
      return (folders as any)?.folders?.find((f: any) => f.path === currentPath)?.id || null;
    }
    return null;
  };

  // Auto-open first connected folder on initial load
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened) return;
    if (currentPath) { setAutoOpened(true); return; }
    const connectedFolders = (folders as any)?.folders;
    if (!connectedFolders || connectedFolders.length === 0) return;
    const lastPath = localStorage.getItem('atlas_lastPath');
    if (lastPath) {
      const isValid = connectedFolders.some((f: any) => f.path === lastPath);
      if (isValid) {
        setAutoOpened(true);
        loadPath(lastPath);
        return;
      }
    }
    setAutoOpened(true);
    loadPath(connectedFolders[0].path);
  }, [folders, currentPath, autoOpened, loadPath]);

  // Persist currentPath to localStorage
  useEffect(() => {
    if (currentPath) {
      localStorage.setItem('atlas_lastPath', currentPath);
    }
  }, [currentPath]);

  // Handle ?open=path from HomePage redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPath = params.get('open');
    if (openPath && !currentPath && !autoOpened) {
      const decodedPath = decodeURIComponent(openPath);
      loadPath(decodedPath);
    }
  }, []);

  const handleFolderAdded = (folder: { id: string; path: string; name: string }) => {
    setShowFolderPicker(false);
    setCurrentPath(folder.path);
    loadPath(folder.path);
  };

  const navigateTo = (path: string) => {
    loadPath(path);
  };

  const navigateUp = () => {
    if (exploreData?.parentPath) {
      loadPath(exploreData.parentPath);
    }
  };

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getStatusBadge = (entry: FSEntry) => {
    if (entry.isIndexed) {
      return (
        <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-500/20 text-green-400 border border-green-500/30">
          <CheckCircle2 className="w-3 h-3 inline mr-1" /> Terindeks
        </span>
      );
    }
    if (entry.isSupported) {
      return (
        <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          <Clock className="w-3 h-3 inline mr-1" /> Belum diindex
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-surface-700 text-text-muted border border-border">
        <FileText className="w-3 h-3 inline mr-1" /> Tidak didukung
      </span>
    );
  };

  const progress = getCurrentQuickIndexProgress();

  // Progress kumulatif: indexed+failed+skipped naik menuju total.
  // JANGAN pakai `queued` — counter itu BERKURANG saat pekerjaan selesai
  // (progress.queued-- di indexing service), sehingga bar jalan terbalik.
  const quickIndexPercent = progress
    ? Math.min(100, ((progress.indexed + progress.failed + progress.skipped) / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Dokumen (DB)"
          value={stats?.totalDocuments || 0}
          icon={FileText}
          iconColor="primary"
        />
        <StatCard
          title="Terindeks"
          value={stats?.indexed || 0}
          icon={CheckCircle2}
          iconColor="success"
        />
        <StatCard
          title="Sedang Diproses"
          value={stats?.activeJobs || 0}
          icon={Clock}
          iconColor="warning"
        />
        <StatCard
          title="Folder Terhubung"
          value={folders?.folders?.length || 0}
          icon={Folder}
          iconColor="info"
        />
      </div>

      {/* Quick Index Progress Bar */}
      {progress && progress.status === 'running' && (
        <div className={cn(cardVariants.default, 'overflow-hidden')}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-surface-100">Quick Index Sedang Berjalan</p>
                <p className="text-xs text-text-muted">
                  {progress.indexed} selesai, {progress.processing} diproses, {progress.failed} gagal
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-surface-100">{Math.round(quickIndexPercent)}%</p>
                <p className="text-xs text-text-muted">{formatFileSize(progress.bytesProcessed)}</p>
              </div>
            </div>
          </div>
          <div className="h-2 bg-surface-800">
            <div 
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${quickIndexPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filesystem Explorer */}
      <section className={cn(cardVariants.default, 'overflow-hidden')}>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={navigateUp}
              disabled={!exploreData?.parentPath}
              className="p-2 text-text-muted hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Naik ke folder induk"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary-400" />
              <span className="font-medium text-surface-100 truncate max-w-xs">
                {exploreData?.currentName || 'Pilih folder untuk mulai'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                placeholder="Filter file di folder ini..."
                className="w-64 pl-9 pr-4 py-2 border border-border rounded-lg bg-surface-800 text-sm text-surface-100 placeholder-text-muted focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
              />
            </div>
            
            {folders && (folders as any)?.folders?.length > 0 && (
              <button 
                onClick={() => {
                  const currentFolder = (folders as any)?.folders?.find((f: any) => f.path === currentPath);
                  if (currentFolder) {
                    handleQuickIndex(currentFolder.id);
                  }
                }}
                disabled={isLoading || (progress?.status === 'running')}
                className={clsx(
                  buttonVariants.neon,
                  'text-sm font-bold',
                  (isLoading || progress?.status === 'running') && 'opacity-50 cursor-not-allowed'
                )}
                title="Index Cepat Semua Dokumen"
              >
                <Zap className="w-4 h-4 mr-1.5" />
                ⚡ Index Cepat
              </button>
            )}
            
            <button onClick={() => loadPath(currentPath!)} disabled={isLoading} className="p-2 text-text-muted hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={clsx('w-4 h-4', isLoading ? 'animate-spin' : '')} />
            </button>
            <button onClick={() => setShowFolderPicker(true)} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-surface-950 bg-primary-neon rounded-lg hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" />
              Tambah Folder
            </button>
          </div>
        </div>

        {/* Quick Locations */}
        {exploreData?.quickLocations && exploreData.quickLocations.length > 0 && (
          <div className="p-4 border-b border-border bg-surface-800/50">
            <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
              <Home className="w-3 h-3" />
              Akses cepat:
            </div>
            <div className="flex flex-wrap gap-2">
              {exploreData.quickLocations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => loadPath(loc.path)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary bg-surface-700 border border-border rounded-lg hover:bg-surface-600 hover:text-surface-100 transition-colors"
                >
                  <span>{loc.icon}</span>
                  {loc.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Path Breadcrumbs */}
        {currentPath && (
          <div className="px-4 py-2 bg-surface-800/50 border-b border-border text-xs text-text-muted overflow-x-auto">
            <span className="flex items-center gap-1">
              {currentPath.split(SEP).filter(Boolean).map((part, i, arr) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-text-muted/50" />}
                  <button
                    onClick={() => loadPath(arr.slice(0, i + 1).join(SEP))}
                    className="hover:text-primary-400 transition-colors truncate max-w-[150px]"
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
            </span>
          </div>
        )}

        {/* Directory Tree */}
        <div className="p-4">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary-neon border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-text-muted">Memuat direktori...</p>
            </div>
          ) : exploreData ? (
            <div className="space-y-2">
              {/* Directories */}
              {exploreData.directories.length > 0 && (
                <div className="space-y-1 mb-4">
                  <h4 className="px-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                    📁 Direktori ({exploreData.directories.length})
                  </h4>
                  {exploreData.directories.map((dir) => (
                    <DirectoryEntry
                      key={dir.path}
                      entry={dir}
                      isExpanded={expandedDirs.has(dir.path)}
                      onToggle={toggleDir}
                      onNavigate={navigateTo}
                    />
                  ))}
                </div>
              )}

              {/* Files */}
              {exploreData.files.length > 0 && (
                <div className="space-y-1">
                  <h4 className="px-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                    📄 File ({exploreData.files.length})
                  </h4>
                  {exploreData.files.map((file) => (
                    <FileEntry
                      key={file.path}
                      entry={file}
                      formatFileSize={formatFileSize}
                      getStatusBadge={getStatusBadge}
                    />
                  ))}
                </div>
              )}

              {(exploreData.directories.length === 0 && exploreData.files.length === 0) && (
                <div className="text-center py-12">
                  <Folder className="w-12 h-12 text-surface-600 mx-auto mb-4" />
                  <p className="text-text-muted">Folder ini kosong</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-800 mx-auto mb-6">
                <HardDrive className="w-10 h-10 text-surface-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-100 mb-2">
                Belum ada folder yang dibuka
              </h3>
              <p className="text-text-muted max-w-md mx-auto mb-6">
                Klik tombol "Tambah Folder" atau pilih lokasi cepat di atas untuk mulai menjelajahi filesystem.
              </p>
              <button onClick={() => setShowFolderPicker(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-surface-950 font-medium rounded-lg hover:opacity-90 transition-opacity text-sm">
                <Plus className="w-4 h-4" />
                Tambah Folder
              </button>
            </div>
          )}
        </div>
      </section>
      
      <FolderPicker 
        isOpen={showFolderPicker} 
        onClose={() => setShowFolderPicker(false)} 
        onSuccess={handleFolderAdded}
      />
    </div>
  );
}

function DirectoryEntry({ 
  entry, 
  isExpanded, 
  onToggle, 
  onNavigate 
}: { 
  entry: FSEntry; 
  isExpanded: boolean; 
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="group">
      <button
        onClick={() => {
          if (isExpanded) {
            onToggle(entry.path);
          } else {
            onNavigate(entry.path);
            onToggle(entry.path);
          }
        }}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
          'hover:bg-surface-700/50',
          isExpanded ? 'bg-primary-500/10 border-l-2 border-primary-500' : ''
        )}
      >
        <ChevronRight className={clsx(
          'w-4 h-4 flex-shrink-0 text-text-muted transition-transform',
          isExpanded ? 'rotate-90' : ''
        )} />
        <div className="p-2 bg-primary-500/15 rounded-lg">
          <Folder className="w-5 h-5 text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-100 truncate">{entry.name}</p>
          <p className="text-xs text-text-muted truncate font-mono">{entry.path}</p>
        </div>
        <span className="px-2 py-0.5 text-xs text-text-muted bg-surface-700 rounded">
          {isExpanded ? 'Tutup' : 'Buka'}
        </span>
      </button>
    </div>
  );
}

function FileEntry({ 
  entry, 
  formatFileSize,
  getStatusBadge
}: { 
  entry: FSEntry; 
  formatFileSize: (bytes: number) => string;
  getStatusBadge: (entry: FSEntry) => React.ReactNode;
}) {
  return (
    <div className="group p-3 hover:bg-surface-700/50 rounded-lg transition-colors border border-border/50">
      <div className="flex items-center gap-3">
        <div className={clsx(
          'p-2 rounded-lg border flex-shrink-0',
          entry.isIndexed ? 'bg-green-500/20 border-green-500/30' :
          entry.isSupported ? 'bg-yellow-500/20 border-yellow-500/30' :
          'bg-surface-700 border-border'
        )}>
          {entry.isIndexed ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : entry.isSupported ? (
            <FileText className="w-5 h-5 text-yellow-400" />
          ) : (
            <FileText className="w-5 h-5 text-text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-100 truncate">{entry.name}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-text-muted">
            <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-surface-700 text-text-muted border border-border">
              {entry.extension?.toUpperCase() || '-'}
            </span>
            <span>{formatFileSize(entry.size || 0)}</span>
            <span>{entry.modified_at ? new Date(entry.modified_at).toLocaleDateString('id-ID') : '-'}</span>
          </div>
          <p className="mt-1 text-xs text-text-muted/70 truncate font-mono">{entry.path}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {getStatusBadge(entry)}
          <button className="p-1.5 text-text-muted hover:text-primary-400 hover:bg-primary-500/10 rounded transition-colors" title="Buka file">
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, iconColor }: {
  title: string;
  value: number;
  icon: any;
  iconColor: 'primary' | 'success' | 'info' | 'warning';
}) {
  const iconColorClasses = {
    primary: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
    success: 'bg-green-500/20 text-green-400 border border-green-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  };

  return (
    <div className="bg-surface-800 border border-border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">{title}</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">
            {value.toLocaleString('id-ID')}
          </p>
        </div>
        <div className={clsx('p-3 rounded-lg border', iconColorClasses[iconColor])}>
          <Icon className="w-8 h-8" />
        </div>
      </div>
    </div>
  );
}