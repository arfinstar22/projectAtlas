import React, { useState, useRef } from 'react';
import { 
  FolderOpen, 
  FolderPlus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  MousePointerClick,
  Keyboard,
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, buttonVariants, inputVariants } from '../design-system';

interface FolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function FolderPicker({ isOpen, onClose, onSuccess }: FolderPickerProps) {
  const [mode, setMode] = useState<'picker' | 'manual'>('picker');
  const [path, setPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickerClick = async () => {
    if (!('showDirectoryPicker' in window)) {
      setError('Browser tidak mendukung folder picker. Gunakan mode manual.');
      setMode('manual');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'read',
      });
      
      // Get the path - we need to serialize the handle
      // For security, we can't get the actual path, but we can store the handle
      // For now, we'll use a workaround - store the handle in sessionStorage
      // and send a special marker to the backend
      
      // Since we can't get the actual path from the browser for security reasons,
      // we need to use a different approach. Let's use the manual input method
      // but pre-fill with a helpful message.
      
      setSelectedPath(directoryHandle.name);
      setPath(directoryHandle.name);
      setMode('manual');
      setError('Pilih folder di dialog yang muncul, lalu masukkan path lengkapnya di bawah.');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled
        return;
      }
      setError('Gagal membuka folder picker: ' + err.message);
      setMode('manual');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) {
      setError('Masukkan path folder yang valid');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await api.addFolder(path.trim());
      toast.success(`Folder "${result.folder.name}" berhasil ditambahkan!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
    >
      <div 
        className={cn(
          cardVariants.default, 
          'w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slide-up'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/15 rounded-lg">
              <FolderPlus className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 id="folder-picker-title" className="text-lg font-semibold text-surface-100">
                Tambah Folder Baru
              </h2>
              <p className="text-sm text-text-muted">Pilih folder yang ingin diindeks oleh ATLAS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(buttonVariants.ghost, 'p-2')}
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Mode Selector */}
          <div className="flex gap-2 bg-surface-800 rounded-lg p-1">
            <button
              onClick={() => { setMode('picker'); setError(''); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                mode === 'picker'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-text-muted hover:text-surface-100 hover:bg-surface-700'
              )}
            >
              <MousePointerClick className="w-4 h-4" />
              Folder Picker
            </button>
            <button
              onClick={() => { setMode('manual'); setError(''); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                mode === 'manual'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-text-muted hover:text-surface-100 hover:bg-surface-700'
              )}
            >
              <Keyboard className="w-4 h-4" />
              Input Manual
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Picker Mode */}
          {mode === 'picker' && (
            <div className="space-y-4">
              <div className="p-4 bg-surface-800/50 border border-border rounded-lg">
                <div className="flex items-center gap-3 text-surface-300">
                  <HardDrive className="w-6 h-5 text-primary-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-surface-100">Folder Picker (Browser API)</p>
                    <p className="text-sm text-text-muted">
                      Gunakan dialog sistem untuk memilih folder. Catatan: Browser tidak mengizinkan akses path lengkap
                      karena alasan keamanan. Anda perlu memasukkan path manual setelah memilih folder.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={handlePickerClick}
                disabled={isLoading}
                className={cn(buttonVariants.primary, 'w-full py-3')}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Membuka Folder Picker...
                  </>
                ) : (
                  <>
                    <MousePointerClick className="w-5 h-5 mr-2" />
                    Buka Folder Picker
                  </>
                )}
              </button>
              
              {selectedPath && (
                <div className="p-3 bg-primary-500/10 border border-primary-500/30 rounded-lg">
                  <p className="text-sm text-primary-400 font-medium">Folder dipilih: {selectedPath}</p>
                  <p className="text-xs text-text-muted mt-1">
                    Silakan masukkan path lengkap folder di mode manual di bawah.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {mode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Path Folder Lengkap
                </label>
                <div className="relative">
                  <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => { setPath(e.target.value); setError(''); }}
                    placeholder="/home/user/documents atau C:\\Users\\User\\Documents"
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-surface-800 text-surface-100 placeholder-text-muted focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Contoh Linux/Mac: <code className="text-primary-400">/home/user/dokumen</code> | Windows: <code className="text-primary-400">C:\\Users\\Nama\\Documents</code>
                </p>
              </div>

              <div className="p-3 bg-surface-800/50 border border-border rounded-lg">
                <div className="flex items-center gap-2 text-surface-300 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-surface-100">Tips:</p>
                    <ul className="list-disc list-inside text-xs text-text-muted mt-1 space-y-1">
                      <li>Gunakan path absolut (dimulai dari root / atau drive letter)</li>
                      <li>Pastikan folder ada dan dapat diakses</li>
                      <li>ATLAS akan memindai semua subfolder secara rekursif</li>
                      <li>Format file yang didukung: PDF, DOCX, TXT, MD, CSV, XLSX, JPG, PNG</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(buttonVariants.secondary, 'flex-1')}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !path.trim()}
                  className={cn(buttonVariants.neon, 'flex-1 py-3')}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Menambahkan Folder...
                    </>
                  ) : (
                    <>
                      <FolderPlus className="w-5 h-5 mr-2" />
                      Tambah Folder
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-border flex justify-end gap-3">
<button
              onClick={onClose}
              className={cn(buttonVariants.ghost, 'px-4 py-2')}
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
  );
}

export default FolderPicker;