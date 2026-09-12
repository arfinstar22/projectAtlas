import React from 'react';
import { useQuery } from 'react-query';
import { 
  FolderOpen, 
  FileText, 
  Search, 
  Plus,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';

export function HomePage() {
  const { data: stats } = useQuery('stats', api.getStats);
  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: recentDocuments } = useQuery('recent-documents', () => 
    api.getDocuments({ limit: 5 })
  );

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Selamat Datang di ATLAS
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Lapisan kecerdasan untuk dokumen lokal Anda. Cari, pahami, dan temukan jawaban 
          dari koleksi dokumen tanpa mengirim file ke cloud.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Folder Terhubung"
          value={stats?.database?.folders || 0}
          icon={FolderOpen}
          color="blue"
        />
        <StatCard
          title="Total Dokumen"
          value={stats?.database?.documents || 0}
          icon={FileText}
          color="green"
        />
        <StatCard
          title="Terindeks"
          value={stats?.database?.indexed || 0}
          icon={CheckCircle2}
          color="purple"
        />
        <StatCard
          title="Chunk Tersedia"
          value={stats?.database?.chunks || 0}
          icon={Search}
          color="orange"
        />
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Search Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Cari atau Tanyakan Sesuatu
          </h3>
          <div className="space-y-4">
            <SearchBox />
            <div className="grid grid-cols-2 gap-3">
              <ActionButton
                to="/search"
                icon={Search}
                title="Pencarian Lanjutan"
                description="Filter dan cari dengan detail"
              />
              <ActionButton
                to="/chat"
                icon={MessageSquare}
                title="Tanya ATLAS"
                description="AI akan menjawab pertanyaan Anda"
              />
            </div>
          </div>
        </div>

        {/* Folder Management */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Folder Terhubung
            </h3>
            <button className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              <Plus className="w-4 h-4" />
              Tambah Folder
            </button>
          </div>

          {folders?.folders?.length > 0 ? (
            <div className="space-y-3">
              {folders.folders.map((folder: any) => (
                <FolderCard key={folder.id} folder={folder} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="Belum ada folder terhubung"
              description="Tambahkan folder pertama untuk mulai menggunakan ATLAS"
              action="Tambah Folder"
            />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Aktivitas Terbaru
        </h3>
        
        {recentDocuments?.data?.length > 0 ? (
          <div className="space-y-3">
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
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: {
  title: string;
  value: number;
  icon: any;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {value.toLocaleString('id-ID')}
          </p>
        </div>
        <div className={clsx('p-3 rounded-lg', colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function SearchBox() {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        placeholder="Cari dokumen atau tanyakan sesuatu..."
        className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>
  );
}

function ActionButton({ to, icon: Icon, title, description }: {
  to: string;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <button className="flex flex-col items-start p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
      <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400 mb-2" />
      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{title}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
    </button>
  );
}

function FolderCard({ folder }: { folder: any }) {
  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
      <div className="flex items-center gap-3">
        <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{folder.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{folder.path}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {folder.documentCount || 0} dokumen
        </span>
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
      </div>
    </div>
  );
}

function DocumentItem({ document }: { document: any }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'indexed': return 'text-green-600 dark:text-green-400';
      case 'processing': return 'text-yellow-600 dark:text-yellow-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'indexed': return CheckCircle2;
      case 'processing': return Clock;
      case 'error': return AlertCircle;
      default: return FileText;
    }
  };

  const StatusIcon = getStatusIcon(document.status);

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
      <div className="flex items-center gap-3">
        <StatusIcon className={clsx('w-5 h-5', getStatusColor(document.status))} />
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{document.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(document.modifiedAt).toLocaleDateString('id-ID')}
          </p>
        </div>
      </div>
      <span className={clsx('text-sm capitalize', getStatusColor(document.status))}>
        {document.status}
      </span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: {
  icon: any;
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <div className="text-center py-8">
      <Icon className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
      <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
      <p className="text-gray-500 dark:text-gray-400 mb-4">{description}</p>
      {action && (
        <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}