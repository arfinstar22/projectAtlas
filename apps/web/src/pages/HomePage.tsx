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
  Shield,
  Database,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';
import { FolderPicker } from '../components/FolderPicker';

export function HomePage() {
  const { data: stats } = useQuery('stats', api.getStats);
  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: recentDocuments } = useQuery('recent-documents', () => 
    api.getDocuments({ limit: 5 })
  );
  const [showFolderPicker, setShowFolderPicker] = React.useState(false);

  const handleFolderAdded = () => {
    setShowFolderPicker(false);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="text-center py-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/15 text-primary-400 text-sm font-medium mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-neon opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
          </span>
          ATLAS siap digunakan
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-surface-100 mb-4 tracking-tight">
          Selamat Datang di ATLAS
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
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
            <h3 className="text-lg font-semibold text-surface-100">
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
            <h3 className="text-lg font-semibold text-surface-100">
              Folder Terhubung
            </h3>
            <button 
              onClick={() => setShowFolderPicker(true)}
              className={cn(buttonVariants.neon, 'text-sm')}
            >
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-surface-100">
            Aktivitas Terbaru
          </h3>
          <span className={cn(badgeVariants.neon, 'text-xs')}>
            LIVE
          </span>
        </div>
        
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

{/* Privacy & Security */}
      <section className={cn(cardVariants.default, 'p-6 border-primary-500/20')}>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary-500/15 rounded-lg">
            <Shield className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-surface-100 mb-1">
              Privacy & Keamanan Lokal
            </h3>
            <ul className="space-y-1 text-sm text-text-secondary">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                File asli tetap di komputer Anda
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                Hanya konteks relevan dikirim ke AI
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                API key disimpan lokal, tidak di-upload
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                Akses folder dibatasi sesuai pilihan Anda
              </li>
            </ul>
          </div>
        </div>
      </section>
      
      {/* Folder Picker Modal */}
      <FolderPicker 
        isOpen={showFolderPicker} 
        onClose={() => setShowFolderPicker(false)} 
        onSuccess={handleFolderAdded}
      />
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
    primary: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
    success: 'bg-green-500/20 text-green-400 border border-green-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  };

  const trendColor = trend === '100%' || trend.includes('+') 
    ? 'text-green-400' 
    : 'text-text-muted';

  return (
    <div className={cn(cardVariants.default, 'p-6')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">{title}</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">
            {value.toLocaleString('id-ID')}
          </p>
          <p className={cn('text-xs mt-1', trendColor)}>{trend}</p>
        </div>
        <div className={cn('p-3 rounded-lg border', iconColorClasses[iconColor])}>
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
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-surface-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Cari dokumen atau tanyakan sesuatu..."
        className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-surface-800 text-surface-100 placeholder-text-muted focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
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
      className="flex flex-col items-start p-3 border border-border rounded-lg hover:bg-surface-700/50 hover:border-primary-500/30 transition-all text-left group"
    >
      <Icon className="w-5 h-5 text-primary-400 mb-2 group-hover:scale-110 transition-transform" />
      <span className="font-medium text-surface-100 text-sm">{title}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </a>
  );
}

function FolderCard({ folder }: { folder: any }) {
  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-surface-700/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-primary-500/15 rounded-lg">
          <FolderOpen className="w-5 h-5 text-primary-400" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-surface-100 truncate">{folder.name}</p>
          <p className="text-sm text-text-muted truncate">{folder.path}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">
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
        return { color: 'text-green-400', bg: 'bg-green-500/20 border border-green-500/30', icon: CheckCircle2, label: 'Terindeks' };
      case 'processing': 
        return { color: 'text-yellow-400', bg: 'bg-yellow-500/20 border border-yellow-500/30', icon: Clock, label: 'Diproses' };
      case 'error': 
        return { color: 'text-red-400', bg: 'bg-red-500/20 border border-red-500/30', icon: AlertCircle, label: 'Error' };
      default: 
        return { color: 'text-text-muted', bg: 'bg-surface-700 border border-border', icon: FileText, label: 'Menunggu' };
    }
  };

  const { color, bg, icon: StatusIcon, label } = getStatusConfig(document.status);

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-surface-700/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('p-2 rounded-lg border', bg)}>
          <StatusIcon className={cn('w-5 h-5', color)} />
        </div>
        <div>
          <p className="font-medium text-surface-100 truncate">{document.name}</p>
          <p className="text-sm text-text-muted">
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
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-800 mx-auto mb-4">
        <Icon className="w-8 h-8 text-surface-600" />
      </div>
      <h4 className="text-lg font-medium text-surface-100 mb-2">{title}</h4>
      <p className="text-text-muted mb-4 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-surface-950 font-medium rounded-lg hover:opacity-90 transition-opacity text-sm">
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

const iconColorClasses = {
  primary: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
  success: 'bg-green-500/20 text-green-400 border border-green-500/30',
  info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
};