import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  MessageSquare, 
  Send, 
  FileText, 
  ExternalLink,
  Loader2,
  Brain,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

export function ChatPage() {
  const [messages, setMessages] = useState<Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    sources?: any[];
    timestamp: Date;
  }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { data: searchStats } = useQuery('search-stats', api.getSearchStats);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.chat(input.trim());

      const aiResponse = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: response.response,
        sources: response.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error: any) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
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

function MessageBubble({ message }: { message: any }) {
  return (
    <div className={cn('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-3xl rounded-lg p-4 space-y-3',
        message.type === 'user' 
          ? 'bg-primary-600 text-surface-950' 
          : 'bg-surface-800 text-surface-100 border border-border'
      )}>
        <p className="leading-relaxed">{message.content}</p>
        
        {message.sources && message.sources.length > 0 && (
          <div className="border-t border-border/50 pt-3 mt-3">
            <p className="text-sm font-medium mb-2 text-text-muted">Sumber:</p>
            <div className="space-y-2">
              {message.sources.map((source: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-surface-700/50 border border-border rounded text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary-400" />
                    <span className="text-surface-300">{source.document.name}</span>
                    {source.metadata.page && (
                      <span className="text-text-muted">— Halaman {source.metadata.page}</span>
                    )}
                  </div>
                  <button className="flex items-center gap-1 text-primary-400 hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    Buka
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-text-muted/70">
          {message.timestamp.toLocaleTimeString('id-ID')}
        </div>
      </div>
    </div>
  );
}