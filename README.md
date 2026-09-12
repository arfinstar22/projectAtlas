# ATLAS - Hybrid Local Document Intelligence

**Jangan cari file. Cari jawabannya.**

ATLAS adalah aplikasi document intelligence yang memungkinkan Anda mencari dan memahami kumpulan dokumen lokal menggunakan bahasa natural. File tetap berada di komputer Anda - ATLAS yang datang ke file, bukan sebaliknya.

## ✨ Fitur Utama

- 🔒 **Local-First**: File asli tetap di komputer Anda
- 🧠 **Hybrid AI**: Gunakan cloud AI atau local AI sesuai kebutuhan
- 🔍 **Smart Search**: Cari dengan kata kunci atau tanyakan langsung
- 📝 **Source-Grounded**: Setiap jawaban dilengkapi sumber yang jelas
- 🎯 **Multi-Format**: PDF, DOCX, TXT, Markdown, CSV, dan gambar
- 💰 **Cost-Effective**: Dapat digunakan dengan free-tier AI providers

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm atau yarn

### Installation

```bash
git clone <repository>
cd atlas
npm install
```

### Configuration

1. Copy environment file:
```bash
cp .env.example .env
```

2. Konfigurasi AI Provider (opsional):
```env
OPENROUTER_API_KEY=your_key_here
AI_MODEL=openai/gpt-3.5-turbo
EMBEDDING_MODEL=openai/text-embedding-ada-002
```

### Running

```bash
npm run dev
```

Buka browser di `http://localhost:3000`

## 📚 Cara Menggunakan

1. **Tambah Folder**: Pilih folder yang berisi dokumen Anda
2. **Indexing**: ATLAS akan memproses dan mengindex dokumen
3. **Cari atau Tanya**: Gunakan search bar untuk mencari file atau bertanya
4. **Buka Sumber**: Klik sumber untuk membuka file asli

### Contoh Pertanyaan

- "Berapa total anggaran kegiatan tahun 2025?"
- "Bandingkan laporan 2024 dan 2025"
- "Apa saja persyaratan dalam SOP kepegawaian?"

## 🏗️ Arsitektur

```
Browser ↔ ATLAS Web App ↔ Local Backend ↔ Document Engine ↔ Local Files
                     ↓
              AI Provider (hanya konteks relevan)
```

**Privacy-First**: Hanya konteks relevan yang dikirim ke AI provider, bukan seluruh file.

## 🔧 Development

### Project Structure

```
atlas/
├── apps/
│   ├── web/          # React frontend
│   └── server/       # Node.js backend
├── packages/
│   ├── core/         # Shared types & utilities
│   ├── document/     # Document processing
│   ├── search/       # Search & indexing
│   └── ai/           # AI provider abstraction
```

### Available Commands

```bash
npm run dev          # Start development servers
npm run build        # Build for production
npm run lint         # Run linter
npm run typecheck    # Run TypeScript checks
```

## 🔐 Security & Privacy

- File asli **tidak pernah** dikirim ke cloud
- Hanya folder yang Anda izinkan yang dapat diakses
- API key disimpan lokal dan tidak di-commit ke repository
- Path traversal protection
- File type validation

## 🤖 Supported AI Providers

- **OpenRouter**: Multi-model access dengan satu API
- **Local AI**: Support untuk Ollama dan model lokal (coming soon)

## 📄 Supported File Types

**Dokumen**
- PDF
- DOCX  
- TXT
- Markdown

**Spreadsheet**
- XLSX
- CSV

**Image** (dengan OCR)
- JPG, JPEG, PNG, WEBP

## 🐛 Troubleshooting

### API Key Issues
Pastikan API key disimpan di file `.env` dan memiliki format yang benar.

### File Access Issues
ATLAS hanya dapat mengakses folder yang telah Anda berikan izin melalui UI.

### Performance Issues
Untuk folder besar (>1000 files), indexing berjalan di background. Anda tetap dapat menggunakan aplikasi selama proses ini.

## 🛣️ Roadmap

- [ ] OCR untuk gambar dan scanned PDF
- [ ] Multi-document comparison
- [ ] Document summarization
- [ ] Local LLM integration (Ollama)
- [ ] File watcher untuk auto-indexing
- [ ] Advanced query capabilities

## 🤝 Contributing

Kontribusi sangat diterima! Silakan buat issue atau pull request.

## 📝 License

MIT License - lihat [LICENSE](LICENSE) untuk detail.

---

**ATLAS** - Lapisan kecerdasan untuk dokumen lokal Anda.