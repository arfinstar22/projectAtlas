import React from 'react';
import { useQuery } from 'react-query';
import { 
  FolderOpen, 
  FileText, 
  Search, 
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

export function HomePage() {
  const { data: stats } = useQuery('stats', api.getStats);
  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: recentDocuments } = useQuery('recent-documents', () => 
    api.getDocuments({ limit: 5 })
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="text-center py-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
          </span>
          ATLAS siap digunakan
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-4 tracking-tight">
          Selamat Datang di ATLAS
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Lapisan kecerdasan untuk dokumen lokal Anda. Cari, pahami, dan temukan jawaban 
          dari koleksi dokumen tanpa mengirim file ke cloud.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Folder Terhubung"
          value={stats?.database?.folders || 0}
          icon={FolderOpen}
          iconColor="primary"
          trend="+2 minggu ini"
        />
        <StatCard
          title="Total Dokumen"
          value={stats?.database?.documents || 0}
          icon={FileText}
          iconColor="success"
          trend="+5 hari ini"
        />
        <StatCard
          title="Terindeks"
          value={stats?.database?.indexed || 0}
          icon={CheckCircle2}
          iconColor="info"
          trend={stats?.database?.indexed === stats?.database?.documents ? '100%' : 'Sedang proses'}
        />
        <StatCard
          title="Chunk Tersedia"
          value={stats?.database?.chunks || 0}
          icon={Search}
          iconColor="warning"
          trend="Siap dicari"
        />
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Section */}
        <section className={cn(cardVariants.default, 'p-6')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Cari atau Tanyakan Sesuatu
            </h3>
          </div>
          <div className="space-y-4">
            <SearchBox onNavigate={(path) => window.location.href = path} />
            <div className="grid grid-cols-2 gap-3">
              <ActionLink
                href="/search"
                icon={Search}
                title="Pencarian Lanjutan"
                description="Filter, mode, dan detail hasil"
              />
              <ActionLink
                href="/chat"
                icon={MessageSquare}
                title="Tanya ATLAS"
                description="AI menjawab dari dokumen Anda"
              />
            </div>
          </div>
        </section>

        {/* Folder Management */}
        <section className={cn(cardVariants.default, 'p-6')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Folder Terhubung
            </h3>
            <button className={cn(buttonVariants.primary, 'text-sm')}>
              <Plus className="w-4 h-4" />
              Tambah Folder
            </button>
          </div>

          {folders?.folders?.length > 0 ? (
            <div className="space-y-2">
              {folders.folders.map((folder: any) => (
                <FolderCard key={folder.id} folder={folder} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="Belum ada folder terhubung"
              description="Tambahkan folder pertama untuk mulai menggunakan ATLAS"
              actionLabel="Tambah Folder"
              onAction={() => window.location.href = '/documents'}
            />
          )}
        </section>
      </div>

      {/* Recent Activity */}
      <section className={cn(cardVariants.default, 'p-6')}>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Aktivitas Terbaru
        </h3>
        
        {recentDocuments?.data?.length > 0 ? (
          <div className="space-y-2">
            {recentDocuments.data.map((doc: any) => (
              <DocumentItem key={doc.id} document={doc} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="Belum ada aktivitas"
            description="Dokumen yang baru diindeks akan muncul di sini"
          />
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, iconColor, trend }: {
  title: string;
  value: number;
  icon: any;
  iconColor: 'primary' | 'success' | 'info' | 'warning';
  trend: string;
}) {
  const iconColorClasses = {
    primary: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400',
    success: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    warning: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  };

  const trendColor = trend === '100%' || trend.includes('+') 
    ? 'text-green-600 dark:text-green-400' 
    : 'text-neutral-500 dark:text-neutral-400';

  return (
    <div className={cn(cardVariants.default, 'p-6')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{title}</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {value.toLocaleString('id-ID')}
          </p>
          <p className={cn('text-xs mt-1', trendColor)}>{trend}</p>
        </div>
        <div className={cn('p-3 rounded-lg', iconColorClasses[iconColor])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function SearchBox({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [query, setQuery] = React.useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      onNavigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Cari dokumen atau tanyakan sesuatu..."
        className="w-full pl-10 pr-4 py-3 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
      />
    </div>
  );
}

function ActionLink({ href, icon: Icon, title, description }: {
  href: string;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <a 
      href={href}
      className="flex flex-col items-start p-3 border border-neutral-200 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors text-left group"
    >
      <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400 mb-2 group-hover:scale-110 transition-transform" />
      <span className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">{title}</span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{description}</span>
    </a>
  );
}

function FolderCard({ folder }: { folder: any }) {
  return (
    <div className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
          <FolderOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{folder.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">{folder.path}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {folder.documentCount || 0} dokumen
        </span>
        <div className="w-2 h-2 bg-green-500 rounded-full" />
      </div>
    </div>
  );
}

function DocumentItem({ document }: { document: any }) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'indexed': 
        return { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: CheckCircle2, label: 'Terindeks' };
      case 'processing': 
        return { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: Clock, label: 'Diproses' };
      case 'error': 
        return { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: AlertCircle, label: 'Error' };
      default: 
        return { color: 'text-neutral-600 dark:text-neutral-400', bg: 'bg-neutral-100 dark:bg-neutral-700', icon: FileText, label: 'Menunggu' };
    }
  };

  const { color, bg, icon: StatusIcon, label } = getStatusConfig(document.status);

  return (
    <div className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('p-2 rounded-lg', bg)}>
          <StatusIcon className={cn('w-5 h-5', color)} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{document.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {new Date(document.modifiedAt).toLocaleDateString('id-ID')}
          </p>
        </div>
      </div>
      <span className={cn('px-2 py-1 text-xs rounded-full font-medium capitalize', bg, color)}>
        {label}
      </span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: any;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 mx-auto mb-4">
        <Icon className="w-8 h-8 text-neutral-400 dark:text-neutral-600" />
      </div>
      <h4 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">{title}</h4>
      <p className="text-neutral-500 dark:text-neutral-400 mb-4 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className={cn(buttonVariants.primary, 'text-sm')}>
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}