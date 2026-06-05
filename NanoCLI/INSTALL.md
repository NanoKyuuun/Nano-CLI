# INSTALL.md — Panduan Instalasi NanoCLI

## Prasyarat

| Software | Versi Minimum | Cek |
|----------|--------------|-----|
| Node.js  | 20.x         | `node --version` |
| npm      | 10.x         | `npm --version` |
| Git      | 2.x          | `git --version` |

> [!IMPORTANT]
> NanoCLI adalah **TypeScript/Node.js project**, bukan Python.
> Jangan gunakan `pip install`. Gunakan `npm install`.

---

## Langkah Instalasi

### Step 1 — Clone Repository

```bash
git clone <repo-url> NanoCLI
cd NanoCLI
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

### Step 4 — Install Global (Opsional tapi Direkomendasikan)

```bash
npm install -g .
```

Setelah ini, `nanocli` bisa dijalankan dari direktori manapun.

Untuk verify:
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

> [!NOTE]
> API key dari OpenRouter bisa diperoleh gratis di [openrouter.ai/keys](https://openrouter.ai/keys).
> Beberapa model tersedia dengan kredit gratis.

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

Jalankan test untuk memastikan semua komponen berfungsi:

```bash
# Cek build
npm run build

# Cek semua test pass
npm test

# Cek binary
nanocli --help
```

Expected output `npm test`:
```
✓ tests/commandExecutor.test.ts (11 tests)
✓ tests/patchApplicator.test.ts (7 tests)
✓ tests/toolRouter.test.ts (21 tests)
✓ tests/tokenBudgetManager.test.ts (10 tests)

Test Files  4 passed (4)
     Tests  49 passed (49)
```

---

## Troubleshooting

### Error: `Cannot find module 'better-sqlite3'`

```bash
npm install
npm rebuild better-sqlite3
```

`better-sqlite3` adalah native module yang perlu di-compile untuk Node.js versi kamu.

### Error: `API Key tidak ditemukan`

```bash
nanocli setup
```

Atau periksa apakah file `~/.nanocli/config.json` ada dan berisi `apiKey`.

### Error: `nanocli: command not found`

Jalankan dari direktori project:
```bash
node dist/main.js
```

Atau install global ulang:
```bash
npm install -g .
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

```bash
git pull
npm install
npm run build
```

---

## Uninstall

```bash
# Hapus global binary
npm uninstall -g nanocli

# Hapus config (opsional — ini menghapus API key dan semua settings)
rm -rf ~/.nanocli

# Hapus project memory (opsional)
rm -rf .nanocli/
```
