import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  Search, 
  Filter, 
  FileText, 
  ExternalLink,
  Clock,
  Folder,
  ChevronDown,
} from 'lucide-react';
import { api } from '../services/api';
import { cn, cardVariants, badgeVariants, buttonVariants, inputVariants } from '../design-system';

function SearchResult({ result, index }: { result: any; index: number }) {
  const openDocument = () => {
    console.log('Opening document:', result.document.path);
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-surface-800/50 transition-colors group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-mono bg-primary-500/20 text-primary-400 rounded">
            {index}
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-primary-400 flex-shrink-0" />
            <h4 className="font-medium text-surface-100 truncate">
              {result.document.name}
            </h4>
          </div>
        </div>
        <button
          onClick={openDocument}
          className="flex items-center gap-1 px-2 py-1 text-sm text-primary-400 hover:bg-primary-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
        >
          <ExternalLink className="w-3 h-3" />
          Buka
        </button>
      </div>

      <p className="text-text-secondary mb-3 leading-relaxed line-clamp-3">
        {result.snippet}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
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
        <span className="ml-auto px-2 py-0.5 bg-surface-800 rounded text-xs font-mono">
          Score: {result.score.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-800 mx-auto mb-4">
        <Icon className="w-8 h-8 text-surface-600" />
      </div>
      <h4 className="text-lg font-medium text-surface-100 mb-2">{title}</h4>
      <p className="text-text-muted max-w-md mx-auto">{description}</p>
    </div>
  );
}

function NoSearchYet() {
  return (
    <EmptyState
      icon={Search}
      title="Mulai Pencarian"
      description="Gunakan search bar di atas untuk mencari konten dalam dokumen atau ajukan pertanyaan tentang dokumen Anda."
    />
  );
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keyword' | 'semantic' | 'hybrid'>('keyword');
  const [results, setResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Search Form */}
      <section className="bg-surface-800 border border-border rounded-xl shadow-sm p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-surface-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari dalam dokumen atau tanyakan sesuatu..."
              className="w-full pl-10 pr-12 py-3 border border-border rounded-lg bg-surface-800 text-surface-100 placeholder-text-muted focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 px-4 py-2 rounded-lg transition-colors bg-primary-600 text-surface-950 hover:bg-primary-650 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-muted">Mode:</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
              >
                <option value="keyword">Kata Kunci</option>
                {/* Vector search over chunk embeddings (falls back to keyword
                    automatically when vectors/embeddings are unavailable). */}
                <option value="semantic">Semantik</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 border border-border text-surface-300 rounded-lg hover:bg-surface-700 transition-colors text-sm"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filter</span>
              </button>
            </div>
          </div>

          {/* Search Stats */}
          {searchStats && (
            <div className="pt-4 border-t border-border">
              <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
                <span>{searchStats.indexedDocuments} dokumen terindeks</span>
                <span>{searchStats.totalChunks} chunk tersedia</span>
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-medium border
                  ${searchStats.searchableContent 
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                    {searchStats.searchableContent ? '✓ Siap dicari' : '✗ Belum ada konten'}
                </span>
              </div>
            </div>
          )}

          {/* Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-border animate-slide-down">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    Ekstensi File
                  </label>
                  <select className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500">
                    <option value="">Semua</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                    <option value="txt">TXT</option>
                    <option value="md">Markdown</option>
                    <option value="csv">CSV</option>
                    <option value="xlsx">XLSX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    Folder
                  </label>
                  <select className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500">
                    <option value="">Semua Folder</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    Rentang Tanggal
                  </label>
                  <select className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500">
                    <option value="">Semua Waktu</option>
                    <option value="today">Hari Ini</option>
                    <option value="week">Minggu Ini</option>
                    <option value="month">Bulan Ini</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>

      {/* Search Results */}
      {results && (
        <section className="bg-surface-800 border border-border rounded-xl shadow-sm p-6">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-surface-100">
                  Hasil Pencarian
                </h3>
                <p className="text-sm text-text-muted">
                  Ditemukan {results.total} hasil untuk &ldquo;{results.query}&rdquo;
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Mode:</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400 border border-primary-500/30 text-xs">
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </span>
              </div>
            </div>

            {results.results && results.results.length > 0 ? (
              <div className="space-y-3">
                {results.results.map((result: any, index: number) => (
                  <SearchResult key={`${result.documentId}-${result.chunkId}`} result={result} index={index + 1} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title="Tidak ada hasil ditemukan"
                description="Coba gunakan kata kunci yang berbeda atau periksa ejaan"
              />
            )}
            </div>
          </section>
        )}

        {/* No Search Yet */}
        {!results && !isSearching && <NoSearchYet />}
      </div>
  );
}

