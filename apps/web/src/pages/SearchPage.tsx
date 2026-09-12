import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  Search, 
  Filter, 
  FileText, 
  ExternalLink,
  Clock,
  Folder
} from 'lucide-react';
import { api } from '../services/api';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keyword' | 'semantic' | 'hybrid'>('keyword');
  const [results, setResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { data: searchStats } = useQuery('search-stats', api.getSearchStats);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const searchResults = await api.search({
        query: query.trim(),
        mode,
        limit: 20
      });
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari dalam dokumen atau tanyakan sesuatu..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="keyword">Kata Kunci</option>
                <option value="semantic">Semantik</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search className="w-4 h-4" />
              {isSearching ? 'Mencari...' : 'Cari'}
            </button>
          </div>
        </form>

        {/* Search Stats */}
        {searchStats && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              <span>{searchStats.indexedDocuments} dokumen terindeks</span>
              <span>{searchStats.totalChunks} chunk tersedia</span>
              <span className={searchStats.searchableContent ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {searchStats.searchableContent ? '✓ Siap dicari' : '✗ Belum ada konten'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {results && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Hasil Pencarian
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ditemukan {results.total} hasil untuk "{results.query}"
            </p>
          </div>

          {results.results.length > 0 ? (
            <div className="space-y-4">
              {results.results.map((result: any, index: number) => (
                <SearchResult key={`${result.documentId}-${result.chunkId}`} result={result} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Tidak ada hasil ditemukan
              </h4>
              <p className="text-gray-500 dark:text-gray-400">
                Coba gunakan kata kunci yang berbeda atau periksa ejaan
              </p>
            </div>
          )}
        </div>
      )}

      {/* No Search Yet */}
      {!results && !isSearching && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-6" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Mulai Pencarian
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Gunakan search bar di atas untuk mencari konten dalam dokumen atau 
            ajukan pertanyaan tentang dokumen Anda.
          </p>
        </div>
      )}
    </div>
  );
}

function SearchResult({ result }: { result: any }) {
  const openDocument = () => {
    // TODO: Implement document opening
    console.log('Opening document:', result.document.path);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <h4 className="font-medium text-gray-900 dark:text-gray-100">
            {result.document.name}
          </h4>
        </div>
        <button
          onClick={openDocument}
          className="flex items-center gap-1 px-2 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Buka
        </button>
      </div>

      <p className="text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
        {result.snippet}
      </p>

      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        {result.metadata.page && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Halaman {result.metadata.page}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Folder className="w-3 h-3" />
          {result.document.extension.toUpperCase()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(result.document.modifiedAt).toLocaleDateString('id-ID')}
        </span>
        <span className="ml-auto bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
          Score: {result.score.toFixed(1)}
        </span>
      </div>
    </div>
  );
}