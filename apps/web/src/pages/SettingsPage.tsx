import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Folder, 
  Brain, 
  Database, 
  Shield,
  Save,
  TestTube,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, badgeVariants, buttonVariants } from '../design-system';

interface ModelOption {
  id: string;
  name: string;
  free: boolean;
  contextLength?: number | null;
  promptPrice?: number | null;
  completionPrice?: number | null;
}

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'ok'; message: string; chatCount: number; embeddingCount: number }
  | { phase: 'error'; message: string; suggestion?: string };

const KEY_MASK = '••••••••••••••••';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    ai: {
      provider: 'openrouter',
      apiKey: '',
      model: '',
      embeddingModel: ''
    },
    indexing: {
      chunkSize: 1000,
      chunkOverlap: 200,
      enableOCR: false,
      maxFileSize: 50
    },
    general: {
      language: 'id',
      darkMode: true,
      autoIndex: true
    }
  });
  const [aiStatus, setAiStatus] = useState<{ provider: string; providerId?: string; configured: boolean; hasApiKey: boolean; model?: string; embeddingModel?: string } | null>(null);
  const [models, setModels] = useState<{ chat: ModelOption[]; embedding: ModelOption[] } | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [testState, setTestState] = useState<TestState>({ phase: 'idle' });
  const [showApiKey, setShowApiKey] = useState(false);

  const tabs = [
    { id: 'general', name: 'Umum', icon: SettingsIcon },
    { id: 'ai', name: 'AI Provider', icon: Brain },
    { id: 'indexing', name: 'Indexing', icon: Database },
    { id: 'security', name: 'Keamanan', icon: Shield },
  ];

  useEffect(() => {
    loadAIStatus();
  }, []);

  const loadAIStatus = async () => {
    try {
      const status = await api.getAIStatus();
      setAiStatus(status);
      setSettings(prev => ({
        ...prev,
        ai: {
          ...prev.ai,
          // providerId is the canonical id ('google' | 'openrouter' | 'mock');
          // fall back to the display-name mapping for older servers.
          provider: status.providerId || (status.provider.toLowerCase() === 'mock ai' ? 'openrouter' : status.provider.toLowerCase()),
          apiKey: status.hasApiKey ? KEY_MASK : '',
          model: status.model || '',
          embeddingModel: status.embeddingModel || ''
        }
      }));
      if (status.hasApiKey) {
        await loadModels();
      }
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const result = await api.getAIModels();
      if (result.success) {
        setModels({ chat: result.chat, embedding: result.embedding });
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message;
      toast.error(`Gagal memuat model: ${message}`);
    } finally {
      setModelsLoading(false);
    }
  };

  // Switching provider persists immediately (with that provider's default
  // models) so chat/embedding never run with a mismatched provider/model pair.
  const handleProviderChange = async (provider: string) => {
    const defaults: Record<string, { model: string; embeddingModel: string }> = {
      google: { model: 'gemini-3.6-flash', embeddingModel: 'gemini-embedding-001' },
      openrouter: { model: 'openrouter/free', embeddingModel: 'openai/text-embedding-3-small' }
    };
    const d = defaults[provider] || defaults.openrouter;
    setSettings(prev => ({ ...prev, ai: { ...prev.ai, provider, model: d.model, embeddingModel: d.embeddingModel } }));
    setModels(null);
    try {
      const result = await api.configureAI({ provider, ...d });
      setAiStatus(prevStatus => prevStatus ? { ...prevStatus, providerId: provider, model: d.model, embeddingModel: d.embeddingModel } : prevStatus);
      toast.success(`Provider diganti ke ${provider === 'google' ? 'Google AI (Gemini)' : 'OpenRouter'}. Masukkan API key-nya lalu simpan.`);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Gagal mengganti provider.');
    }
  };

  const handleSave = async () => {
    if (!apiKeyDirty && !aiStatus?.hasApiKey) {
      toast.error('Masukkan API key terlebih dahulu untuk menyimpan konfigurasi AI.');
      return;
    }

    try {
      const payload: { provider?: string; apiKey?: string; model?: string; embeddingModel?: string } = {
        provider: settings.ai.provider,
        model: settings.ai.model || undefined,
        embeddingModel: settings.ai.embeddingModel || undefined
      };
      if (apiKeyDirty) {
        payload.apiKey = settings.ai.apiKey.trim();
        if (!payload.apiKey) {
          toast.error('Masukkan API key terlebih dahulu.');
          return;
        }
      }

      const result = await api.configureAI(payload);
      toast.success('Pengaturan AI disimpan!');
      setApiKeyDirty(false);
      setSettings(prev => ({
        ...prev,
        ai: { ...prev.ai, apiKey: result.hasApiKey ? KEY_MASK : '' }
      }));
      setModels(null);
      await loadAIStatus();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Gagal menyimpan pengaturan AI.');
    }
  };

  const testConnection = async () => {
    const hasKey = apiKeyDirty ? Boolean(settings.ai.apiKey.trim()) : Boolean(aiStatus?.hasApiKey);
    if (!hasKey) {
      toast.error('Masukkan API key terlebih dahulu.');
      return;
    }

    setTestState({ phase: 'testing' });
    try {
      const result = await api.testAIConnection(apiKeyDirty ? settings.ai.apiKey.trim() : undefined);
      if (result.success) {
        setModels(result.models || null);
        setTestState({
          phase: 'ok',
          message: `Terhubung • ${result.chatModelCount} model chat dan ${result.embeddingModelCount} model embedding tersedia`,
          chatCount: result.chatModelCount || 0,
          embeddingCount: result.embeddingModelCount || 0
        });
        if (apiKeyDirty) {
          setApiKeyDirty(false);
          setSettings(prev => ({ ...prev, ai: { ...prev.ai, apiKey: KEY_MASK } }));
        }
      } else {
        setTestState({
          phase: 'error',
          message: result.message || 'Gagal terhubung.',
          suggestion: result.code === 'INSUFFICIENT_CREDITS' ? 'Tersedia pilihan model FREE kecuali di Settings.' : undefined
        });
      }
    } catch (error: any) {
      setTestState({
        phase: 'error',
        message: error.response?.data?.message || error.message || 'Gagal terhubung.'
      });
    }
  };

  const modelLabel = (m: ModelOption) => {
    const parts = [m.free ? 'FREE' : null, m.promptPrice !== null && m.promptPrice !== undefined
      ? `$${Number(m.promptPrice).toFixed(4)}/tok`
      : null];
    return `${m.free ? '★ ' : ''}${m.name}${parts.filter(Boolean).length ? ` — ${parts.filter(Boolean).join(' • ')}` : ''}`;
  };

  const noKeyPlaceholder = <option value="" disabled>Masukkan API key terlebih dahulu</option>;
  const loadingPlaceholder = <option value="" disabled>Memuat model dari OpenRouter...</option>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className={cn(cardVariants.default, 'overflow-hidden')}>
        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex space-x-8 px-6 py-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 py-2 px-3 text-sm font-medium rounded-lg transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-500/15 text-primary-400 border-b-2 border-primary-500'
                    : 'text-text-muted hover:text-surface-100 hover:bg-surface-800/50'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-surface-100">
                Pengaturan Umum
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Bahasa Interface
                  </label>
                  <select
                    value={settings.general.language}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      general: { ...prev.general, language: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.general.darkMode}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, darkMode: e.target.checked }
                      }))}
                      className="rounded border-border bg-surface-800 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-surface-300">
                      Mode Gelap (selalu aktif di ATLAS)
                    </span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.general.autoIndex}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, autoIndex: e.target.checked }
                      }))}
                      className="rounded border-border bg-surface-800 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-surface-300">
                      Auto-index file baru
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-surface-100">
                Konfigurasi AI Provider
              </h3>

              {/* AI Status Card */}
              <div className={cn(
                cardVariants.default, 'p-4',
                aiStatus?.configured ? 'border-green-500/30' : 'border-yellow-500/30'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    aiStatus?.configured ? 'bg-green-500/15' : 'bg-yellow-500/15'
                  )}>
                    <CheckCircle2 className={cn(
                      'w-5 h-5',
                      aiStatus?.configured ? 'text-green-400' : 'text-yellow-400'
                    )} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-surface-100">
                      {aiStatus?.configured ? 'AI Provider Terkonfigurasi' : 'AI Provider Belum Dikonfigurasi'}
                    </p>
                    <p className="text-sm text-text-muted mt-1">
                      {aiStatus?.configured && settings.ai.model
                        ? `Provider: ${aiStatus.provider} • Model: ${settings.ai.model}${models ? ` • ${models.chat.length} model tersedia` : ''}`
                        : settings.ai.apiKey
                          ? 'Model chat tersedia setelah koneksi berhasil diverifikasi.'
                          : 'Masukkan API key OpenRouter untuk memuat model yang tersedia.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-primary-500/10 border border-primary-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-primary-300">
                    <p className="font-medium mb-1">Privasi & Keamanan</p>
                    <p>
                      Hanya konteks relevan yang dikirim ke AI provider, bukan seluruh file.
                      API key hanya dikirim dari browser ke backend lokal ATLAS — tidak pernah dibocorkan ke frontend.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Provider
                  </label>
                  <select
                    value={settings.ai.provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  >
                    <option value="google">Google AI (Gemini)</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="local" disabled>Local AI (Coming Soon)</option>
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    {settings.ai.provider === 'google'
                      ? 'Dapatkan API key gratis di aistudio.google.com/apikey — mendukung chat dan embedding.'
                      : 'Dapatkan API key dari openrouter.ai/keys.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.ai.apiKey}
                      onChange={(e) => {
                        if (e.target.value !== KEY_MASK) setApiKeyDirty(true);
                        setSettings(prev => ({
                          ...prev,
                          ai: { ...prev.ai, apiKey: e.target.value }
                        }));
                        setTestState({ phase: 'idle' });
                      }}
                      placeholder="Masukkan API key dari OpenRouter"
                      className="w-full pr-10 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-surface-300"
                    >
                      {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    Dapatkan API key dari{' '}
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">
                      openrouter.ai/keys
                    </a>
                  </p>
                </div>

                {/* Test Connection */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={testConnection}
                    disabled={testState.phase === 'testing' || (!apiKeyDirty && !aiStatus?.hasApiKey)}
                    className="flex items-center gap-2 px-4 py-2 border border-border text-text-muted rounded-lg hover:bg-surface-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testState.phase === 'testing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memuat model dari OpenRouter...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4" />
                        Test Koneksi
                      </>
                    )}
                  </button>
                </div>

                {/* Test Result */}
                {(testState.phase === 'ok' || testState.phase === 'error') && (
                  <div className={cn(
                    'p-3 rounded-lg flex items-start gap-2 text-sm',
                    testState.phase === 'ok'
                      ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  )}>
                    {testState.phase === 'ok'
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    <div>
                      <p>{testState.message}</p>
                      {testState.phase === 'ok' && (
                        <p className="text-green-400/80 mt-1">
                          Terhubung — {testState.chatCount} model chat dan {testState.embeddingCount} model embedding tersedia.
                        </p>
                      )}
                      {testState.phase === 'error' && testState.suggestion && (
                        <p className="text-red-400/80 mt-1">{testState.suggestion}</p>
                      )}
                      {testState.phase === 'error' && (
                        <p className="text-red-400/80 mt-1">Tersedia pilihan model FREE di daftar setelah masalah teratasi.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-text-muted">
                        Model Chat
                      </label>
                      <button
                        type="button"
                        onClick={loadModels}
                        disabled={modelsLoading || !aiStatus?.hasApiKey}
                        className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Muat ulang model dari OpenRouter"
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', modelsLoading && 'animate-spin')} />
                        Muat Ulang
                      </button>
                    </div>

                    {!aiStatus?.hasApiKey ? (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        {noKeyPlaceholder}
                      </select>
                    ) : modelsLoading && !models ? (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        {loadingPlaceholder}
                      </select>
                    ) : models && models.chat.length > 0 ? (
                      <>
                        <select
                          value={settings.ai.model || models.chat[0]?.id}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            ai: { ...prev.ai, model: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                        >
                          {models.chat.map((m) => (
                            <option key={m.id} value={m.id}>{modelLabel(m)}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {models.chat.slice(0, 3).map((m) => (
                            <span key={m.id} className={cn(badgeVariants[m.free ? 'neon' : 'default'])}>
                              {m.free && <Sparkles className="w-3 h-3 mr-1" />}
                              {m.name.length > 24 ? m.name.slice(0, 24) + '…' : m.name}
                              {m.free ? ' • FREE' : ` • ${m.promptPrice !== null ? '$' + (m.promptPrice ?? 0).toFixed(6) : '?'}/tok`}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        <option value="" disabled>Terhubung dulu untuk memuat model</option>
                      </select>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      {models ? `${models.chat.length} model chat tersedia` : 'Masukkan API key untuk memuat model yang tersedia.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Model Embedding
                    </label>
                    {!aiStatus?.hasApiKey ? (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        {noKeyPlaceholder}
                      </select>
                    ) : modelsLoading && !models ? (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        {loadingPlaceholder}
                      </select>
                    ) : models && models.embedding.length > 0 ? (
                      <select
                        value={settings.ai.embeddingModel || models.embedding[0]?.id}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          ai: { ...prev.ai, embeddingModel: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                      >
                        {models.embedding.map((m) => (
                          <option key={m.id} value={m.id}>{modelLabel(m)}</option>
                        ))}
                      </select>
                    ) : (
                      <select disabled className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-text-muted opacity-60 cursor-not-allowed">
                        <option value="" disabled>Tidak ada model embedding yang kompatibel</option>
                      </select>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      {models ? `${models.embedding.length} model embedding tersedia` : 'Masukkan API key untuk memuat model yang tersedia.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'indexing' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-surface-100">
                Pengaturan Indexing
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Ukuran Chunk
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.chunkSize}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, chunkSize: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  />
                  <p className="mt-1 text-sm text-text-muted">Karakter per chunk</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Overlap Chunk
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.chunkOverlap}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, chunkOverlap: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  />
                  <p className="mt-1 text-sm text-text-muted">Karakter overlap antar chunk</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Ukuran File Maksimum (MB)
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.maxFileSize}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, maxFileSize: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-800 text-surface-100 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.indexing.enableOCR}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        indexing: { ...prev.indexing, enableOCR: e.target.checked }
                      }))}
                      className="rounded border-border bg-surface-800 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-surface-300">
                      Aktifkan OCR untuk gambar
                    </span>
                  </label>
                  <p className="mt-1 text-sm text-text-muted ml-6">
                    Ekstrak teks dari gambar dan PDF yang di-scan
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-surface-100">
                Keamanan & Privasi
              </h3>
              
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-300">
                      <p className="font-medium mb-2">Jaminan Privasi ATLAS</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>File asli tetap di komputer Anda</li>
                        <li>Hanya konteks relevan dikirim ke AI</li>
                        <li>API key disimpan lokal, tidak di-upload</li>
                        <li>Akses folder dibatasi sesuai pilihan Anda</li>
                        <li>Tidak ada telemetri atau tracking</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-surface-100 mb-2">
                    Folder Terhubung
                  </h4>
                  <p className="text-sm text-text-muted mb-4">
                    ATLAS hanya dapat mengakses folder yang Anda izinkan
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Folder className="w-5 h-5 text-primary-400" />
                        <span className="text-sm text-text-muted">
                          Belum ada folder terhubung
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-6 border-t border-border">
            <button
              onClick={handleSave}
              className={cn(buttonVariants.neon)}
            >
              <Save className="w-4 h-4" />
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}