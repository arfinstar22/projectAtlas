import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Files, 
  Search, 
  MessageSquare, 
  Settings,
  FolderPlus,
  Activity,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FolderOpen,
  AlertTriangle,
  Loader2,
  X,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const navigation = [
    { name: 'Beranda', href: '/', icon: Home },
    { name: 'Dokumen', href: '/documents', icon: Files },
    { name: 'Pencarian', href: '/search', icon: Search },
    { name: 'Tanya ATLAS', href: '/chat', icon: MessageSquare },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-surface-950 text-surface-100">
      {/* Sidebar */}
      <div className={clsx(
        'fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out',
        'bg-surface-900 border-r border-border',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-6 border-b border-border">
          {!sidebarCollapsed && (
            <>
              <img 
                src="/assets/atlas-logo.png" 
                alt="ATLAS" 
                className="w-8 h-auto max-h-8 object-contain" 
                width="32"
              />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-surface-100 truncate">ATLAS</h1>
                <p className="text-xs text-text-muted truncate">Document Intelligence</p>
              </div>
            </>
          )}
          {sidebarCollapsed && (
            <div className="flex justify-center">
              <img 
                src="/assets/atlas-logo.png" 
                alt="ATLAS" 
                className="w-8 h-auto max-h-8 object-contain" 
                width="32"
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  sidebarCollapsed 
                    ? 'justify-center px-2' 
                    : 'justify-start px-3',
                  isActive
                    ? 'bg-primary-500/15 text-primary-400 border-l-2 border-primary-500'
                    : 'text-surface-300 hover:bg-surface-700 hover:text-surface-100'
                )}
                title={sidebarCollapsed ? item.name : undefined}
              >
                <item.icon className={clsx(
                  'w-5 h-5 flex-shrink-0',
                  isActive ? 'text-primary-400' : 'text-surface-400'
                )} />
                {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Connected Folders */}
        {!sidebarCollapsed && (
          <div className="absolute bottom-16 left-3 right-3 px-3">
            <ConnectedFolders />
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2 bg-surface-800 border border-border rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-all duration-200"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className={clsx(
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'pl-16' : 'pl-64'
      )}>
        {/* Header */}
        <header className="bg-surface-900/80 backdrop-blur-sm border-b border-border sticky top-0 z-40">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-surface-100 truncate">
                {getPageTitle(location.pathname)}
              </h2>
              <p className="text-sm text-text-muted truncate">
                {getPageDescription(location.pathname)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Global Search */}
              <GlobalSearch />
              {/* Status */}
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-800 border border-border rounded-lg">
                <div className="w-2 h-2 bg-primary-neon rounded-full animate-pulse" />
                <span className="text-sm text-surface-300">Siap</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ConnectedFolders() {
  const { data: folders } = useQuery('folders', api.getFolders);
  const queryClient = useQueryClient();
  const [folderMenuOpen, setFolderMenuOpen] = React.useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [folderToDelete, setFolderToDelete] = React.useState<{ id: string; name: string; path: string; documentCount: number } | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = React.useState(false);

  const deleteMutation = useMutation(
    (id: string) => api.removeFolder(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('folders');
        queryClient.invalidateQueries('stats');
        queryClient.invalidateQueries('documents');
        queryClient.invalidateQueries('indexing-stats');
        queryClient.invalidateQueries('search-stats');
        queryClient.invalidateQueries('indexing/jobs');
        toast.success('Folder dihapus dari ATLAS');
        setShowDeleteModal(false);
        setFolderToDelete(null);
      },
      onError: (error: any) => {
        toast.error(error?.response?.data?.error?.message || 'Gagal menghapus folder');
      }
    }
  );

  const deleteAllMutation = useMutation(
    api.removeAllFolders,
    {
      onSuccess: () => {
        queryClient.invalidateQueries('folders');
        queryClient.invalidateQueries('stats');
        queryClient.invalidateQueries('documents');
        queryClient.invalidateQueries('indexing-stats');
        queryClient.invalidateQueries('search-stats');
        queryClient.invalidateQueries('indexing/jobs');
        toast.success('Semua folder dihapus dari ATLAS');
        setShowDeleteAllModal(false);
      },
      onError: (error: any) => {
        toast.error(error?.response?.data?.error?.message || 'Gagal menghapus semua folder');
      }
    }
  );

  const reindexMutation = useMutation(
    (id: string) => api.scanFolder(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('folders');
        queryClient.invalidateQueries('stats');
        queryClient.invalidateQueries('documents');
        queryClient.invalidateQueries('indexing-stats');
        queryClient.invalidateQueries('indexing/jobs');
        toast.success('Re-indeks dimulai');
      },
      onError: (error: any) => {
        toast.error(error?.response?.data?.error?.message || 'Gagal memulai re-indeks');
      }
    }
  );

  const folderCount = folders?.folders?.length || 0;
  const totalDocuments = folders?.folders?.reduce((sum: number, f: any) => sum + (f.documentCount || 0), 0) || 0;

  const handleClickOutside = (e: MouseEvent) => {
    if (folderMenuOpen) {
      const target = e.target as HTMLElement;
      if (!target.closest('.folder-menu-wrapper')) {
        setFolderMenuOpen(null);
      }
    }
  };

  React.useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [folderMenuOpen]);

  return (
    <div className="p-3 bg-surface-800/50 border border-border rounded-lg">
      <p className="text-xs text-text-muted mb-2">Folder Terhubung</p>
      
      {folderCount === 0 ? (
        <div className="text-center py-4">
          <svg className="w-8 h-8 text-surface-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-xs text-text-muted">Belum ada folder</p>
          <p className="text-xs text-text-muted/50 mt-1">Tidak ada folder yang terhubung.</p>
          <button 
            className="mt-2 w-full px-3 py-1.5 text-xs font-medium text-surface-500 bg-surface-700 border border-border rounded-lg cursor-not-allowed opacity-50"
            disabled
          >
            Hapus Folder
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-text-muted">
              {folderCount} folder · {totalDocuments} dokumen
            </span>
          </div>
          
          {folders?.folders?.map((folder: any) => (
            <div key={folder.id} className="folder-menu-wrapper relative">
              <div className="p-3 bg-surface-800/50 border border-border rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-primary-500/15 rounded-lg">
                    <FolderOpen className="w-5 h-5 text-primary-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-surface-100 truncate">{folder.name}</p>
                    <p className="text-xs text-text-muted truncate">{folder.path}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded">
                    {folder.documentCount || 0} dokumen
                  </span>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id);
                      }}
                      className="p-1.5 text-text-muted hover:text-surface-100 hover:bg-surface-700 rounded transition-colors"
                      aria-label="Menu folder"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {folderMenuOpen === folder.id && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-surface-800 rounded-lg shadow-lg border border-border py-1 z-50 animate-slide-up">
                        <button
                          onClick={() => {
                            reindexMutation.mutate(folder.id);
                            setFolderMenuOpen(null);
                          }}
                          disabled={reindexMutation.isLoading}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-surface-300 hover:bg-surface-700 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Re-index
                        </button>
                        <button
                          onClick={() => {
                            setFolderToDelete({
                              id: folder.id,
                              name: folder.name,
                              path: folder.path,
                              documentCount: folder.documentCount || 0
                            });
                            setShowDeleteModal(true);
                            setFolderMenuOpen(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Hapus dari ATLAS
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Delete All - Separate action */}
          <div className="pt-2 border-t border-border/30">
            <button
              onClick={() => setShowDeleteAllModal(true)}
              disabled={deleteAllMutation.isLoading}
              className={cn(
                buttonVariants.danger,
                'w-full px-3 py-2 text-sm',
                deleteAllMutation.isLoading ? 'opacity-50' : ''
              )}
            >
              {deleteAllMutation.isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Menghapus semua...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Hapus Semua Folder</>
              )}
            </button>
            <p className="text-xs text-text-muted/50 text-center mt-1">
              Akan menghapus {folderCount} folder dan semua indeksnya
            </p>
          </div>
        </div>
      )}

      {/* Single Folder Delete Confirmation Modal */}
      {showDeleteModal && folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div className={cn(cardVariants.default, 'w-full max-w-md animate-slide-up')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/15 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-100">Hapus Folder dari ATLAS</h3>
                  <p className="text-sm text-text-muted">Konfirmasi penghapusan folder ini</p>
                </div>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="p-1 text-text-muted hover:text-surface-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="p-3 bg-surface-800/50 border border-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-surface-100 truncate">{folderToDelete.name}</p>
                    <p className="text-xs text-text-muted truncate">{folderToDelete.path}</p>
                  </div>
                  <span className="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded">
                    {folderToDelete.documentCount} dokumen
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border bg-red-500/5">
              <div className="text-center mb-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-300 font-medium">PENTING: Tindakan ini hanya menghapus folder dan indeksnya dari ATLAS.</p>
                <p className="text-xs text-red-300/80 mt-1">File asli di komputer Anda TIDAK akan dihapus.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteMutation.isLoading}
                  className={cn(buttonVariants.secondary, 'flex-1')}
                >
                  Batal
                </button>
                <button
                  onClick={() => deleteMutation.mutate(folderToDelete.id)}
                  disabled={deleteMutation.isLoading}
                  className={cn(buttonVariants.danger, 'flex-1')}
                >
                  {deleteMutation.isLoading ? 'Menghapus...' : 'Hapus dari ATLAS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm" onClick={() => setShowDeleteAllModal(false)}>
          <div className={cn(cardVariants.default, 'w-full max-w-md animate-slide-up')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/15 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-100">Hapus SEMUA Folder dari ATLAS</h3>
                  <p className="text-sm text-text-muted">Konfirmasi penghapusan semua folder</p>
                </div>
              </div>
              <button onClick={() => setShowDeleteAllModal(false)} className="p-1 text-text-muted hover:text-surface-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 max-h-60 overflow-y-auto">
              <div className="space-y-2">
                {folders?.folders?.map((folder: any) => (
                  <div key={folder.id} className="p-3 bg-surface-800/50 border border-border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-surface-100 truncate">{folder.name}</p>
                        <p className="text-xs text-text-muted truncate">{folder.path}</p>
                      </div>
                      <span className="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded">
                        {folder.documentCount || 0} dokumen
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-border bg-red-500/5">
              <div className="text-center mb-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-300 font-medium">PENTING: Tindakan ini akan menghapus SEMUA folder dan indeksnya dari ATLAS.</p>
                <p className="text-xs text-red-300/80 mt-1">File asli di komputer Anda TIDAK akan dihapus.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteAllModal(false)}
                  disabled={deleteAllMutation.isLoading}
                  className={cn(buttonVariants.secondary, 'flex-1')}
                >
                  Batal
                </button>
                <button
                  onClick={() => deleteAllMutation.mutate(undefined as any)}
                  disabled={deleteAllMutation.isLoading}
                  className={cn(buttonVariants.danger, 'flex-1')}
                >
                  {deleteAllMutation.isLoading ? 'Menghapus...' : 'Hapus Semua'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [query, setQuery] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <div className={`relative w-full max-w-md transition-all duration-300 ${isFocused ? 'max-w-xl' : 'max-w-md'}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500 transition-colors" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Cari dokumen, folder, atau tanyakan sesuatu..."
        className={clsx(
          'w-full pl-10 pr-4 py-2.5 rounded-lg transition-all duration-300',
          'bg-surface-800 border border-border text-surface-100',
          'placeholder:text-text-muted',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500',
          isFocused ? 'bg-surface-700 border-primary-500/50 shadow-[0_0_0_1px_rgb(34_197_94)] shadow-lg' : ''
        )}
      />
    </div>
  );
}

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/': 'Beranda',
    '/documents': 'Dokumen',
    '/search': 'Pencarian',
    '/chat': 'Tanya ATLAS',
    '/settings': 'Pengaturan',
  };
  return titles[pathname] || 'ATLAS';
}

function getPageDescription(pathname: string): string {
  const descriptions: Record<string, string> = {
    '/': 'Selamat datang di ATLAS - lapisan kecerdasan untuk dokumen Anda',
    '/documents': 'Kelola dan jelajahi dokumen yang telah diindeks',
    '/search': 'Cari konten dalam dokumen menggunakan kata kunci atau bahasa natural',
    '/chat': 'Tanyakan sesuatu tentang dokumen Anda',
    '/settings': 'Konfigurasi ATLAS sesuai kebutuhan Anda',
  };
  return descriptions[pathname] || '';
}

export default Layout;