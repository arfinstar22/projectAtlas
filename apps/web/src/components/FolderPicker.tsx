import React, { useState, useRef } from 'react';
import {
  FolderOpen,
  FolderPlus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { cn, cardVariants, buttonVariants } from '../design-system';

// Non-standard attribute for the browser directory chooser (last-resort fallback).
declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string | boolean;
    directory?: string | boolean;
  }
}

const SUPPORTED_EXTENSIONS = [
  'pdf', 'docx', 'txt', 'md', 'markdown', 'csv',
  'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'webp',
];

interface FolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (folder: { id: string; name: string; path: string }) => void;
}

type Mode = 'browse' | 'manual' | 'browser';

export function FolderPicker({ isOpen, onClose, onSuccess }: FolderPickerProps) {
  const [mode, setMode] = useState<Mode>('browse');
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [nativeUnavailable, setNativeUnavailable] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const resetSelection = () => {
    setPickedPath(null);
    setPickedName(null);
    setSelectedFiles(null);
    setSelectedName(null);
    setError('');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    if (next !== 'browser') {
      setSelectedFiles(null);
      setSelectedName(null);
    }
    if (next !== 'browse') {
      setPickedPath(null);
      setPickedName(null);
    }
  };

  const handleBrowseNative = async () => {
    setError('');
    setIsLoading(true);
    try {
      const res = await api.browseFolder();
      if (res.success) {
        setPickedPath(res.path);
        setPickedName(res.name);
        setPath(res.path);
      } else if (res.cancelled) {
        // User closed the dialog -> stay quiet.
      } else if (res.unsupported) {
        setNativeUnavailable(true);
        setError('Pemilih folder sistem tidak tersedia di komputer ini. Gunakan path manual atau pemilih folder browser.');
      } else {
        setError(res.error || 'Gagal membuka pemilih folder');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Gagal membuka pemilih folder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    if (pickedPath) {
      setIsLoading(true);
      try {
        const result = await api.addFolder(pickedPath);
        toast.success(`Folder "${result.folder.name}" berhasil ditambahkan!`);
        resetSelection();
        onSuccess(result.folder);
        onClose();
      } catch (err: any) {
        const message = err.response?.data?.error?.message || err.message;
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (selectedFiles && selectedName) {
      setIsLoading(true);
      try {
        const form = new FormData();
        form.append('folderName', selectedName);
        selectedFiles.forEach((f) => form.append('files', f, f.webkitRelativePath || f.name));
        const result = await api.addFolderUpload(form);
        toast.success(`Folder "${result.folder.name}" berhasil ditambahkan!`);
        resetSelection();
        onSuccess(result.folder);
        onClose();
      } catch (err: any) {
        const message = err.response?.data?.error?.message || err.message;
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
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
      resetSelection();
      onSuccess(result.folder);
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    if (files.length === 0) {
      setError('Tidak ada file ditemukan di folder yang dipilih.');
      return;
    }

    const usable = files.filter((f) => {
      const dot = f.name.lastIndexOf('.');
      const ext = dot === -1 ? '' : f.name.slice(dot + 1).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext) && f.size > 0;
    });

    if (usable.length === 0) {
      setError('Folder tidak berisi file yang didukung ATLAS (PDF, DOCX, TXT, MD, CSV, XLSX, JPG, PNG).');
      setSelectedFiles(null);
      setSelectedName(null);
      return;
    }

    const root = (usable[0].webkitRelativePath || '').split('/')[0] || usable[0].name;
    setSelectedFiles(usable);
    setSelectedName(root);
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const canConfirm = Boolean(pickedPath) || Boolean(selectedFiles && selectedName);

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
        {/* Hidden browser directory chooser (last-resort fallback) */}
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderSelected}
        />

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
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'browse' && (
            <div className="space-y-4">
              <div className="p-4 bg-surface-800/50 border border-border rounded-lg">
                <p className="text-sm text-text-muted">
                  Klik tombol di bawah untuk membuka pemilih folder dari komputer Anda.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBrowseNative}
                disabled={isLoading}
                className={cn(buttonVariants.primary, 'w-full py-3')}
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" />Membuka Pemilih Folder...</>
                ) : (
                  <><FolderOpen className="w-5 h-5 mr-2" />Browse Folder</>
                )}
              </button>

              {pickedPath && pickedName && (
                <div className="p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-5 text-primary-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-text-muted uppercase tracking-wide">Folder dipilih</p>
                      <p className="text-surface-100 font-medium truncate">
                        <FolderOpen className="w-4 h-4 inline mr-1 -mt-0.5 text-primary-400" />
                        {pickedName}
                      </p>
                      <p className="text-sm text-text-muted truncate font-mono">{pickedPath}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(buttonVariants.secondary, 'flex-1')}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoading || !canConfirm}
                  className={cn(buttonVariants.neon, 'flex-1 py-3')}
                >
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" />Menambahkan Folder...</>
                  ) : (
                    <><FolderPlus className="w-5 h-5 mr-2" />Tambah Folder</>
                  )}
                </button>
              </div>

              <div className="space-y-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { switchMode('manual'); if (pickedPath) setPath(pickedPath); }}
                  className="block w-full text-sm text-text-muted hover:text-surface-200 transition-colors"
                >
                  Atau masukkan path folder secara manual
                </button>
                {nativeUnavailable && (
                  <button
                    type="button"
                    onClick={() => switchMode('browser')}
                    className="block w-full text-sm text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Gunakan pemilih folder browser sebagai alternatif
                  </button>
                )}
              </div>
            </div>
          )}

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

              <button
                type="button"
                onClick={() => switchMode('browse')}
                className="w-full text-sm text-text-muted hover:text-surface-200 transition-colors"
              >
                &larr; Kembali ke pemilihan folder
              </button>

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
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" />Menambahkan Folder...</>
                  ) : (
                    <><FolderPlus className="w-5 h-5 mr-2" />Tambah Folder</>
                  )}
                </button>
              </div>
            </form>
          )}

          {mode === 'browser' && (
            <div className="space-y-4">
              <div className="p-4 bg-surface-800/50 border border-border rounded-lg">
                <p className="text-sm text-text-muted">
                  Pemilih folder dari browser digunakan sebagai cadangan. Pilih folder, lalu konfirmasi dengan Tambah Folder.
                </p>
              </div>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={isLoading}
                className={cn(buttonVariants.primary, 'w-full py-3')}
              >
                <FolderOpen className="w-5 h-5 mr-2" />
                Pilih Folder via Browser
              </button>

              {selectedName && selectedFiles && (
                <div className="p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-5 text-primary-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-text-muted uppercase tracking-wide">Folder dipilih</p>
                      <p className="text-surface-100 font-medium truncate">{selectedName}</p>
                      <p className="text-sm text-text-muted">{selectedFiles.length} file ditemukan</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => switchMode('browse')}
                className="block w-full text-sm text-text-muted hover:text-surface-200 transition-colors"
              >
                &larr; Kembali
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(buttonVariants.secondary, 'flex-1')}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoading || !canConfirm}
                  className={cn(buttonVariants.neon, 'flex-1 py-3')}
                >
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" />Menambahkan Folder...</>
                  ) : (
                    <><FolderPlus className="w-5 h-5 mr-2" />Tambah Folder</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FolderPicker;