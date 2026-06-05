# SECURITY.md — Kebijakan Keamanan NanoCLI

## Ruang Lingkup

Dokumen ini menjelaskan model keamanan NanoCLI, apa yang dilindungi, apa yang tidak, dan cara melaporkan kerentanan.

---

## Model Keamanan

### 1. API Key Protection

**Apa yang dilakukan:**
- API key disimpan di `~/.nanocli/config.json` dengan enkripsi AES-256 via `crypto-js`
- API key **tidak pernah** muncul di output terminal
- API key **tidak pernah** diwariskan ke subprocess yang dijalankan via `nanocli run`

**Batasan:**
- Enkripsi lokal bergantung pada keamanan sistem file user
- Jika file config bisa dibaca oleh proses lain, key bisa dikompromikan
- NanoCLI tidak menggunakan keychain sistem operasi (belum)

### 2. Environment Variable Isolation

**Apa yang dilakukan:**
- Subprocess (command yang dijalankan via `nanocli run` atau agent) hanya menerima subset env vars yang aman via allowlist:

```
PATH, HOME, SHELL, TERM, USER, USERNAME, LOGNAME
SystemRoot, ComSpec, USERPROFILE, HOMEDRIVE, HOMEPATH
APPDATA, LOCALAPPDATA, PROGRAMFILES, PROGRAMDATA, WINDIR
TMPDIR, TEMP, TMP
LANG, LC_ALL, LC_CTYPE
NODE_ENV, npm_config_cache, npm_config_prefix
```

- `OPENROUTER_API_KEY`, `DATABASE_URL`, `JWT_SECRET`, `AWS_*` dan credential lain **tidak** diwariskan
- Implementasi: `buildSafeEnv()` di `src/terminal/commandExecutor.ts`

**Batasan:**
- Command yang butuh env tertentu (misal `NPM_TOKEN` untuk publish) tidak bisa jalan by default
- User harus set env tersebut di shell sendiri sebelum memanggil command itu

### 3. File Path Guard

**Apa yang dilakukan:**
- Semua file write harus berada di dalam `projectRoot`
- Path traversal (`../../etc/passwd`) ditolak
- Symlink divalidasi sebelum operasi

**Batasan:**
- Guard berbasis `projectRoot` — jika user menjalankan NanoCLI di `/`, semua path bisa valid
- Gunakan dari direktori project yang tepat

### 4. Approval Gate

**Apa yang dilakukan:**
- Semua file write dan command execution memerlukan approval eksplisit dari user
- Agent mode menampilkan preview action sebelum eksekusi
- Dry-run tersedia tanpa eksekusi nyata

**Batasan:**
- User masih bisa approve command berbahaya jika tidak hati-hati
- Tidak ada sandboxing atau containerisasi

### 5. Secret Redaction

**Apa yang dilakukan:**
- Output dari subprocess di-scan untuk pola secret yang umum
- Secret yang terdeteksi diganti dengan `[REDACTED]` sebelum ditampilkan
- Pola yang dideteksi: API key, password, token, connection string

**Batasan:**
- Redaction berbasis pattern matching — secret dengan format non-standar bisa lolos
- Tidak 100% reliable, jangan andalkan sebagai satu-satunya lapisan keamanan

### 6. Audit Log

**Apa yang dilakukan:**
- Setiap command execution dicatat ke `.nanocli/audit.log`
- Log mencakup: timestamp, command, exit code, cwd
- Log tidak mencatat output penuh (hanya preview)

---

## Yang Belum Dilindungi (Known Limitations)

| Risiko | Status | Catatan |
|--------|--------|---------|
| Sandboxed execution | ❌ Belum | Command berjalan di host langsung |
| Backend authentication | ⚠️ Partial | Backend Python perlu `API_KEY` diset secara manual |
| Keychain OS integration | ❌ Belum | API key disimpan di file, bukan keychain |
| Network request inspection | ❌ Belum | Request ke OpenRouter tidak diinspeksi |
| Agent content injection | ⚠️ Mitigasi | Ada prompt injection guard untuk web search, belum untuk file content |

---

## Melaporkan Kerentanan

Jika kamu menemukan kerentanan keamanan di NanoCLI:

1. **Jangan** buat public issue di GitHub
2. Kirim email ke maintainer secara langsung (lihat profil GitHub)
3. Deskripsikan: versi NanoCLI, langkah reproduksi, dampak yang kamu perkirakan
4. Kami akan merespons dalam 48 jam

---

## Scope yang Tidak Dicakup

- Keamanan dari OpenRouter API itu sendiri (bukan tanggung jawab NanoCLI)
- Keamanan model LLM yang digunakan
- Keamanan file yang ditulis oleh agent (konten ditentukan oleh LLM)
- Keamanan jaringan antara user dan backend Python self-hosted

---

## Rekomendasi untuk Penggunaan Aman

```bash
# ✅ Gunakan dari direktori project yang tepat
cd /path/to/your/project
nanocli agent "..."

# ✅ Review setiap action sebelum approve
# (default: requireApproval = true)

# ✅ Gunakan --dry-run untuk preview tanpa eksekusi
nanocli agent "..." --dry-run

# ✅ Jangan simpan secret di file yang diindeks NanoCLI
echo ".env" >> .nanocliignore

# ❌ Jangan jalankan dari direktori root
# cd /
# nanocli agent "..."
```

---

## Versi

Dokumen ini berlaku untuk NanoCLI v1.0.0 (Alpha Preview).
