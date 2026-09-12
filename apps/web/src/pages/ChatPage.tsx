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
      // For MVP, we'll simulate AI response using search results
      const searchResults = await api.search({
        query: input.trim(),
        mode: 'keyword',
        limit: 3
      });

      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      const aiResponse = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: generateMockResponse(input.trim(), searchResults.results),
        sources: searchResults.results.slice(0, 3),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: 'Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Pastikan dokumen sudah terindeks dan coba lagi.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-t-xl border border-gray-200 dark:border-gray-700 p-4 border-b-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Tanya ATLAS
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI assistant untuk dokumen Anda
            </p>
          </div>
        </div>

        {/* Status */}
        {searchStats && (
          <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              {searchStats.searchableContent ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Siap menjawab dari {searchStats.indexedDocuments} dokumen terindeks
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Belum ada dokumen terindeks. Tambahkan folder untuk mulai.
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Mulai Percakapan
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6">
              Tanyakan apa saja tentang dokumen Anda. ATLAS akan mencari dan memberikan jawaban berdasarkan konten dokumen.
            </p>
            
            <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <p><strong>Contoh pertanyaan:</strong></p>
              <div className="space-y-1">
                <p>• "Berapa total anggaran kegiatan tahun 2025?"</p>
                <p>• "Apa saja persyaratan dalam SOP kepegawaian?"</p>
                <p>• "Bandingkan laporan 2024 dan 2025"</p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>ATLAS sedang mencari jawaban...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 rounded-b-xl border border-gray-200 dark:border-gray-700 p-4 border-t-0">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan sesuatu tentang dokumen Anda..."
            disabled={isLoading || !searchStats?.searchableContent}
            className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !searchStats?.searchableContent}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
    <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl ${message.type === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'} rounded-lg p-4 space-y-3`}>
        <p className="leading-relaxed">{message.content}</p>
        
        {message.sources && message.sources.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
            <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Sumber:</p>
            <div className="space-y-2">
              {message.sources.map((source: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-600 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-gray-700 dark:text-gray-300">{source.document.name}</span>
                    {source.metadata.page && (
                      <span className="text-gray-500 dark:text-gray-400">— Halaman {source.metadata.page}</span>
                    )}
                  </div>
                  <button className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    Buka
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs opacity-70">
          {message.timestamp.toLocaleTimeString('id-ID')}
        </div>
      </div>
    </div>
  );
}

function generateMockResponse(query: string, results: any[]): string {
  if (results.length === 0) {
    return 'Maaf, saya tidak menemukan informasi yang relevan dengan pertanyaan Anda dalam dokumen yang tersedia. Pastikan dokumen yang berisi informasi tersebut sudah terindeks.';
  }

  // Simple mock response generation
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('anggaran') || queryLower.includes('biaya') || queryLower.includes('total')) {
    return 'Berdasarkan dokumen yang saya analisis, informasi anggaran dapat ditemukan di beberapa dokumen. Namun untuk memberikan jawaban yang akurat, saya memerlukan integrasi AI yang lebih lengkap. Silakan periksa dokumen sumber di bawah untuk detail lengkapnya.';
  }
  
  if (queryLower.includes('bandingkan') || queryLower.includes('perbedaan')) {
    return 'Saya menemukan dokumen yang mungkin berkaitan dengan permintaan perbandingan Anda. Untuk analisis perbandingan yang detail, fitur AI akan segera tersedia. Silakan lihat dokumen sumber untuk informasi lebih lanjut.';
  }
  
  return `Saya menemukan ${results.length} dokumen yang relevan dengan pertanyaan Anda. Berdasarkan konten yang tersedia, informasi yang Anda cari kemungkinan ada dalam dokumen-dokumen tersebut. Silakan periksa sumber di bawah untuk detail lengkapnya.`;
}