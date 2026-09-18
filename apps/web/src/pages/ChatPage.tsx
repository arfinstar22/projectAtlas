import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  MessageSquare, 
  ShieldAlert, 
  Send, 
  FileText, 
  ExternalLink,
  Loader2,
  Brain,
  AlertCircle,
  Search,
  File,
  FolderOpen,
  Clock,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

interface DiscoveryDocument {
  id: string;
  name: string;
  extension: string;
  size: number;
  path: string;
  status: string;
  folderId: string;
  modifiedAt: string;
}

// Shape returned by AIService.prepareSources() (flat, NOT nested).
interface ChatSource {
  documentId: string;
  documentName: string;
  chunkId: string;
  page?: number;
  snippet: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  fallbackNotice?: string;
  responseType?: 'chat' | 'discovery';
  discoveryDocuments?: DiscoveryDocument[];
  timestamp: Date;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { data: searchStats } = useQuery('search-stats', api.getSearchStats);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.chat(input.trim());

      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.response,
        sources: response.sources,
        fallbackNotice: response.fallbackNotice,
        responseType: response.responseType,
        discoveryDocuments: response.discoveryDocuments,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: error.response?.data?.error?.message || 'Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Pastikan dokumen sudah terindeks dan coba lagi.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Gagal mendapatkan jawaban dari AI');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className={cn(cardVariants.default, 'rounded-t-xl border-b-0 p-4')}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-500/15 rounded-lg">
            <Brain className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-surface-100">
              Tanya ATLAS
            </h3>
            <p className="text-sm text-text-muted">
              AI assistant untuk dokumen Anda
            </p>
          </div>
        </div>

        {/* Status */}
        {searchStats && (
          <div className="mt-3 p-2 bg-surface-800/50 border border-border rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              {searchStats.searchableContent ? (
                <>
                  <div className="w-2 h-2 bg-primary-neon rounded-full animate-pulse" />
                  <span className="text-text-secondary">
                    Siap menjawab dari {searchStats.indexedDocuments} dokumen terindeks
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                  <span className="text-text-muted">
                    Belum ada dokumen terindeks. Tambahkan folder untuk mulai.
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 bg-surface-900/50 border-x border-border overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/15 mx-auto mb-6">
              <MessageSquare className="w-8 h-8 text-primary-400" />
            </div>
            <h3 className="text-xl font-semibold text-surface-100 mb-2">
              Mulai Percakapan
            </h3>
            <p className="text-text-muted max-w-md mx-auto mb-6">
              Tanyakan apa saja tentang dokumen Anda. ATLAS akan mencari dan memberikan jawaban berdasarkan konten dokumen.
            </p>
            
            <div className="space-y-2 text-sm text-text-muted">
              <p><strong>Contoh pertanyaan:</strong></p>
              <div className="space-y-1 text-left max-w-md mx-auto">
                <p>• "Berapa total anggaran kegiatan tahun 2025?"</p>
                <p>• "Apa saja persyaratan dalam SOP kepegawaian?"</p>
                <p>• "Bandingkan laporan 2024 dan 2025"</p>
                <p>• "Jelaskan metodologi yang digunakan"</p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>ATLAS sedang mencari jawaban...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={cn(cardVariants.default, 'rounded-b-xl border-t-0 border-border p-4')}>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan sesuatu tentang dokumen Anda..."
            disabled={isLoading || !searchStats?.searchableContent}
            className="flex-1 px-4 py-3 border border-border rounded-lg bg-surface-800 text-surface-100 placeholder-text-muted focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !searchStats?.searchableContent}
            className={cn(buttonVariants.neon, 'px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed')}
          >
            <Send className="w-4 h-4" />
            Kirim
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={cn('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-3xl rounded-lg p-4 space-y-3',
        message.type === 'user' 
          ? 'bg-primary-600 text-surface-950' 
          : 'bg-surface-800 text-surface-100 border border-border'
      )}>
        {message.responseType === 'discovery' ? (
          <>
            <p className="leading-relaxed">{message.content}</p>
            <DiscoveryResults documents={message.discoveryDocuments || []} />
          </>
        ) : (
          <>
            <p className="leading-relaxed">{message.content}</p>
            
            {message.fallbackNotice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{message.fallbackNotice}</span>
              </div>
            )}
            
            {message.sources && message.sources.length > 0 && (
              <div className="border-t border-border/50 pt-3 mt-3">
                <p className="text-sm font-medium mb-2 text-text-muted">Sumber:</p>
                <div className="space-y-2">
                  {message.sources.map((source, index) => (
                    <div key={source?.chunkId || index} className="p-2 bg-surface-700/50 border border-border rounded text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-primary-400 flex-shrink-0" />
                          <span className="text-surface-300 truncate">
                            {source?.documentName || 'Dokumen'}
                          </span>
                          {source?.page && (
                            <span className="text-text-muted flex-shrink-0">— Halaman {source.page}</span>
                          )}
                        </div>
                        <button className="flex items-center gap-1 text-primary-400 hover:underline flex-shrink-0">
                          <ExternalLink className="w-3 h-3" />
                          Buka
                        </button>
                      </div>
                      {source?.snippet && (
                        <p className="mt-1 text-xs text-text-muted line-clamp-2">{source.snippet}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        
        <div className="text-xs text-text-muted/70">
          {message.timestamp.toLocaleTimeString('id-ID')}
        </div>
      </div>
    </div>
  );
}

function DiscoveryResults({ documents, query }: { documents: DiscoveryDocument[]; query?: string }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="border-t border-border/50 pt-3 mt-3">
        <div className="text-center py-6 text-text-muted">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium mb-1">Dokumen yang cocok belum ditemukan</p>
          <p className="text-sm">Coba gunakan nama file, jenis dokumen, atau kata kunci lain.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-medium text-surface-300">Hasil Pencarian Dokumen</span>
        </div>
        <span className="text-xs text-text-muted bg-surface-700/50 px-2 py-0.5 rounded">
          {documents.length} dokumen ditemukan
        </span>
      </div>
      <div className="space-y-2">
        {documents.map((doc, index) => (
          <div key={`${doc.id}-${index}`} className="group p-3 bg-surface-700/50 border border-border rounded-lg hover:border-primary-500/30 hover:bg-surface-600/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-500/15 rounded-lg flex-shrink-0">
                <FileText className="w-5 h-5 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-surface-100 truncate">{doc.name}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <File className="w-3 h-3" />
                    {doc.extension || '-'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span>{formatFileSize(doc.size)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    {doc.path ? doc.path.split('/').slice(-2).join('/') : '-'}
                  </span>
                  <span className={cn('px-1.5 py-0.5 rounded text-xs', 
                    doc.status === 'indexed' ? 'bg-green-500/20 text-green-400' :
                    doc.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                    doc.status === 'error' ? 'bg-red-500/20 text-red-400' :
                    'bg-surface-600 text-text-muted'
                  )}>
                    {doc.status === 'indexed' && '✓ Terindeks'}
                    {doc.status === 'processing' && '⏳ Diproses'}
                    {doc.status === 'error' && '✗ Error'}
                    {doc.status === 'pending' && '⏳ Menunggu'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted/70 truncate">{doc.path}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-end">
              <button 
                className="flex items-center gap-1 text-primary-400 hover:underline text-sm px-3 py-1.5 rounded border border-primary-500/30 hover:bg-primary-500/10 transition-colors"
                disabled={!doc.id}
              >
                <ChevronRight className="w-3 h-3" />
                Pratinjau
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}