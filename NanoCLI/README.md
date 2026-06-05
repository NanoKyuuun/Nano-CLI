<h1 align="center">NanoCLI</h1>

<p align="center">
  <strong>Terminal-first AI coding assistant</strong><br>
  Berbasis TypeScript · OpenRouter API · SQLite Project Memory
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/%40nanokyuuun%2Fnanocli?style=flat-square&color=CB3837&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/runtime-Node.js_20%2B-green?style=flat-square" alt="runtime">
  <img src="https://img.shields.io/badge/license-ISC-gray?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/status-Beta-orange?style=flat-square" alt="status">
</p>

---

NanoCLI adalah AI coding assistant yang berjalan sepenuhnya di terminal. Ia menggunakan OpenRouter untuk akses ke berbagai model LLM, menyimpan memori proyek secara lokal dengan SQLite FTS5, dan mendukung mode agent untuk mengeksekusi multi-step coding task secara otomatis.

## Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Chat interaktif** | Session chat dengan context compaction otomatis |
| **Agent mode** | Multi-step task execution dengan approval gate |
| **Project memory** | SQLite FTS5 untuk RAG (Retrieval-Augmented Generation) |
| **Multi-model** | Support semua model di OpenRouter via picker UI |
| **Web search** | Integrasi search otomatis berdasarkan konteks |
| **Code commands** | `review`, `debug`, `patch`, `test`, `plan`, `write`, `generate` |
| **Security** | Env var isolation, secret redaction, audit log |

## Prasyarat

- **Node.js** 20 atau lebih baru
- **npm** 10 atau lebih baru
- **OpenRouter API key** — daftar gratis di [openrouter.ai](https://openrouter.ai)

## Instalasi

### Via npm (Direkomendasikan)

```bash
npm install -g @nanokyuuun/nanocli
```

### Setup

```bash
# Setup API key dan konfigurasi
nanocli setup

# Inisialisasi project memory (opsional, tapi direkomendasikan)
nanocli init
```

### Dari Source

```bash
git clone https://github.com/NanoKyuuun/Nano-CLI.git
cd Nano-CLI/NanoCLI
npm install
npm run build
npm install -g .
```

Lihat [INSTALL.md](INSTALL.md) untuk panduan detail, troubleshooting, dan prasyarat build tools.

---

## Penggunaan

### Chat Interaktif

```bash
nanocli
```

Membuka sesi chat interaktif. Tekan `/help` di dalam chat untuk melihat semua perintah.

### Quick Ask (non-interaktif)

```bash
nanocli ask "Apa itu dependency injection?"
nanocli ask "Jelaskan error ini: ..." --mode high
nanocli ask "Cari pola terbaru" --search on
```

### Agent Mode (multi-step task)

```bash
nanocli agent "Buat auth service dengan JWT di src/auth.ts"
nanocli agent "Refactor semua console.log ke logger di folder src/" --dry-run
nanocli agent "Buat unit test untuk semua file di src/commands/" --verbose
```

### Code Commands

```bash
# Review kode
nanocli review src/auth.ts

# Debug error
nanocli debug src/auth.ts "TypeError: Cannot read property 'id' of undefined"

# Patch file
nanocli patch src/auth.ts "Tambahkan validasi input di method login"
nanocli patch src/auth.ts "..." --apply   # langsung apply patch

# Generate unit test
nanocli test src/auth.ts --framework vitest

# Buat file baru
nanocli write docs/ARCHITECTURE.md "Dokumentasikan arsitektur sistem auth"

# Implementation plan
nanocli plan "Implementasi fitur notifikasi real-time dengan WebSocket"

# Generate dokumen
nanocli generate prd "Fitur login dengan OAuth2" --out docs/PRD-oauth.md
nanocli generate implementation "Fitur auth" --out docs/IMPL-auth.md
```

### Memory Commands

```bash
# Di dalam chat:
/memory review          # Lihat 20 memory terakhir
/memory save <teks>     # Simpan memory manual
/memory forget <id>     # Hapus memory
/memory auto on|off     # Toggle auto-extraction saat exit
/memory update          # Re-index file project
```

### Mode & Model

```bash
# Ganti mode kualitas
nanocli ask "..." --mode fast        # Cepat, murah
nanocli ask "..." --mode normal      # Seimbang (default)
nanocli ask "..." --mode high        # Kualitas tinggi
nanocli ask "..." --mode extra-high  # Terbaik, paling mahal

# Ganti model
nanocli model          # Picker interaktif
nanocli model list     # Daftar model tersedia
```

### Terminal Commands

```bash
# Jalankan command dengan approval
nanocli run "npm test"
nanocli run "git status"

# Di dalam chat:
/run npm install
/terminal detect      # Deteksi shell tersedia
```

---

## Struktur Direktori

```
src/
├── agent/          # AgentLoop, StepRunner, ToolRouter
├── commands/       # ask, review, debug, patch, test, plan, write, generate
├── files/          # ConfigManager, FileOperationManager
├── llm/            # OpenRouterClient, ModelManager
├── memory/         # Indexer (SQLite FTS5), MemoryManager, MemoryExtractor
├── prompts/        # PromptBuilder, system prompts
├── security/       # SecretRedactor, AuditLogger, PolicyEngine
├── terminal/       # CommandExecutor, ShellDetector
├── tokens/         # TokenBudgetManager, StatsManager
└── ui/             # ChatUI, Renderer, ModelPickerUI
tests/              # Vitest test files
```

---

## Development

```bash
# Build ulang setelah perubahan
npm run build

# Typecheck tanpa build
npm run typecheck

# Jalankan test
npm test

# Watch mode untuk test
npm run test:watch

# Typecheck + test sekaligus
npm run check
```

---

## Konfigurasi

Konfigurasi disimpan di `~/.nanocli/config.json` (global) dan `.nanocli/` (per-project).

File konfigurasi global berisi:
- `apiKey` — OpenRouter API key (dienkripsi)
- `model` — Model default per mode (`fast`, `normal`, `high`, `extra-high`)
- `mode` — Mode koneksi: `local` | `share` | `self-host`

---

## Security Notes

- **API key** tidak pernah diwariskan ke subprocess (env var whitelist)
- **Secret redaction** aktif di output terminal dan audit log
- **Path guard** mencegah akses ke file di luar project root
- **Approval gate** diperlukan sebelum file write atau command execution

---

## License

ISC © NanoKyuuun
