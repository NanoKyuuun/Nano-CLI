# INSTALL.md — Panduan Instalasi NanoCLI

## Prasyarat

| Software | Versi Minimum | Cek |
|----------|--------------|-----|
| Node.js  | 20.x         | `node --version` |
| npm      | 10.x         | `npm --version` |

> [!IMPORTANT]
> NanoCLI adalah **TypeScript/Node.js project**, bukan Python.
> Jangan gunakan `pip install`. Gunakan `npm install`.

---

## Cara 1 — Via npm (Direkomendasikan)

Cara tercepat. Tidak perlu clone, tidak perlu build.

```bash
npm install -g @nanokyuuun/nanocli
```

Verifikasi:
```bash
nanocli --version
```

Lanjut ke [Setup API Key](#setup-api-key).

---

## Cara 2 — Dari Source

Gunakan cara ini jika kamu ingin berkontribusi atau memodifikasi kode.

**Tambahan prasyarat untuk build dari source:**

Build tools untuk `better-sqlite3` (native addon):

| OS | Cara Install |
|----|-------------|
| **Windows** | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — centang "Desktop development with C++" |
| **macOS** | `xcode-select --install` |
| **Linux** | `sudo apt install build-essential` (Ubuntu/Debian) |

### Step 1 — Clone Repository

```bash
git clone https://github.com/NanoKyuuun/Nano-CLI.git
cd Nano-CLI/NanoCLI
```

### Step 2 — Install Dependencies

```bash
npm install
```

Ini akan menginstall semua dependency yang tercantum di `package.json`, termasuk:
- `better-sqlite3` — local SQLite database untuk project memory
- `commander` — CLI framework
- `enquirer` — interactive prompts
- `chalk` — terminal coloring
- `js-tiktoken` — token counting

### Step 3 — Build TypeScript

```bash
npm run build
```

Output build ada di folder `dist/`. Pastikan tidak ada error TypeScript sebelum melanjutkan.

### Step 4 — Install Global

```bash
npm install -g .
```

Setelah ini, `nanocli` bisa dijalankan dari direktori manapun.

Verifikasi:
```bash
nanocli --version
```

Jika tidak install global, jalankan langsung via:
```bash
node dist/main.js --version
```

---

## Setup API Key

### Cara 1 — Setup Wizard (Direkomendasikan)

```bash
nanocli setup
```

Wizard akan memandu kamu untuk:
1. Memasukkan OpenRouter API key
2. Memilih model default untuk setiap mode (fast/normal/high/extra-high)
3. Memilih mode koneksi (local/share/self-host)

> [!NOTE]
> API key dari OpenRouter bisa diperoleh gratis di [openrouter.ai/keys](https://openrouter.ai/keys).
> Beberapa model tersedia dengan kredit gratis.

### Cara 2 — Manual

Buat file `~/.nanocli/config.json`:

```json
{
  "apiKey": "sk-or-v1-your-key-here",
  "models": {
    "fast": "google/gemini-flash-1.5",
    "normal": "anthropic/claude-3.5-sonnet",
    "high": "anthropic/claude-3.5-sonnet",
    "extra-high": "anthropic/claude-3-opus"
  }
}
```

---

## Inisialisasi Project

Di root direktori project yang ingin kamu gunakan dengan NanoCLI:

```bash
nanocli init
```

Ini akan:
1. Membuat direktori `.nanocli/` di project root
2. Membuat SQLite database untuk project memory
3. Mengindeks file project untuk FTS (Full-Text Search)

> [!TIP]
> Tambahkan `.nanocli/` ke `.gitignore` agar database tidak ter-commit ke repository:
> ```
> echo ".nanocli/" >> .gitignore
> ```

---

## Verifikasi Instalasi

```bash
# Cek versi
nanocli --version

# Cek semua komponen (health check)
nanocli doctor

# Cek help
nanocli --help
```

Expected output `nanocli doctor`:
```
✓ OpenRouter API key     — ditemukan
✓ Model tersedia         — terkoneksi
✓ SQLite memory          — aktif
✓ Project context        — terindeks
✓ Git integration        — tersedia
```

---

## Troubleshooting

### Error: `Cannot find module 'better-sqlite3'`

```bash
npm install
npm rebuild better-sqlite3
```

`better-sqlite3` adalah native module yang perlu di-compile untuk Node.js versi kamu.
Pastikan build tools sudah terinstall (lihat [Cara 2](#cara-2--dari-source) di atas).

### Error: `API Key tidak ditemukan`

```bash
nanocli setup
```

Atau periksa apakah file `~/.nanocli/config.json` ada dan berisi `apiKey`.

### Error: `nanocli: command not found`

Jika install via npm:
```bash
npm install -g @nanokyuuun/nanocli
```

Jika install dari source:
```bash
npm install -g .
```

Atau jalankan langsung dari project directory:
```bash
node dist/main.js
```

### Build error: TypeScript errors

```bash
npm run typecheck
```

Pastikan kamu menggunakan Node.js 20+ dan TypeScript 5+:
```bash
node --version   # should be v20.x or higher
npx tsc --version  # should be 5.x or higher
```

---

## Update

### Jika install via npm:
```bash
npm update -g @nanokyuuun/nanocli
```

### Jika install dari source:
```bash
git pull
npm install
npm run build
```

---

## Uninstall

```bash
# Hapus global binary
npm uninstall -g @nanokyuuun/nanocli

# Hapus config (opsional — ini menghapus API key dan semua settings)
rm -rf ~/.nanocli

# Hapus project memory (opsional)
rm -rf .nanocli/
```
