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
} from 'lucide-react';
import { clsx } from 'clsx';
import { cn, cardVariants, badgeVariants } from '../design-system';

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
  return (
    <div className="p-3 bg-surface-800/50 border border-border rounded-lg">
      <p className="text-xs text-text-muted mb-2">Folder Terhubung</p>
      <div className="text-center py-4">
        <svg className="w-8 h-8 text-surface-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-xs text-text-muted">Belum ada folder</p>
        <button className="mt-2 w-full px-3 py-1.5 text-xs font-medium text-surface-950 bg-primary-neon rounded-lg hover:opacity-90 transition-opacity">
          Tambah Folder
        </button>
      </div>
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