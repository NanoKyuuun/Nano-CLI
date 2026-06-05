<div align="center">

# 🤖 NanoCLI

**Terminal-first AI coding assistant dengan project memory, agent mode, dan multi-model support**

[![npm version](https://img.shields.io/npm/v/%40nanokyuuun%2Fnanocli?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@nanokyuuun/nanocli)
[![npm downloads](https://img.shields.io/npm/dm/%40nanokyuuun%2Fnanocli?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@nanokyuuun/nanocli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)](https://www.typescriptlang.org)
[![Status](https://img.shields.io/badge/status-Beta-orange?style=flat-square)]()

[Instalasi](#-instalasi) · [Penggunaan](#-penggunaan-cepat) · [Fitur](#-fitur) · [Konfigurasi](#-konfigurasi) · [Self-Host](#-self-host-backend) · [Kontribusi](#-kontribusi)

</div>

---

## Apa itu NanoCLI?

NanoCLI adalah AI coding assistant yang berjalan sepenuhnya di terminal. Tidak perlu IDE, tidak perlu plugin, tidak perlu akun premium — cukup terminal dan API key OpenRouter yang gratis.

NanoCLI dibangun dengan filosofi:
- **Local-first** — project memory disimpan di SQLite lokal, tidak ada data yang keluar tanpa izin kamu
- **Model-agnostic** — pilih dari 300+ model di OpenRouter (GPT-4o, Claude, Gemini, Llama, dll.)
- **Developer-centric** — dirancang untuk workflow developer nyata, bukan demo

```
┌─────────────────────────────────────────────────────────┐
│  NanoCLI  v1.0.0          Mode: Chat · Local Memory     │
├─────────────────────────────────────────────────────────┤
│  > review src/auth.ts                                   │
│                                                         │
│  🔍 Menganalisis file...                                │
│                                                         │
│  Ditemukan 3 isu:                                       │
│  • Line 47: JWT secret dibaca langsung dari env         │
│    tanpa validasi. Bisa crash jika tidak di-set.        │
│  • Line 83: bcrypt.compare() tidak di-await —          │
│    selalu return undefined (silent bug)                 │
│  • Line 91: No rate limiting pada login endpoint        │
│                                                         │
│  [s] save  [c] copy  [↵] lanjut                        │
└─────────────────────────────────────────────────────────┘
```

---

## ✨ Fitur

### 🧠 Project Memory
NanoCLI menyimpan konteks proyek kamu secara persisten menggunakan SQLite FTS5. Setiap sesi, AI memahami arsitektur, keputusan teknis, dan pola kode proyekmu — tanpa harus explain ulang.

```bash
nanocli memory add "Kita pakai repository pattern, bukan active record"
nanocli memory search "database pattern"
nanocli memory list --pinned
```

### 🤖 Agent Mode
Agent bisa mengeksekusi multi-step coding task secara otomatis — membaca file, menulis kode, menjalankan command — dengan approval gate yang bisa dikonfigurasi.

```bash
nanocli agent "Tambahkan unit test untuk semua function di src/utils.ts"
nanocli agent "Refactor auth.ts menggunakan dependency injection" --auto-approve
```

### 💬 Coding Commands
Set command khusus untuk task coding sehari-hari:

| Command | Deskripsi |
|---------|-----------|
| `nanocli review <file>` | Code review mendalam — bug, security, best practice |
| `nanocli debug <file>` | Analisis error dan solusi langkah demi langkah |
| `nanocli patch <file>` | Generate dan apply patch otomatis |
| `nanocli test <file>` | Generate unit test |
| `nanocli plan <task>` | Buat implementation plan terstruktur |
| `nanocli write <file>` | Tulis atau refactor file dengan instruksi |
| `nanocli generate <desc>` | Generate file baru dari deskripsi |

### 🔄 Multi-Model Support
Pilih model terbaik untuk setiap task:

```bash
# Picker UI interaktif
nanocli model

# Set per-mode di .env
MODEL_FAST=google/gemini-flash-1.5       # Cepat & murah
MODEL_NORMAL=anthropic/claude-3.5-sonnet  # Seimbang (default)
MODEL_HIGH=anthropic/claude-3.5-sonnet    # Kualitas tinggi
MODEL_EXTRA_HIGH=anthropic/claude-3-opus  # Terbaik
```

### 🔒 Security by Default
- **Secret redaction** — API key dan credential otomatis disensor di output terminal
- **Env var isolation** — subprocess tidak inherit seluruh `process.env`
- **File path guard** — operasi file terbatas di project directory
- **Approval gate** — setiap operasi destructive butuh konfirmasi eksplisit
- **Audit log** — semua aksi agent tercatat

### 🏥 Self-Diagnostics
```bash
nanocli doctor
```
Mengecek 10 komponen sekaligus: API key, koneksi model, SQLite, memory system, git, backend server, dan lainnya.

### 📦 Git Integration
```bash
nanocli git status       # Status dengan diff summary
nanocli git diff         # Diff yang AI-readable
nanocli git checkpoint   # Auto-commit dengan pesan AI
nanocli git log          # Log dengan ringkasan perubahan
```

---

## 📦 Instalasi

### Via npm (Direkomendasikan)

```bash
npm install -g @nanokyuuun/nanocli
```

> Tidak perlu clone, tidak perlu build. Langsung bisa dipakai.

### Setup setelah install

```bash
# Setup API key dan konfigurasi (wajib, sekali saja)
nanocli setup

# Cek semua komponen berfungsi
nanocli doctor
```

### Dari Source

**Prasyarat build tools** untuk `better-sqlite3`:
- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — centang "Desktop development with C++"
- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt install build-essential`

```bash
git clone https://github.com/NanoKyuuun/Nano-CLI.git
cd Nano-CLI/NanoCLI
npm install
npm run build
npm install -g .
```

Lihat [INSTALL.md](NanoCLI/INSTALL.md) untuk panduan lengkap dan troubleshooting.

---

## 🚀 Penggunaan Cepat

```bash
# Mulai sesi chat interaktif
nanocli

# Tanya cepat tanpa masuk ke sesi chat
nanocli ask "Apa perbedaan interface dan type di TypeScript?"

# Review kode — menemukan bug, security issue, best practice
nanocli review src/auth.ts

# Debug error — paste error, dapat solusi
nanocli debug src/payment.ts

# Agent mode — eksekusi task multi-step
nanocli agent "Tambahkan error handling ke semua API route"

# Generate file baru
nanocli generate "Express middleware untuk rate limiting dengan Redis"

# Cek kesehatan sistem
nanocli doctor
```

### Shortcut dalam Chat

| Shortcut | Aksi |
|----------|------|
| `/help` | Tampilkan semua command |
| `/memory` | Kelola project memory |
| `/model` | Ganti model AI |
| `/mode` | Ganti mode (local/share/self-host) |
| `/clear` | Bersihkan layar |
| `Ctrl+C` | Keluar |

---

## ⚙️ Konfigurasi

Salin `.env.example` ke `.env` dan isi:

```bash
cp .env.example .env
```

```env
# API Key OpenRouter (wajib)
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxx

# Mode koneksi: local | share | self-host
NANOCLI_MODE=local

# Model per tier (opsional — ada default)
MODEL_FAST=google/gemini-flash-1.5
MODEL_NORMAL=anthropic/claude-3.5-sonnet
MODEL_HIGH=anthropic/claude-3.5-sonnet
MODEL_EXTRA_HIGH=anthropic/claude-3-opus
```

### Mode Koneksi

| Mode | Deskripsi | Kapan dipakai |
|------|-----------|---------------|
| `local` | Hanya SQLite FTS5 lokal | Default, privasi maksimum |
| `share` | Kirim usage stats anonim ke server NanoCLI | Bantu pengembangan (opt-in) |
| `self-host` | Koneksi ke backend RAG milik sendiri | Semantic search + team sharing |

---

## 🖥️ Self-Host Backend

Untuk semantic search berbasis embedding (bukan keyword), NanoCLI menyediakan backend Python yang bisa di-host sendiri:

**Stack:** FastAPI · PostgreSQL + pgvector · Ollama (embedding lokal)

```bash
cd nanocli-server
cp .env.example .env
# Edit .env: isi API_KEY, DATABASE_URL

docker compose up -d
```

Setelah server berjalan, setup dari CLI:
```bash
nanocli remote setup
# Pilih "Self-host" → masukkan URL server dan API key
```

Lihat [nanocli-server/README.md](nanocli-server/README.md) untuk panduan deployment lengkap.

---

## 🏗️ Arsitektur

```
NanoCLI/
├── src/
│   ├── agent/          # AgentLoop, StepRunner, ToolRouter
│   ├── commands/       # review, debug, patch, test, plan, write, generate, doctor
│   ├── memory/         # Indexer (SQLite FTS5), MemoryManager, FileWatcher
│   ├── remote/         # TelemetryClient, HomeServerClient
│   ├── security/       # ApprovalGate, SecretRedactor, PathGuard, PolicyEngine
│   ├── tokens/         # TokenBudgetManager, StatsManager
│   ├── ui/             # ChatUI, RemoteSetupUI, ModelPickerUI
│   └── cli.ts          # Entry point Commander.js
├── tests/              # Vitest (107 tests)
└── dist/               # Build output (TypeScript → CommonJS)

nanocli-server/
├── api/
│   ├── main.py         # FastAPI app
│   ├── routes/         # /memory, /search, /telemetry, /health
│   └── db.py           # PostgreSQL + pgvector
└── docker-compose.yml
```

### Teknologi Utama

| Layer | Teknologi |
|-------|-----------|
| CLI Framework | Commander.js |
| AI Provider | OpenRouter API |
| Local Memory | SQLite FTS5 via better-sqlite3 |
| Token Counting | js-tiktoken |
| Semantic Search | pgvector + Ollama (self-host) |
| Interactive UI | Enquirer, chalk, cli-table3 |
| File Watching | chokidar |
| Backend | FastAPI (Python) |

---

## 🧪 Development

```bash
cd NanoCLI

# Install dependencies
npm install

# Development dengan ts-node
npm start

# Run tests
npm test

# Typecheck
npm run typecheck

# Build
npm run build
```

### Test Coverage

```
✓ tests/tokenBudgetManager.test.ts  (10 tests)
✓ tests/patchApplicator.test.ts      (7 tests)
✓ tests/toolRouter.test.ts          (21 tests)
✓ tests/commandExecutor.test.ts     (11 tests)
✓ tests/agentLoop.test.ts           (15 tests)
✓ tests/pathGuard.test.ts           (20 tests)
✓ tests/indexer.test.ts             (23 tests)
─────────────────────────────────────
Total: 107 tests passing
```

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Lihat [CONTRIBUTING.md](NanoCLI/CONTRIBUTING.md) untuk panduan lengkap.

**Quick start:**
```bash
git clone https://github.com/NanoKyuuun/Nano-CLI.git
cd Nano-CLI/NanoCLI
npm install
npm test   # Pastikan semua test pass sebelum mulai
```

Baca juga [SECURITY.md](NanoCLI/SECURITY.md) untuk panduan melaporkan vulnerability.

---

## ⚠️ Known Limitations

- **100% bergantung OpenRouter** — tidak bisa dipakai offline (Ollama support: roadmap)
- **Agent memory per-session** — agent tidak mengingat context dari sesi sebelumnya
- **Semantic search butuh self-host backend** — mode local hanya keyword search (FTS5)
- **Test coverage ~40%** — modul core sudah tercakup, UI dan integrasi belum penuh

---

## 📄 License

ISC © 2026 [NanoKyuuun](https://github.com/NanoKyuuun)

---

<div align="center">

Dibuat dengan ☕ dan terlalu banyak sesi debugging di terminal

**[⭐ Star repo ini](https://github.com/NanoKyuuun/Nano-CLI)** jika NanoCLI membantu pekerjaan kamu

</div>
