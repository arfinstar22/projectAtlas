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
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    ai: {
      provider: 'openrouter',
      apiKey: '',
      model: 'openai/gpt-4o-mini',
      embeddingModel: 'openai/text-embedding-ada-002'
    },
    indexing: {
      chunkSize: 1000,
      chunkOverlap: 200,
      enableOCR: false,
      maxFileSize: 50
    },
    general: {
      language: 'id',
      darkMode: false,
      autoIndex: true
    }
  });
  const [aiStatus, setAiStatus] = useState<{ provider: string; configured: boolean; available: boolean } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

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
      // Update local settings with actual values from server
      setSettings(prev => ({
        ...prev,
        ai: {
          ...prev.ai,
          provider: status.provider.toLowerCase(),
          apiKey: status.configured ? '••••••••••••••••' : '',
          model: 'openai/gpt-4o-mini',
          embeddingModel: 'openai/text-embedding-ada-002'
        }
      }));
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const handleSave = async () => {
    // For now, just show success - actual persistence would need server endpoint
    toast.success('Pengaturan disimpan (simulasi - persistensi server belum diimplementasikan)');
  };

  const testConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await api.testAIConnection();
      if (result.success) {
        toast.success('Koneksi AI berhasil!');
        await loadAIStatus();
      } else {
        toast.error(`Gagal: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      toast.error(`Gagal: ${error.response?.data?.error?.message || error.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6 py-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Pengaturan Umum
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Bahasa Interface
                  </label>
                  <select
                    value={settings.general.language}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      general: { ...prev.general, language: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Mode Gelap
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
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Auto-index file baru
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Konfigurasi AI Provider
              </h3>

              {/* AI Status Card */}
              <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${
                aiStatus?.configured ? 'border-green-200 dark:border-green-800' : 'border-yellow-200 dark:border-yellow-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    aiStatus?.configured ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
                  }`}>
                    <CheckCircle2 className={`w-5 h-5 ${aiStatus?.configured ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {aiStatus?.configured ? 'AI Provider Terkonfigurasi' : 'AI Provider Belum Dikonfigurasi'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {aiStatus?.configured 
                        ? `Provider: ${aiStatus.provider} • Model: ${settings.ai.model} • Siap digunakan`
                        : 'Masukkan API key OpenRouter untuk mengaktifkan fitur Tanya ATLAS'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">Privasi & Keamanan</p>
                    <p>
                      Hanya konteks relevan yang dikirim ke AI provider, bukan seluruh file. 
                      API key disimpan lokal dan tidak dibagikan.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Provider
                  </label>
                  <select
                    value={settings.ai.provider}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      ai: { ...prev.ai, provider: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="local" disabled>Local AI (Coming Soon)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.ai.apiKey}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      ai: { ...prev.ai, apiKey: e.target.value }
                    }))}
                    placeholder="Masukkan API key dari provider"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Dapatkan API key dari{' '}
                    <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">
                      openrouter.ai
                    </a>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Model Chat
                    </label>
                    <select
                      value={settings.ai.model}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        ai: { ...prev.ai, model: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      <option value="openai/gpt-4">GPT-4</option>
                      <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Model Embedding
                    </label>
                    <select
                      value={settings.ai.embeddingModel}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        ai: { ...prev.ai, embeddingModel: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="openai/text-embedding-ada-002">OpenAI Ada-002</option>
                      <option value="openai/text-embedding-3-small">OpenAI Embedding v3 Small</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={testConnection}
                  disabled={testingConnection}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menguji...
                    </>
                  ) : (
                    <>
                      <TestTube className="w-4 h-4" />
                      Test Koneksi
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'indexing' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Pengaturan Indexing
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ukuran Chunk
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.chunkSize}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, chunkSize: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Karakter per chunk</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Overlap Chunk
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.chunkOverlap}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, chunkOverlap: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Karakter overlap antar chunk</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ukuran File Maksimum (MB)
                  </label>
                  <input
                    type="number"
                    value={settings.indexing.maxFileSize}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      indexing: { ...prev.indexing, maxFileSize: parseInt(e.target.value) }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Aktifkan OCR untuk gambar
                    </span>
                  </label>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 ml-6">
                    Ekstrak teks dari gambar dan PDF yang di-scan
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Keamanan & Privasi
              </h3>
              
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-800 dark:text-green-200">
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
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Folder Terhubung
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    ATLAS hanya dapat mengakses folder yang Anda izinkan
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
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
          <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
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