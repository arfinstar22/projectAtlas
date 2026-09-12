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
  Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';

export function DocumentsPage() {
  const { data: documents, isLoading, refetch } = useQuery('documents', () => 
    api.getDocuments({ limit: 50 })
  );
  const { data: folders } = useQuery('folders', api.getFolders);
  const { data: stats } = useQuery('indexing-stats', api.getIndexingStats);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'indexed': return CheckCircle2;
      case 'processing': return Clock;
      case 'error': return AlertCircle;
      default: return FileText;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'indexed': return 'text-green-600 dark:text-green-400';
      case 'processing': return 'text-yellow-600 dark:text-yellow-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
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

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Dokumen</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {documents?.total || 0}
              </p>
            </div>
            <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Terindeks</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {stats?.indexed || 0}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Sedang Diproses</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {stats?.activeJobs || 0}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Folder</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {folders?.folders?.length || 0}
              </p>
            </div>
            <Folder className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Semua Dokumen
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Memuat dokumen...</p>
          </div>
        ) : documents?.data?.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {documents.data.map((document: any) => {
              const StatusIcon = getStatusIcon(document.status);
              
              return (
                <div key={document.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <StatusIcon className={clsx('w-6 h-6', getStatusColor(document.status))} />
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {document.name}
                        </h4>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span>{document.extension.toUpperCase()}</span>
                          <span>{formatFileSize(document.size)}</span>
                          <span>{new Date(document.modifiedAt).toLocaleDateString('id-ID')}</span>
                          {document.metadata?.pageCount && (
                            <span>{document.metadata.pageCount} halaman</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate">
                          {document.path}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={clsx('px-2 py-1 text-xs rounded-full capitalize', 
                        document.status === 'indexed' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : document.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : document.status === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                      )}>
                        {document.status}
                      </span>

                      <button className="flex items-center gap-2 px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                        Lihat
                      </button>

                      <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Belum ada dokumen
            </h4>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Tambahkan folder untuk mulai mengindeks dokumen
            </p>
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              Tambah Folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}