# ATLAS

**Hybrid Local Document Intelligence** — Lapisan kecerdasan untuk dokumen lokal Anda.

ATLAS memungkinkan Anda menanyakan isi dokumen dalam bahasa natural, mencari konten dengan cepat, dan mendapatkan jawaban yang didasarkan pada bukti (citation) — semua tanpa mengirim file ke cloud.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔍 **Pencarian Cerdas** | Keyword, semantic, dan hybrid search dengan ranking berbasis relevansi |
| 💬 **Tanya ATLAS (Chat AI)** | AI menjawab pertanyaan berdasarkan dokumen Anda dengan citation lengkap |
| 📁 **Manajemen Dokumen** | Tambah folder, auto-scan, indexing background, dukungan multi-format |
| 🔐 **Privasi Local-First** | File tidak pernah keluar dari komputer, hanya konteks relevan yang dikirim ke AI |
| ⚙️ **Konfigurasi Fleksibel** | OpenRouter, model kustom, chunk size, OCR, dan lebih banyak lagi |

---

## 🚀 Quick Start

### Persyaratan

- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm 9+** (sudah termasuk Node.js)

### Instalasi (3 Langkah)

```bash
# 1. Clone repository
git clone https://github.com/arfinstar22/projectAtlas.git
cd projectAtlas

# 2. Install semua dependensi
npm install

# 3. Buat konfigurasi lingkungan
cp .env.example .env
```

### Menjalankan ATLAS

```bash
npm run dev
```

Ini akan menjalankan dua server secara bersamaan:

| Server | Port | URL |
|--------|------|-----|
| Backend API | `3001` | http://localhost:3001/api/health |
| Frontend Web | `5173` | http://localhost:5173 |

Buka **http://localhost:5173** untuk menggunakan ATLAS.

---

## ⚙️ Konfigurasi

Edit file `.env` sesuai kebutuhan:

```env
# ─── AI Configuration ─────────────────────────────────────────────
# Wajib untuk fitur Tanya ATLAS (Chat)
# Daftar di https://openrouter.ai/keys untuk mendapatkan key gratis
OPENROUTER_API_KEY=

# Model AI yang digunakan (default: openai/gpt-4o-mini)
AI_MODEL=openai/gpt-4o-mini

# ─── Server Configuration ────────────────────────────────────────
# Port server backend (default: 3001)
PORT=3001

# Path database SQLite (default: ./data/atlas.db)
DATABASE_PATH=./data/atlas.db

# ─── Indexing Configuration ──────────────────────────────────────
# Ukuran chunk dalam karakter (default: 1000)
CHUNK_SIZE=1000

# Overlap antar chunk (default: 200)
CHUNK_OVERLAP=200

# Ukuran file maksimum dalam bytes (default: 50MB)
MAX_FILE_SIZE=52428800

# Aktifkan OCR untuk gambar/PDF scan (default: false)
ENABLE_OCR=false

# Jumlah pemrosesan bersamaan (default: 3)
MAX_CONCURRENT_PROCESSING=3

# ─── AI Provider Configuration ──────────────────────────────────
AI_PROVIDER=openrouter
EMBEDDING_MODEL=openai/text-embedding-ada-002

# ─── CORS / Security ────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
NODE_ENV=development
```

> **Catatan:** Tanpa `OPENROUTER_API_KEY`, fitur pencarian dokumen dan folder tetap berfungsi penuh. Hanya fitur **Tanya ATLAS** (chat AI) yang membutuhkan konfigurasi ini.

---

## 📚 Cara Menggunakan

### 1. Tambah Folder Dokumen
- Buka halaman **Dokumen** atau **Beranda**
- Klik **Tambah Folder** dan pilih folder yang berisi file PDF, DOCX, TXT, Markdown, CSV, XLSX, atau gambar
- ATLAS akan memindai folder secara rekursif

### 2. Tunggu Indexing
- Proses indexing berjalan di latar belakang
- Pantau progres di halaman **Dokumen** (status: `Menunggu` → `Diproses` → `Terindeks` / `Error`)
- Dokumen yang sudah terindeks siap dicari dan ditanyakan

### 3. Cari Konten (Halaman Pencarian)
- Gunakan **Kata Kunci** untuk pencarian exact/partial match
- Gunakan **Semantik** untuk pencarian berbasis makna (coming soon)
- Gunakan **Hybrid** untuk kombinasi keduanya
- Filter berdasarkan ekstensi file atau folder

### 4. Tanya ATLAS (Halaman Chat)
Contoh pertanyaan:
- `"Berapa total anggaran kegiatan tahun 2025?"`
- `"Apa kesimpulan dari skripsi ini?"`
- `"Bandingkan laporan 2024 dan 2025"`
- `"Jelaskan metodologi penelitian yang digunakan"`
- `"Siapa yang bertanggung jawab untuk modul pembayaran?"`
- `"Kapan deadline proyek ini?"`

Setiap jawaban dilengkapi **citation** (sumber dokumen, halaman, snippet) yang dapat diklik untuk membuka dokumen asli.

---

## 🔒 Privasi & Keamanan

| Prinsip | Implementasi |
|---------|--------------|
| **Local-First** | File asli tidak pernah dikirim ke server cloud manapun |
| **Minimal Data Sharing** | Hanya potongan teks (chunk) relevan yang dikirim ke AI provider |
| **API Key Security** | Disimpan lokal di `.env`, tidak pernah di-commit ke repository |
| **Folder Access Control** | ATLAS hanya mengakses folder yang Anda izinkan eksplisit |
| **Path Traversal Protection** | Validasi path mencegah akses ke folder di luar yang diizinkan |
| **No Telemetry** | Tidak ada tracking, analytics, atau pengumpulan data pengguna |

---

## 🏗️ Struktur Project

```
projectAtlas/
├── apps/
│   ├── web/              # Frontend React 18 + Vite + Tailwind CSS
│   │   ├── src/
│   │   │   ├── components/    # Layout, UI components
│   │   │   ├── pages/         # Home, Documents, Search, Chat, Settings
│   │   │   ├── services/      # API client
│   │   │   └── design-system/ # Design tokens & utilities
│   │   └── public/icons/      # Logo, favicon
│   └── server/           # Backend Node.js + Fastify + SQLite
│       ├── src/
│       │   ├── routes/        # API endpoints
│       │   ├── services/      # Search, AI, Indexing, Folder
│       │   └── database.ts    # SQLite + FTS5
├── packages/
│   ├── core/             # Type definitions, utilities, logger
│   ├── document/         # Document processing (PDF, DOCX, TXT, CSV, XLSX, Images)
│   └── ai/               # AI provider abstraction (OpenRouter + Mock)
├── simple-atlas/         # Versi standalone (JS murni) — port 3001
└── scripts/              # Test scripts (RAG, citation grounding, dll)
```

### Teknologi

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Query, React Router |
| Backend | Fastify, SQLite (better-sqlite3), FTS5 Full-Text Search |
| AI | OpenRouter (GPT-4o, Claude, dll), Mock provider untuk development |
| Document Processing | pdf-parse, mammoth, csv-parse, xlsx, marked |
| File Watching | chokidar (auto-scan on file changes) |

---

## 🧪 Testing

```bash
# Test citation/source grounding
node scripts/test-citation-grounding.mjs

# Test comprehensive RAG pipeline
node scripts/test-comprehensive-rag.mjs

# Test professor-level intelligence
node scripts/test-professor-level-intelligence.mjs
```

> **Penting:** Pastikan server ATLAS berjalan terlebih dahulu (`npm run dev`) sebelum menjalankan test.

---

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Development (server + web bersamaan)
npm run dev

# Development server only
npm run dev:server

# Development web only
npm run dev:web

# TypeScript type checking
npm run typecheck

# Linting
npm run lint

# Production build
npm run build

# Start production server
npm run start
```

---

## 🐛 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `EADDRINUSE` (port bentrok) | Ubah `PORT=3001` di `.env`, lalu update `apps/web/vite.config.ts` proxy target ke port yang sama |
| `ECONNREFUSED` ke server | Pastikan `npm run dev` berjalan, cek port di `.env` sama dengan `vite.config.ts` |
| API key error / AI tidak merespons | Pastikan `OPENROUTER_API_KEY` valid di `.env`, cek koneksi internet |
| Search tidak menemukan file | Pastikan folder sudah ditambahkan, indexing selesai (status `Terindeks`), ekstensi didukung |
| Build gagal | Pastikan Node.js 18+, jalankan `rm -rf node_modules package-lock.json && npm install` |
| `SQLITE_MISUSE` saat shutdown | Known issue pada shutdown cepat, tidak mempengaruhi fungsionalitas |

---

## 📄 Format File yang Didukung

| Format | Ekstensi | Catatan |
|--------|----------|---------|
| PDF | `.pdf` | Ekstraksi teks + metadata (halaman, author, dll) |
| Word | `.docx` | Ekstraksi teks mentah |
| Text | `.txt` | Deteksi bahasa otomatis (ID/EN) |
| Markdown | `.md`, `.markdown` | Parsing ke HTML lalu ekstraksi teks |
| CSV | `.csv` | Konversi ke format teks tabular |
| Excel | `.xlsx`, `.xls` | Semua sheet dikonversi ke CSV |
| Images | `.jpg`, `.jpeg`, `.png`, `.webp` | OCR (opsional, butuh `ENABLE_OCR=true`) |

---

## 🤝 Contributing

1. Fork repository
2. Buat branch fitur: `git checkout -b feat/nama-fitur`
3. Commit perubahan: `git commit -m "feat: deskripsi singkat"`
4. Push ke branch: `git push origin feat/nama-fitur`
5. Buat Pull Request

---

## 📝 Lisensi

MIT License — lihat file [LICENSE](LICENSE) untuk detail.

---

## 🙏 Acknowledgments

- **OpenRouter** — Unified API untuk berbagai model AI
- **Fastify** — Fast and low overhead web framework
- **Tailwind CSS** — Utility-first CSS framework
- **SQLite + FTS5** — Embedded database dengan full-text search
- **Lucide React** — Beautiful & consistent icons

---

> **ATLAS** — Cari jawaban, bukan file.  
> Dibangun dengan ❤️ untuk kebutuhan *document intelligence* lokal yang privat, cepat, dan andal.