import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Files, 
  Search, 
  MessageSquare, 
  Settings,
  FolderPlus,
  Activity
} from 'lucide-react';
import { clsx } from 'clsx';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navigation = [
    { name: 'Beranda', href: '/', icon: Home },
    { name: 'Dokumen', href: '/documents', icon: Files },
    { name: 'Pencarian', href: '/search', icon: Search },
    { name: 'Tanya ATLAS', href: '/chat', icon: MessageSquare },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-neutral-800 shadow-sm border-r border-neutral-200 dark:border-neutral-700">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-neutral-200 dark:border-neutral-700">
          <img 
            src="/icons/logo.svg" 
            alt="ATLAS" 
            className="w-8 h-8" 
            width="32" 
            height="32"
          />
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">ATLAS</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Document Intelligence</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-4 py-6 space-y-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Quick Actions */}
        <div className="absolute bottom-6 left-4 right-4">
          <div className="p-4 bg-neutral-50 dark:bg-neutral-700 rounded-lg">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">Aksi Cepat</p>
            <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 rounded-md transition-colors">
              <FolderPlus className="w-4 h-4" />
              Tambah Folder
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pl-64">
        {/* Header */}
        <header className="bg-white dark:bg-neutral-800 shadow-sm border-b border-neutral-200 dark:border-neutral-700">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {getPageTitle(location.pathname)}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {getPageDescription(location.pathname)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200">
                <Activity className="w-4 h-4" />
                Status
              </button>
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