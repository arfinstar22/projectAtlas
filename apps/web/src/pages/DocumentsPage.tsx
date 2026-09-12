import React from 'react';
import { useQuery } from 'react-query';
import { 
  FileText, 
  Folder, 
  Search, 
  MoreHorizontal,
  RefreshCw,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  Plus
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

export function DocumentsPage() {
  const { data: documents, isLoading, refetch } = useQuery('documents', () => 
    api.getDocuments({ limit: 50 })
  );
  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: stats } = useQuery('indexing-stats', api.getIndexingStats);
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedDocuments = React.useMemo(() => {
    if (!documents?.data || !sortConfig) return documents?.data || [];
    
    return [...documents.data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [documents?.data, sortConfig]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Dokumen"
          value={documents?.total || 0}
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

      {/* Documents List */}
      <section className={cn(cardVariants.default, 'overflow-hidden')}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Semua Dokumen
            </h3>
            <span className={cn(badgeVariants.default)}>
              {documents?.total || 0} dokumen
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Filter dokumen..."
                className="w-64 pl-9 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <button onClick={() => refetch()} className={cn(buttonVariants.ghost, 'p-2')}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-neutral-600 dark:text-neutral-400">Memuat dokumen...</p>
          </div>
        ) : sortedDocuments?.length > 0 ? (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {sortedDocuments.map((document: any) => {
              const { color, bg, icon: StatusIcon, label } = getStatusConfig(document.status);
              
              return (
                <div key={document.id} className="p-4 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={cn('p-2 rounded-lg', bg)}>
                        <StatusIcon className={cn('w-5 h-5', color)} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {document.name}
                          </h4>
                          <span className={cn(badgeVariants.default, 'text-xs')}>
                            {document.extension.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500 dark:text-neutral-400 flex-wrap">
                          <span>{formatFileSize(document.size)}</span>
                          <span>{new Date(document.modifiedAt).toLocaleDateString('id-ID')}</span>
                          {document.metadata?.pageCount && (
                            <span>{document.metadata.pageCount} halaman</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500 truncate">
                          {document.path}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('px-2 py-1 text-xs rounded-full font-medium capitalize', bg, color)}>
                        {label}
                      </span>

                      <button className={cn(buttonVariants.ghost, 'p-2')} title="Lihat detail">
                        <Eye className="w-4 h-4" />
                      </button>

                      <div className="relative">
                        <button className={cn(buttonVariants.ghost, 'p-2')}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <DropdownMenu 
                          items={[
                            { label: 'Buka', icon: Eye, onClick: () => {} },
                            { label: 'Re-index', icon: RefreshCw, onClick: () => {} },
                            { label: 'Hapus', icon: AlertCircle, variant: 'danger', onClick: () => {} },
                          ]} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Belum ada dokumen"
            description="Tambahkan folder untuk mulai mengindeks dokumen"
            actionLabel="Tambah Folder"
            onAction={() => window.location.href = '/documents'}
          />
        )}
      </section>
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
    primary: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400',
    success: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    warning: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  };

  return (
    <div className={cn(cardVariants.default, 'p-6')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{title}</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {value.toLocaleString('id-ID')}
          </p>
        </div>
        <div className={cn('p-3 rounded-lg', iconColorClasses[iconColor])}>
          <Icon className="w-8 h-8" />
        </div>
      </div>
    </div>
  );
}

function getStatusConfig(status: string) {
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
}

function DropdownMenu({ items }: { items: Array<{ label: string; icon: any; variant?: 'default' | 'danger'; onClick: () => void }> }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) {
    return (
      <div ref={ref}>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
          className={cn(buttonVariants.ghost, 'p-2')}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
        className={cn(buttonVariants.ghost, 'p-2')}
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-50 animate-slide-up">
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => { item.onClick(); setIsOpen(false); }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
              item.variant === 'danger' 
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>
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
    <div className="p-12 text-center">
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