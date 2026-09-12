# ATLAS — Document Intelligence untuk File Lokal Anda

**Cari jawaban, bukan file.** ATLAS adalah aplikasi desktop yang memungkinkan Anda menanyakan isi dokumen dalam bahasa natural — tanpa perlu membuka file satu per satu. File tetap aman di komputer Anda.

## 🚀 Quick Start

### Persyaratan

- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm 9+** (sudah termasuk Node.js)

### Instalasi (3 langkah)

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
| Backend API | `3000` | http://localhost:3000/api/health |
| Frontend Web | `5173` | http://localhost:5173 |

Buka **http://localhost:5173** untuk menggunakan ATLAS.

### Konfigurasi AI (opsional — untuk fitur Chat)

Buka file `.env` dan isi API key dari [OpenRouter](https://openrouter.ai/keys):

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Tanpa API key, fitur pencarian dokumen dan folder tetap berfungsi penuh. Hanya fitur **Tanya ATLAS** (chat AI) yang membutuhkan konfigurasi ini.

---

## 📚 Cara Menggunakan

1. **Tambah Folder Dokumen** — Klik "Tambah Folder" dan pilih folder yang berisi file PDF, DOCX, TXT, atau Markdown.
2. **Tunggu Indexing** — ATLAS akan memproses dokumen Anda. Proses berjalan di latar belakang.
3. **Cari File** — Gunakan halaman **Pencarian** untuk mencari file berdasarkan kata kunci.
4. **Tanya ATLAS** — Gunakan halaman **Tanya ATLAS** untuk bertanya dalam bahasa natural:
   - _"Berapa total anggaran kegiatan tahun 2025?"_
   - _"Apa kesimpulan dari skripsi ini?"_
   - _"Bandingkan laporan 2024 dan 2025"_
   - _"Jam berapa pegawai mulai bekerja?"_

## 🔒 Privasi & Keamanan

- File asli **tidak pernah dikirim ke server cloud manapun**
- Hanya potongan teks relevan yang dikirim ke AI provider untuk menjawab pertanyaan
- API key disimpan secara lokal di file `.env` dan tidak pernah di-commit ke repository
- ATLAS hanya dapat mengakses folder yang Anda izinkan secara eksplisit
- Path traversal protection mencegah akses ke folder yang tidak diizinkan

## ⚙️ Konfigurasi

Semua konfigurasi dilakukan melalui file `.env`:

```env
# Wajib untuk fitur AI Chat
OPENROUTER_API_KEY=sk-or-v1-...

# Opsional — default sudah baik untuk sebagian besar kasus
PORT=3000
AI_MODEL=openai/gpt-4o-mini
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

## 🏗️ Struktur Project

```
projectAtlas/
├── apps/
│   ├── web/              # Frontend React + Vite + Tailwind
│   └── server/           # Backend Node.js + Fastify + SQLite
├── packages/
│   ├── core/             # Type definitions & utilities
│   ├── document/         # Document processing (PDF, DOCX, TXT)
│   └── ai/               # AI provider abstraction
├── simple-atlas/         # Versi standalone (JS murni) — port 3001
└── scripts/              # Test scripts
```

## 🐛 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `EADDRINUSE` (port bentrok) | Ubah `PORT=3000` di `.env` ke port lain, lalu update `apps/web/vite.config.ts` proxy target |
| API key error | Pastikan `OPENROUTER_API_KEY` diisi dengan key dari [OpenRouter](https://openrouter.ai/keys) |
| Search tidak menemukan file | Pastikan folder sudah ditambahkan dan proses indexing selesai |
| Build gagal | Pastikan Node.js versi 18+ dan jalankan `npm install` ulang |

## 🧪 Testing

```bash
node scripts/test-comprehensive-rag.mjs
node scripts/test-professor-level-intelligence.mjs
```

Pastikan server ATLAS berjalan terlebih dahulu (`npm run dev`).

## 📄 Format File yang Didukung

- PDF
- DOCX
- TXT
- Markdown (.md)

## 📝 Lisensi

MIT