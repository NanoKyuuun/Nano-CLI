# Product Requirements Document

# NanoCLI: AI Coding Assistant berbasis CLI dengan TypeScript, OpenRouter API, dan Project Memory Hemat Token

**Versi:** PRD Revisi v3 TypeScript OpenRouter + Terminal Setup UI  
**Tanggal:** 16 Mei 2026  
**Bahasa utama:** TypeScript  
**Runtime:** Node.js 20+  
**LLM Provider:** OpenRouter API  
**Mode default:** `nanocli` langsung membuka chat interaktif  
**Fokus tambahan:** setup UI API key, model picker, dan pengurangan penggunaan token API sampai target maksimal 70%

---

## 1. Ringkasan Produk

NanoCLI adalah aplikasi Command Line Interface berbasis TypeScript untuk membantu pekerjaan coding harian melalui terminal. NanoCLI menggunakan OpenRouter API sebagai gerbang utama ke berbagai model LLM. Pengguna dapat memilih model sesuai kebutuhan, biaya, kualitas, dan kecepatan.

NanoCLI tetap mempertahankan konsep Project Memory. Sistem ini menyimpan ringkasan proyek, keputusan teknis, riwayat bug, changelog, preferensi coding, dan indeks konteks proyek secara lokal. Saat pengguna bertanya, NanoCLI mengambil konteks yang paling relevan dan hanya mengirim bagian yang dibutuhkan ke model melalui OpenRouter API.

Perubahan utama dari PRD sebelumnya:

1. Bahasa pengembangan berubah dari Python menjadi TypeScript.
2. Runtime berubah dari lokal Ollama menjadi OpenRouter API.
3. Model tidak lagi dikunci ke satu keluarga model lokal.
4. Pengguna dapat memilih model bebas dari daftar model OpenRouter.
5. Saat pengguna mengetik `nanocli` tanpa argumen, aplikasi langsung membuka mode chat.
6. Chat memiliki mode kualitas dan biaya: `fast`, `normal`, `high`, dan `extra-high`.
7. Sistem diperkuat dengan Token Reduction Engine untuk menekan biaya API.
8. NanoCLI memiliki terminal setup UI untuk memasukkan API key, validasi koneksi, dan memilih model.
9. Model picker tersedia untuk memilih model `fast`, `normal`, `high`, dan `extra-high` tanpa mengetik model ID manual.
10. Target penghematan token ditetapkan sampai 70% dibanding baseline tanpa memory retrieval, tanpa compaction, dan tanpa caching.

---

## 2. Masalah yang Ingin Diselesaikan

Developer sering menghadapi masalah berikut.

1. Harus menjelaskan ulang konteks proyek setiap kali memakai AI.
2. Biaya API meningkat karena prompt terlalu panjang.
3. Model cloud sering diberi terlalu banyak file yang tidak relevan.
4. Chat AI biasa tidak memahami struktur proyek secara berkelanjutan.
5. Review kode manual memakan waktu.
6. Debugging lambat karena error, file terkait, dan riwayat perubahan tidak tersimpan dalam satu konteks.
7. Pengguna sering bingung memilih model yang tepat antara cepat, murah, atau kuat.
8. CLI AI sering memakai satu model default tanpa strategi biaya.
9. Pengguna membutuhkan workflow yang cepat dari terminal tanpa harus membuka browser.

NanoCLI menyelesaikan masalah tersebut dengan pendekatan TypeScript-first, OpenRouter-first, project-aware, token-aware, dan safety-first.

---

## 3. Tujuan Produk

Tujuan utama NanoCLI adalah menyediakan AI coding assistant berbasis terminal yang ringan, fleksibel, hemat token, dan mampu memahami konteks proyek secara bertahap.

Tujuan khusus:

1. Membantu developer bertanya cepat melalui terminal.
2. Membuka chat langsung saat pengguna mengetik `nanocli`.
3. Menyediakan mode chat `fast`, `normal`, `high`, dan `extra-high`.
4. Mengizinkan pengguna memilih model OpenRouter secara bebas.
5. Menyediakan setup UI untuk API key dan pemilihan model.
6. Membantu review kode per file.
7. Membantu debugging berdasarkan file, pesan error, dan riwayat bug.
8. Membantu membuat unit test.
9. Menyimpan ringkasan proyek dan keputusan teknis dalam Project Memory lokal.
10. Mengambil konteks relevan dari memory saat menjawab.
11. Mengurangi penggunaan token API melalui compaction, retrieval, caching, dan model routing.
12. Memberi rekomendasi perubahan kode secara aman.
13. Tidak langsung menimpa file tanpa izin pengguna.
14. Memberi transparansi jumlah token, estimasi biaya, dan konteks yang dikirim.

---

## 4. Non-Goals

NanoCLI tidak ditujukan untuk hal berikut pada versi awal.

1. Menggantikan IDE penuh seperti VS Code.
2. Melatih ulang model secara otomatis.
3. Menjadi agent otonom yang bebas menjalankan command berisiko.
4. Mengubah file secara otomatis tanpa preview.
5. Menjalankan shell command dari model tanpa izin eksplisit.
6. Menjamin penghematan token selalu 70% untuk semua proyek.
7. Menjamin semua model OpenRouter memiliki kualitas sama.
8. Menjamin semua provider mendukung caching, tool calling, reasoning, atau structured output.
9. Menjadi sistem offline penuh, karena OpenRouter API membutuhkan internet.
10. Menyimpan atau mengirim file sensitif tanpa persetujuan pengguna.

---

## 5. Target Pengguna

### 5.1 Pengguna Utama

1. Developer individu.
2. Mahasiswa informatika.
3. Pembuat aplikasi kecil.
4. Pengguna terminal.
5. Pengembang yang ingin memakai AI coding assistant dengan biaya API terkendali.
6. Pengembang yang ingin bebas memilih model tanpa mengubah kode aplikasi.

### 5.2 Kebutuhan Pengguna

Pengguna membutuhkan alat yang:

1. Cepat dibuka dari terminal.
2. Langsung masuk chat jika mengetik `nanocli`.
3. Bisa membaca file kode secara aman.
4. Bisa memahami konteks proyek.
5. Bisa menyimpan ringkasan perubahan terakhir.
6. Bisa memilih model berdasarkan mode biaya dan kualitas.
7. Bisa menekan jumlah token yang dikirim ke API.
8. Bisa menampilkan estimasi penggunaan token.
9. Tidak membaca file sensitif secara default.
10. Memberi jawaban teknis yang langsung bisa dipakai.

---

## 6. Prinsip Produk

NanoCLI dikembangkan dengan prinsip berikut.

1. **TypeScript-first**  
   Semua modul inti ditulis dengan TypeScript agar lebih aman secara tipe, mudah dirawat, dan cocok dengan ekosistem Node.js.

2. **OpenRouter-first**  
   NanoCLI memakai OpenRouter API untuk mengakses berbagai model melalui satu konfigurasi.

3. **Project-aware**  
   NanoCLI tidak hanya menjawab prompt. NanoCLI memahami ringkasan proyek, keputusan teknis, file target, dan riwayat perubahan.

4. **Token-aware**  
   Setiap prompt dibangun dengan menghitung ukuran konteks, menghapus duplikasi, memilih chunk relevan, dan membatasi output.

5. **Cost-aware**  
   Mode `fast`, `normal`, `high`, dan `extra-high` mengatur model, konteks, dan batas output sesuai kebutuhan.

6. **Safety-first**  
   NanoCLI tidak membaca file sensitif, tidak menjalankan command berisiko, dan tidak menulis file tanpa konfirmasi.

7. **Transparent by default**  
   Pengguna dapat melihat model yang dipakai, mode chat, estimasi token, dan konteks yang dikirim.

---

## 7. Perubahan Arsitektur dari PRD Lama

### 7.1 Perubahan Bahasa

Sebelumnya:

```text
Python 3.10+
Typer
Rich
Ollama Python client
```

Sekarang:

```text
TypeScript 5.x
Node.js 20+
Commander atau oclif
OpenRouter API
SQLite
Drizzle ORM opsional
```

### 7.2 Perubahan LLM Runtime

Sebelumnya:

```text
Local Ollama Models
qwen3.5:4b-q4_K_M
qwen3.5:9b-q4_K_M
nomic-embed-text
```

Sekarang:

```text
OpenRouter API
Model selectable by user
Default model can be configured
Fast, normal, high, and extra-high model profiles
```

### 7.3 Perubahan Keamanan dan Privasi

Karena NanoCLI memakai API cloud, klaim "tidak mengirim kode ke cloud secara default" harus diganti menjadi:

1. NanoCLI menampilkan peringatan saat project mode aktif.
2. NanoCLI tidak membaca file sensitif.
3. NanoCLI hanya mengirim konteks yang relevan.
4. NanoCLI menyediakan opsi `--local-only-memory` untuk operasi memory tanpa panggilan API.
5. NanoCLI menyediakan opsi `--dry-run-context` untuk melihat konteks sebelum dikirim.
6. NanoCLI menyimpan API key hanya melalui environment variable atau OS secret manager.

---

## 8. Strategi OpenRouter

### 8.1 Konsep

OpenRouter digunakan sebagai gateway ke berbagai model LLM. NanoCLI tidak mengunci pengguna ke satu model. Pengguna dapat memilih model dari konfigurasi, command, atau chat command.

Contoh:

```bash
nanocli chat --model openai/gpt-5.5
nanocli ask "review fungsi ini" --model anthropic/claude-sonnet-4.5
nanocli review src/app.ts --model google/gemini-2.5-pro
nanocli chat --mode fast
nanocli chat --mode extra-high
```

Catatan: nama model pada contoh dapat berubah mengikuti daftar model OpenRouter yang tersedia. NanoCLI harus menyediakan command untuk mengambil daftar model terbaru dari API.

### 8.2 API Key dan Setup UI

Karena NanoCLI memakai OpenRouter API, onboarding tidak cukup hanya lewat environment variable. NanoCLI harus memiliki terminal setup UI agar pengguna baru tidak perlu menghafal command konfigurasi.

Command utama:

```bash
nanocli setup
nanocli auth login
nanocli auth status
nanocli auth reset
```

Jika pengguna menjalankan `nanocli` pertama kali dan API key belum tersedia, NanoCLI tidak langsung membuka chat. NanoCLI membuka setup UI terlebih dahulu.

Contoh tampilan:

```text
┌──────────────────────────────────────────────┐
│ NanoCLI Setup                                │
├──────────────────────────────────────────────┤
│ OpenRouter API key belum ditemukan.          │
│                                              │
│ Pilih metode konfigurasi:                    │
│  > Masukkan API key sekarang                 │
│    Gunakan environment variable              │
│    Buka panduan setup manual                 │
│    Lewati untuk mode local memory only       │
└──────────────────────────────────────────────┘
```

Jika pengguna memilih memasukkan API key, input harus disamarkan.

```text
OpenRouter API Key:
sk-or-v1-********************************
```

Setelah API key dimasukkan, NanoCLI melakukan validasi koneksi ringan. Validasi cukup memakai request yang murah, misalnya mengambil daftar model atau metadata akun jika tersedia. NanoCLI tidak boleh mengirim kode proyek saat validasi API key.

Aturan penyimpanan API key:

1. Prioritas pertama: baca dari `OPENROUTER_API_KEY`.
2. Prioritas kedua: simpan melalui OS secret manager jika tersedia.
3. Prioritas ketiga: runtime-only key untuk sesi berjalan.
4. NanoCLI tidak menyimpan API key mentah di `.nanocli/config.json`.
5. Jika OS secret manager tidak tersedia, NanoCLI menyarankan environment variable.
6. Jika pengguna tetap meminta penyimpanan lokal, NanoCLI harus memberi peringatan eksplisit dan menyimpan dalam format yang tidak ditulis ke repository.

Config hanya menyimpan sumber kredensial.

```json
{
  "provider": "openrouter",
  "apiKeySource": "env",
  "apiKeyEnv": "OPENROUTER_API_KEY"
}
```

Untuk secret manager:

```json
{
  "provider": "openrouter",
  "apiKeySource": "secret-manager",
  "secretService": "nanocli",
  "secretAccount": "openrouter"
}
```

Acceptance criteria:

1. Jika API key belum ada, `nanocli` membuka setup UI.
2. Input API key disamarkan.
3. API key divalidasi sebelum disimpan.
4. API key tidak dicetak ke terminal.
5. API key tidak masuk session log.
6. API key tidak masuk Project Memory.
7. API key tidak tersimpan mentah di `.nanocli/config.json`.
8. `nanocli auth status` hanya menampilkan status, bukan isi key.
9. `nanocli auth reset` menghapus kredensial tersimpan.
10. Pengguna tetap bisa memakai `OPENROUTER_API_KEY` tanpa setup UI.

### 8.3 Model List dan Model Picker UI

Pemilihan model juga perlu dibuat dalam bentuk UI karena model ID OpenRouter panjang dan sulit diingat. Pengguna tetap bisa memilih model lewat command, tetapi workflow utama harus menyediakan model picker.

Command:

```bash
nanocli models list
nanocli models search "code"
nanocli models ui
nanocli models pick
nanocli models set fast <model-id>
nanocli models set normal <model-id>
nanocli models set high <model-id>
nanocli models set extra-high <model-id>
```

Model picker juga bisa dibuka dari chat:

```text
/model
/models
/models refresh
```

Jika pengguna mengetik `/model` tanpa argumen, NanoCLI membuka model picker.

Contoh tampilan:

```text
┌──────────────────────────────────────────────┐
│ Select Model for Normal Mode                 │
├──────────────────────────────────────────────┤
│ Search: code                                 │
│ Filter: Coding, low cost, context >= 32K     │
│                                              │
│  > openrouter/auto                           │
│    anthropic/claude-sonnet-4.5               │
│    google/gemini-2.5-pro                     │
│    openai/gpt-5.5                            │
│                                              │
│ Enter: select    /: search    f: filter      │
│ i: details       Esc: cancel                 │
└──────────────────────────────────────────────┘
```

Detail model:

```text
Model detail
ID: anthropic/claude-sonnet-4.5
Use case: high-quality coding and reasoning
Context: shown if available from model metadata
Pricing: shown if available from model metadata
Recommended mode: high
```

Alur setup model pertama kali:

1. NanoCLI mengambil daftar model dari OpenRouter.
2. NanoCLI menampilkan mode yang perlu diisi: `fast`, `normal`, `high`, `extra-high`.
3. Untuk setiap mode, pengguna bisa memilih model dari model picker.
4. NanoCLI memberi rekomendasi default berdasarkan tag, harga, context length, dan capability jika metadata tersedia.
5. NanoCLI menyimpan hasil pilihan ke config lokal.
6. NanoCLI tetap mengizinkan pengguna mengganti model kapan saja.

Contoh config:

```json
{
  "models": {
    "fast": {
      "id": "openrouter/free",
      "fallback": ["openrouter/auto"]
    },
    "normal": {
      "id": "openrouter/auto",
      "fallback": ["openrouter/free"]
    },
    "high": {
      "id": "anthropic/claude-sonnet-4.5",
      "fallback": ["openrouter/auto"]
    },
    "extraHigh": {
      "id": "openai/gpt-5.5",
      "fallback": ["anthropic/claude-opus-4.5"]
    }
  }
}
```

Filter model yang harus tersedia:

1. Provider.
2. Harga input token.
3. Harga output token.
4. Context length.
5. Capability coding.
6. Capability reasoning.
7. Capability tool calling jika tersedia.
8. Free atau paid.
9. Favorite.
10. Last used.

Acceptance criteria:

1. Command mengambil daftar model dari OpenRouter.
2. Command menyimpan cache model list lokal.
3. Cache memiliki TTL, misalnya 24 jam.
4. Pengguna dapat refresh model list dengan `--refresh`.
5. Output menampilkan model ID, provider, context length, pricing jika tersedia, dan capability jika tersedia.
6. Model picker bisa mencari model berdasarkan keyword.
7. Model picker bisa menyimpan model ke profile `fast`, `normal`, `high`, dan `extra-high`.
8. Model picker bisa dibuka dari setup UI dan dari chat.
9. Jika model yang tersimpan sudah tidak tersedia, NanoCLI menawarkan pengganti.
10. Jika pengguna memilih model mahal untuk mode `fast`, NanoCLI memberi peringatan biaya.

### 8.4 First-Run Onboarding Flow

First-run onboarding adalah alur saat pengguna mengetik `nanocli` untuk pertama kali.

```text
Run nanocli
    |
    v
Check .nanocli config
    |
    v
Check API key source
    |
    |-- not found --> open API key setup UI
    |
    v
Validate OpenRouter connection
    |
    v
Fetch or load cached model list
    |
    v
Open model picker for profile setup
    |
    v
Ask whether to initialize Project Memory
    |
    v
Open default chat
```

Contoh ringkas:

```text
NanoCLI Setup complete.

API Key: active via secret-manager
Fast model: openrouter/free
Normal model: openrouter/auto
High model: anthropic/claude-sonnet-4.5
Extra-high model: openai/gpt-5.5
Project Memory: initialized
Token Guard: active

Starting chat...
```

Acceptance criteria:

1. Pengguna baru bisa menyelesaikan setup tanpa membaca dokumentasi panjang.
2. Setup tidak membutuhkan copy-paste command environment variable.
3. Pengguna tetap bisa memilih manual setup jika ingin.
4. Setup UI tidak mengirim file proyek ke OpenRouter.
5. Setelah setup selesai, `nanocli` langsung masuk chat.

---

## 9. Chat Default Behavior

### 9.1 Default Command

Jika pengguna mengetik:

```bash
nanocli
```

maka NanoCLI langsung membuka chat interaktif.

Perilaku ini setara dengan:

```bash
nanocli chat --mode normal
```

Alasan:

1. Chat adalah workflow utama pengguna.
2. Pengguna tidak perlu menghafal command awal.
3. CLI terasa lebih natural.
4. `ask`, `review`, `debug`, `test`, `plan`, dan `patch` tetap tersedia sebagai command eksplisit.

### 9.2 Welcome Screen

Saat chat terbuka, NanoCLI menampilkan informasi singkat:

```text
NanoCLI Chat
Mode: normal
Model: <configured normal model>
Project Memory: active
Token Guard: active
Type /help for commands, /exit to quit.
```

Jika `.nanocli/` belum ada:

```text
Project Memory not initialized.
Run /init to create project memory, or continue without memory.
```

### 9.3 Command di Dalam Chat

NanoCLI mendukung command internal:

```text
/help
/exit
/clear
/mode fast
/mode normal
/mode high
/mode extra-high
/model <model-id>
/model
/models
/models search <keyword>
/models refresh
/auth status
/setup
/memory show
/memory update
/memory search <query>
/context show
/context dry-run
/token budget
/token stats
/cost estimate
/compact
```

---

## 10. Mode Chat: Fast, Normal, High, Extra-High

### 10.1 Tujuan Mode

Mode chat digunakan untuk mengatur kualitas, biaya, batas konteks, dan batas output.

Mode tidak hanya memilih model. Mode juga mengatur strategi prompt, jumlah memory chunk, batas file context, dan batas output token.

### 10.2 Mode Fast

Mode `fast` digunakan untuk pertanyaan pendek, bantuan sintaks, ringkasan kecil, dan tugas ringan.

Karakteristik:

1. Model murah atau cepat.
2. Context kecil.
3. Memory chunk minimal.
4. Output pendek.
5. Reasoning dimatikan atau minimal jika model mendukung parameter tersebut.
6. Cocok untuk pertanyaan harian.

Konfigurasi target:

```yaml
fast:
  input_token_budget: 4000
  output_token_budget: 700
  memory_chunks: 2
  file_chunk_chars: 2500
  context_compaction: aggressive
  default_temperature: 0.2
  show_cost_warning: false
```

Contoh:

```bash
nanocli --mode fast
nanocli chat --mode fast
```

### 10.3 Mode Normal

Mode `normal` adalah mode default.

Karakteristik:

1. Seimbang antara kualitas dan biaya.
2. Cocok untuk chat harian, review kecil, debug ringan, dan unit test sederhana.
3. Menggunakan Project Memory secara selektif.
4. Output cukup lengkap tetapi tetap dibatasi.

Konfigurasi target:

```yaml
normal:
  input_token_budget: 8000
  output_token_budget: 1200
  memory_chunks: 4
  file_chunk_chars: 5000
  context_compaction: balanced
  default_temperature: 0.2
  show_cost_warning: false
```

### 10.4 Mode High

Mode `high` digunakan untuk analisis yang lebih sulit.

Karakteristik:

1. Model lebih kuat.
2. Context lebih besar.
3. Retrieval memory lebih luas.
4. Output lebih detail.
5. Cocok untuk review multi-file, debug kompleks, dan plan fitur.

Konfigurasi target:

```yaml
high:
  input_token_budget: 16000
  output_token_budget: 2200
  memory_chunks: 6
  file_chunk_chars: 8000
  context_compaction: balanced
  default_temperature: 0.15
  show_cost_warning: true
```

### 10.5 Mode Extra-High

Mode `extra-high` digunakan untuk tugas berat yang membutuhkan kualitas maksimal.

Karakteristik:

1. Model paling kuat atau paling mahal.
2. Context besar.
3. Output lebih panjang.
4. Selalu menampilkan estimasi biaya sebelum request jika biaya tinggi.
5. Cocok untuk review arsitektur, refactor besar, audit keamanan, dan analisis multi-file.

Konfigurasi target:

```yaml
extra_high:
  input_token_budget: 32000
  output_token_budget: 4000
  memory_chunks: 10
  file_chunk_chars: 12000
  context_compaction: conservative
  default_temperature: 0.1
  show_cost_warning: true
  require_confirm_above_estimated_cost_usd: 0.05
```

---

## 11. Model Selection Strategy

### 11.1 Model Profile

NanoCLI tidak menetapkan satu model permanen. NanoCLI memakai profil model.

```yaml
models:
  fast:
    id: openrouter/free
    fallback:
      - openrouter/auto
  normal:
    id: openrouter/auto
    fallback:
      - openrouter/free
  high:
    id: openrouter/auto
    fallback:
      - google/gemini-2.5-pro
      - anthropic/claude-sonnet-4.5
  extra_high:
    id: openrouter/auto
    fallback:
      - anthropic/claude-opus-4.5
      - openai/gpt-5.5
```

Catatan:

1. Nilai di atas adalah contoh awal.
2. Pengguna wajib bisa mengganti semua model.
3. NanoCLI harus memvalidasi model terhadap daftar OpenRouter terbaru.
4. Jika model tidak tersedia, NanoCLI menawarkan model alternatif.
5. Mode `openrouter/free` cocok untuk eksperimen, tetapi tidak boleh dijadikan default profesional jika stabilitas penting.
6. Mode `openrouter/auto` dapat digunakan sebagai default awal karena dapat memilih model berdasarkan prompt.

### 11.2 Pemilihan Model Manual

Pengguna dapat memilih model langsung:

```bash
nanocli chat --model <model-id>
nanocli ask "buat test" --model <model-id>
nanocli review src/main.ts --model <model-id>
```

Jika `--model` diberikan, model tersebut mengalahkan konfigurasi mode.

### 11.3 Fallback Model

NanoCLI mendukung fallback model.

Contoh:

```yaml
fallback:
  enabled: true
  max_attempts: 2
  retry_on:
    - rate_limit
    - provider_error
    - timeout
```

Acceptance criteria:

1. Jika model utama gagal, NanoCLI mencoba fallback.
2. NanoCLI memberi tahu model mana yang akhirnya dipakai.
3. Jika semua gagal, NanoCLI menampilkan error ringkas.
4. NanoCLI tidak mengulang request berbiaya tinggi tanpa batas.

---

## 12. Token Reduction Engine

### 12.1 Tujuan

Token Reduction Engine adalah fitur inti untuk menekan penggunaan token API.

Target produk:

```text
Mengurangi penggunaan token sampai 70% dibanding baseline tanpa optimasi.
```

Baseline:

1. Seluruh isi file dimasukkan ke prompt.
2. Seluruh memory dimasukkan ke prompt.
3. Changelog lama ikut dimasukkan.
4. Prompt system terlalu panjang.
5. Tidak ada deduplikasi.
6. Tidak ada cache.
7. Tidak ada retrieval top-k.
8. Tidak ada batas output.

Target 70% realistis untuk banyak skenario, tetapi bukan jaminan universal. Pada file kecil dan pertanyaan sederhana, ruang penghematan lebih rendah. Pada proyek besar, ruang penghematan lebih tinggi.

### 12.2 Strategi Penghematan

NanoCLI memakai delapan strategi.

1. **Retrieval top-k**  
   Ambil hanya memory paling relevan.

2. **Prompt compaction**  
   Ringkas konteks sebelum dikirim.

3. **File focus extraction**  
   Ambil fungsi, class, import, dan potongan error yang relevan.

4. **Deduplication**  
   Hapus konteks yang muncul berulang.

5. **Session summarization**  
   Ringkas chat lama menjadi working summary.

6. **Hierarchical memory**  
   Gunakan project summary lebih dulu, lalu file summary, lalu snippet jika perlu.

7. **Output budget**  
   Batasi panjang jawaban sesuai mode.

8. **Cache-aware prompt layout**  
   Susun system prompt dan project instruction yang stabil di awal agar cocok dengan prompt caching provider.

### 12.3 Formula Pengukuran

NanoCLI mencatat token baseline dan token aktual.

```text
token_saving_percentage =
((baseline_tokens - actual_tokens) / baseline_tokens) * 100
```

Contoh:

```text
Baseline: 20.000 token
Actual: 6.000 token
Saving: 70%
```

### 12.4 Level Optimasi

```yaml
token_reduction:
  enabled: true
  target_saving_percentage: 70
  strategy: balanced
  show_stats: true
  baseline_estimation: true
  deduplicate_context: true
  summarize_session: true
  cache_aware_prompt: true
```

Mode strategi:

1. `light`: hemat ringan, kualitas tetap lebih lengkap.
2. `balanced`: default, seimbang.
3. `aggressive`: hemat tinggi, konteks dipotong lebih ketat.
4. `manual`: pengguna memilih konteks sendiri.

### 12.5 Token Budget per Command

| Command | Fast | Normal | High | Extra-High |
|---|---:|---:|---:|---:|
| chat | 4K input | 8K input | 16K input | 32K input |
| ask | 3K input | 6K input | 12K input | 24K input |
| review | 5K input | 10K input | 20K input | 40K input |
| debug | 5K input | 10K input | 20K input | 40K input |
| test | 5K input | 10K input | 20K input | 32K input |
| plan | 4K input | 8K input | 16K input | 32K input |
| patch | 5K input | 10K input | 20K input | 32K input |

### 12.6 Cost Guard

NanoCLI menampilkan estimasi biaya sebelum request tertentu.

Cost guard aktif jika:

1. Mode `high` atau `extra-high`.
2. Estimasi input token melebihi budget.
3. Model memiliki harga tinggi.
4. File context terlalu besar.
5. Pengguna meminta multi-file review.
6. Pengguna memakai `--no-compact`.

Contoh output:

```text
Estimated request:
Mode: high
Model: <model-id>
Input tokens: ~14,200
Output limit: 2,200
Estimated cost: $0.03
Continue? [y/N]
```

### 12.7 Dry Run Context

Command:

```bash
nanocli ask "kenapa login gagal?" --project --dry-run-context
nanocli chat --context-preview
```

Output:

```text
Context preview:
- System prompt: 420 tokens
- AGENTS.md: 580 tokens
- Project summary: 720 tokens
- Memory chunks: 1,900 tokens
- Target file snippet: 2,300 tokens
- User request: 120 tokens
Total estimated input: 6,040 tokens
Estimated baseline without compaction: 18,800 tokens
Estimated saving: 67.8%
```

---

## 13. Project Memory

Project Memory tetap menjadi fitur utama. Bedanya, pada versi OpenRouter, Project Memory juga berfungsi untuk mengurangi biaya API.

Project Memory terdiri dari:

1. Ringkasan proyek.
2. Struktur folder penting.
3. Ringkasan file kode.
4. Riwayat keputusan teknis.
5. Riwayat perubahan terakhir.
6. Catatan bug dan solusi.
7. Preferensi style coding.
8. Daftar dependency dan framework.
9. Ringkasan TODO.
10. Indeks pencarian lokal.
11. Statistik token.
12. Ringkasan sesi chat.

### 13.1 Fungsi Project Memory

Project Memory membuat NanoCLI dapat:

1. Mengingat struktur proyek.
2. Menjawab sesuai keputusan teknis sebelumnya.
3. Mengurangi kebutuhan mengirim seluruh file.
4. Menghubungkan error dengan bug lama.
5. Memberi saran refactor yang sesuai style proyek.
6. Menampilkan konteks yang dikirim ke model.
7. Menghitung token saving.

### 13.2 Batasan Project Memory

Project Memory tidak membuat model:

1. Belajar permanen seperti fine-tuning.
2. Selalu benar tanpa validasi.
3. Bisa melihat file yang tidak diberikan.
4. Aman menjalankan command berisiko tanpa kontrol pengguna.
5. Otomatis tahu konteks terbaru jika `memory update` tidak dijalankan.

---

## 14. Struktur Folder Project Memory

Saat pengguna menjalankan `nanocli init`, aplikasi membuat folder berikut.

```text
.nanocli/
  config.json
  PROJECT_CONTEXT.md
  AGENTS.md
  memory/
    decisions.md
    changelog.md
    bugs.md
    todos.md
    coding_style.md
    dependencies.md
    token_stats.json
  index/
    memory.sqlite
    file_index.json
    embeddings.sqlite
  summaries/
    files/
      src_main_ts.md
      src_app_ts.md
  sessions/
    2026-05-16_101500.md
  cache/
    model_list.json
    last_context.json
    prompt_cache_keys.json
  benchmarks/
    2026-05-16_model_benchmark.json
```

### 14.1 PROJECT_CONTEXT.md

```markdown
# Project Context

## Project Name

## Project Goal

## Tech Stack

## Main Architecture

## Important Commands

## Current Development Focus

## Known Issues

## Coding Rules

## Last Stable State
```

### 14.2 AGENTS.md

NanoCLI membaca `AGENTS.md` sebagai instruksi AI project-level.

```markdown
# AGENTS.md

## Project Overview

## Setup Commands

## Test Commands

## Code Style

## Safety Rules

## File Access Rules

## Response Style
```

### 14.3 token_stats.json

File ini menyimpan statistik penggunaan token.

```json
{
  "total_requests": 0,
  "total_input_tokens": 0,
  "total_output_tokens": 0,
  "estimated_baseline_tokens": 0,
  "estimated_saved_tokens": 0,
  "average_saving_percentage": 0
}
```

---

## 15. Arsitektur Produk

```text
User Terminal
    |
    v
NanoCLI CLI Layer TypeScript
    |
    |-- default chat
    |-- ask
    |-- chat
    |-- review
    |-- debug
    |-- test
    |-- plan
    |-- patch
    |-- memory
    |-- config
    |-- models
    |
    v
Command Controller
    |
    |-- Prompt Builder
    |-- Token Budget Manager
    |-- File Reader
    |-- Project Memory Retriever
    |-- Context Compactor
    |-- Cost Estimator
    |-- Safety Filter
    |-- Output Renderer
    |
    v
LLM Service Layer
    |
    |-- OpenRouter Client
    |-- Streaming Handler
    |-- Model Selector
    |-- Fallback Handler
    |-- Retry Handler
    |
    v
OpenRouter API
    |
    v
Selected Model Provider
```

---

## 16. Modul Teknis

### 16.1 CLI Layer

File:

```text
src/cli.ts
```

Tanggung jawab:

1. Mendefinisikan command.
2. Membaca argumen CLI.
3. Menjalankan default chat jika tidak ada command.
4. Mengirim request ke controller.
5. Menampilkan output.

### 16.2 OpenRouter Client

File:

```text
src/llm/openrouterClient.ts
```

Tanggung jawab:

1. Menghubungkan aplikasi ke OpenRouter API.
2. Mengirim chat completion request.
3. Mengaktifkan streaming.
4. Mengatur model.
5. Menangani error koneksi, rate limit, provider error, dan timeout.
6. Mengambil usage token dari response jika tersedia.

### 16.3 Model Selector

File:

```text
src/llm/modelSelector.ts
```

Tanggung jawab:

1. Memilih model berdasarkan mode.
2. Memvalidasi model dari model list cache.
3. Menangani fallback.
4. Menyimpan preferensi model.
5. Memberi warning jika model mahal atau context terlalu besar.

### 16.4 Prompt Builder

File:

```text
src/prompts/promptBuilder.ts
```

Tanggung jawab:

1. Membuat prompt untuk setiap command.
2. Menggabungkan system prompt, AGENTS.md, user prompt, file context, dan memory context.
3. Menjaga urutan cache-aware.
4. Membatasi panjang context.
5. Menyisipkan completion marker jika continuation aktif.

### 16.5 Token Budget Manager

File:

```text
src/tokens/tokenBudgetManager.ts
```

Tanggung jawab:

1. Mengestimasi token input.
2. Mengestimasi token output.
3. Membandingkan baseline dengan actual prompt.
4. Menampilkan token saving.
5. Mencegah request melebihi budget mode.

### 16.6 Context Compactor

File:

```text
src/context/contextCompactor.ts
```

Tanggung jawab:

1. Meringkas konteks panjang.
2. Memilih chunk relevan.
3. Menghapus duplikasi.
4. Menjaga user request dan error message tetap utuh.
5. Menghasilkan context summary.

### 16.7 File Handler

File:

```text
src/files/fileReader.ts
```

Tanggung jawab:

1. Membaca file.
2. Mengecek ukuran file.
3. Mengabaikan file sensitif.
4. Memotong file terlalu panjang.
5. Membuat chunk file.
6. Mengambil focused snippet berdasarkan symbol, import, error line, atau query.

### 16.8 Memory Manager

File:

```text
src/memory/memoryManager.ts
```

Tanggung jawab:

1. Membuat folder `.nanocli`.
2. Membaca Project Memory.
3. Menulis riwayat sesi.
4. Memperbarui ringkasan proyek.
5. Melakukan pencarian konteks relevan.
6. Menyimpan token stats.

### 16.9 Indexer

File:

```text
src/memory/indexer.ts
```

Tanggung jawab:

1. Melakukan scan folder proyek.
2. Mengabaikan folder tidak perlu.
3. Membuat ringkasan file.
4. Menyimpan index ke SQLite.
5. Mendukung SQLite FTS5.
6. Menyiapkan embedding jika mode embedding diaktifkan.

### 16.10 Output Renderer

File:

```text
src/ui/render.ts
```

Tanggung jawab:

1. Menampilkan output Markdown.
2. Menampilkan syntax-highlighted code.
3. Menampilkan tabel.
4. Menampilkan status proses.
5. Menampilkan token stats dan cost estimate.

---

## 17. Fitur Produk

### 17.1 Project Initialization

Command:

```bash
nanocli init
```

Deskripsi:

Membuat konfigurasi awal NanoCLI di root proyek.

Acceptance criteria:

1. Command membuat folder `.nanocli`.
2. Command membuat `config.json`.
3. Command membuat `PROJECT_CONTEXT.md`.
4. Command membuat `AGENTS.md`.
5. Command membuat file memory dasar.
6. Command tidak menimpa file lama tanpa konfirmasi.
7. Command meminta pengguna mengatur model profile atau memakai default awal.
8. Command tidak meminta API key ditulis ke file config.

---

### 17.2 Default Chat

Command:

```bash
nanocli
```

Deskripsi:

Membuka chat interaktif dengan mode `normal`.

Acceptance criteria:

1. Command tanpa argumen langsung masuk chat.
2. Mode default adalah `normal`.
3. Chat menampilkan model aktif.
4. Chat menampilkan status Project Memory.
5. Chat mendukung `/mode`, `/model`, `/memory`, `/context`, `/token`, dan `/exit`.
6. Chat menyimpan session log lokal jika fitur aktif.

---

### 17.3 Ask Command

Command:

```bash
nanocli ask "buat fungsi validasi email di TypeScript"
```

Deskripsi:

Menjawab prompt tunggal tanpa membuka chat.

Opsi:

```bash
nanocli ask "jelaskan fungsi ini" --model <model-id>
nanocli ask "buat regex password" --mode fast
nanocli ask "kenapa login gagal?" --project
nanocli ask "kenapa login gagal?" --project --dry-run-context
```

Acceptance criteria:

1. Command menerima prompt string.
2. Command mengirim prompt ke OpenRouter.
3. Output tampil streaming jika model dan API mendukung.
4. Pengguna bisa memilih model dengan `--model`.
5. Pengguna bisa memilih mode dengan `--mode`.
6. Jika API key belum tersedia, sistem memberi pesan error jelas.
7. Jika model tidak valid, sistem memberi saran model alternatif.

---

### 17.4 Review File

Command:

```bash
nanocli review src/app.ts
```

Deskripsi:

Membaca file dan memberi review kode.

Opsi:

```bash
nanocli review src/app.ts --mode high
nanocli review src/app.ts --model <model-id>
nanocli review src/app.ts --focus security
nanocli review src/app.ts --dry-run-context
```

Format output:

```markdown
## Ringkasan

## Masalah Penting

## Bug Potensial

## Saran Refactor

## Saran Keamanan

## Saran Test

## Estimasi Token
```

Acceptance criteria:

1. Command membaca file.
2. Command menolak file sensitif.
3. Command memakai focused snippet jika file besar.
4. Output berisi masalah, dampak, dan saran perbaikan.
5. Output tidak mengubah file secara otomatis.
6. Command menampilkan estimasi token jika `token_stats` aktif.

---

### 17.5 Debug File

Command:

```bash
nanocli debug src/app.ts "TypeError: Cannot read properties of undefined"
```

Deskripsi:

Menganalisis file dan pesan error.

Acceptance criteria:

1. Command menerima file path.
2. Command menerima pesan error.
3. Error message tidak boleh dipotong.
4. Output berisi kemungkinan penyebab, bukti kode, dan solusi.
5. Jika Project Memory aktif, sistem mengambil bug serupa dari memory.
6. Command menyimpan error dan solusi ke `bugs.md` setelah pengguna menyetujui.

---

### 17.6 Generate Unit Test

Command:

```bash
nanocli test src/calculator.ts
```

Deskripsi:

Membuat unit test berdasarkan file target.

Opsi:

```bash
nanocli test src/calculator.ts --framework vitest
nanocli test src/calculator.ts --framework jest
nanocli test src/calculator.ts --write
```

Acceptance criteria:

1. Command membaca file target.
2. Command mendeteksi bahasa dari ekstensi.
3. Output berupa kode test.
4. Command memberi nama file test yang disarankan.
5. Command tidak menulis file tanpa opsi `--write`.
6. Jika `--write` aktif, NanoCLI tetap meminta konfirmasi.

---

### 17.7 Dev Plan

Command:

```bash
nanocli plan "tambahkan fitur login JWT"
```

Deskripsi:

Membuat rencana implementasi fitur berdasarkan konteks proyek.

Acceptance criteria:

1. Output berisi ringkasan kebutuhan.
2. Output berisi file yang mungkin terdampak.
3. Output berisi langkah implementasi.
4. Output berisi risiko.
5. Output berisi test yang perlu dibuat.
6. Output dapat disimpan ke memory.

---

### 17.8 Patch Suggestion

Command:

```bash
nanocli patch src/auth.ts "perbaiki validasi token"
```

Deskripsi:

Memberi saran patch, tetapi tidak langsung menulis file.

Acceptance criteria:

1. Output berupa unified diff.
2. Pengguna dapat memilih apply atau cancel.
3. Default tidak menulis file.
4. Patch disimpan ke session log.
5. Jika diterapkan, changelog diperbarui.
6. Auto continuation dimatikan saat sedang menghasilkan diff panjang.

---

### 17.9 Memory Update

Command:

```bash
nanocli memory update
```

Deskripsi:

Memperbarui ringkasan proyek, ringkasan file, changelog, dan index.

Acceptance criteria:

1. Command membaca struktur proyek.
2. Command mengabaikan folder besar.
3. Command memperbarui ringkasan file yang berubah.
4. Command menyimpan session summary.
5. Command memperbarui SQLite index.
6. Command tidak menyimpan isi file sensitif.
7. Command dapat berjalan tanpa memanggil OpenRouter jika ringkasan lokal cukup.
8. Jika membutuhkan summarization via API, command menampilkan estimasi biaya.

---

### 17.10 Memory Search

Command:

```bash
nanocli memory search "auth login bug"
```

Deskripsi:

Mencari konteks proyek yang relevan dari memory lokal.

Acceptance criteria:

1. Command mencari dari Markdown memory.
2. Command mencari dari SQLite FTS5.
3. Output menampilkan file, ringkasan, dan skor relevansi.
4. Output tidak menampilkan file sensitif.
5. Command tidak membutuhkan panggilan API secara default.

---

### 17.11 Model Management

Command:

```bash
nanocli models list
nanocli models search "typescript code"
nanocli models set fast <model-id>
nanocli models set normal <model-id>
nanocli models set high <model-id>
nanocli models set extra-high <model-id>
nanocli models benchmark
```

Acceptance criteria:

1. Model list dapat diambil dari OpenRouter.
2. Model list dapat dicache lokal.
3. Pengguna dapat memilih model per mode.
4. Benchmark mencatat latensi, output quality note, dan estimasi biaya.
5. Benchmark tidak mengirim file proyek sensitif.

---

## 18. Konfigurasi Default

File:

```text
.nanocli/config.json
```

Isi default:

```json
{
  "provider": {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "stream": true,
    "timeoutMs": 120000
  },
  "models": {
    "fast": {
      "id": "openrouter/free",
      "fallback": ["openrouter/auto"]
    },
    "normal": {
      "id": "openrouter/auto",
      "fallback": ["openrouter/free"]
    },
    "high": {
      "id": "openrouter/auto",
      "fallback": []
    },
    "extraHigh": {
      "id": "openrouter/auto",
      "fallback": []
    }
  },
  "chat": {
    "defaultMode": "normal",
    "openChatWhenNoArgs": true,
    "saveSessions": true
  },
  "generation": {
    "temperature": 0.2,
    "topP": 0.9,
    "maxOutputTokens": {
      "fast": 700,
      "normal": 1200,
      "high": 2200,
      "extraHigh": 4000
    }
  },
  "tokenBudget": {
    "enabled": true,
    "showStats": true,
    "targetSavingPercentage": 70,
    "inputTokenBudget": {
      "fast": 4000,
      "normal": 8000,
      "high": 16000,
      "extraHigh": 32000
    }
  },
  "contextCompaction": {
    "enabled": true,
    "warnBeforeTruncate": true,
    "neverTruncateUserRequest": true,
    "neverTruncateErrorMessage": true,
    "maxProjectMemoryChunks": {
      "fast": 2,
      "normal": 4,
      "high": 6,
      "extraHigh": 10
    },
    "summarizeOldMemory": true,
    "showCompactionSummary": true,
    "deduplicateContext": true
  },
  "costGuard": {
    "enabled": true,
    "showBeforeHighMode": true,
    "requireConfirmAboveEstimatedCostUsd": 0.05
  },
  "safety": {
    "blockSensitiveFiles": true,
    "requireConfirmBeforeWrite": true,
    "allowShellExecution": false,
    "blockAutoApplyForPatch": true,
    "dryRunContextAvailable": true
  },
  "memory": {
    "enabled": true,
    "autoUpdateAfterPatch": true,
    "saveSessions": true,
    "searchEngine": "sqlite-fts5",
    "embeddingEnabled": false
  }
}
```

---

## 19. Ignore Pattern Default

```json
{
  "ignore": [
    ".git/",
    "node_modules/",
    ".next/",
    ".nuxt/",
    ".svelte-kit/",
    ".turbo/",
    ".vercel/",
    ".output/",
    "coverage/",
    "dist/",
    "build/",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.crt",
    "*.p12",
    "*.sqlite",
    "*.db",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
  ]
}
```

Catatan:

1. Lockfile diabaikan untuk prompt default agar token hemat.
2. Pengguna dapat mengizinkan lockfile dengan opsi khusus jika memang dibutuhkan.
3. `.env` dan secret file tetap diblokir.

---

## 20. Strategi Retrieval

Saat pengguna menjalankan command dengan Project Memory, NanoCLI mengambil konteks berikut.

1. User request.
2. Command-specific prompt.
3. AGENTS.md.
4. Project context utama.
5. Coding style.
6. Keputusan teknis relevan.
7. Ringkasan file target.
8. Potongan memory paling relevan.
9. Bug serupa jika command debug.
10. Changelog terbaru.

Batas default:

```json
{
  "context": {
    "normalMaxInputTokens": 8000,
    "highMaxInputTokens": 16000,
    "extraHighMaxInputTokens": 32000,
    "memoryChunks": 4,
    "fileChunkChars": 5000,
    "enableContextCompaction": true
  }
}
```

Prioritas konteks:

1. Jangan potong user request.
2. Jangan potong error message.
3. Pertahankan file target.
4. Pertahankan AGENTS.md jika relevan.
5. Ambil memory top-k.
6. Ringkas changelog lama.
7. Buang session lama yang tidak relevan.
8. Buang konteks duplikat.

---

## 21. Prompt Design

NanoCLI memakai lapisan prompt berikut.

```text
[STABLE SYSTEM PROMPT]
[PROJECT INSTRUCTIONS]
[COMMAND MODE]
[RELEVANT PROJECT MEMORY]
[FILE CONTEXT]
[USER REQUEST]
[OUTPUT RULES]
```

Susunan ini membantu prompt caching karena bagian awal dibuat stabil jika memungkinkan.

### 21.1 Core System Prompt

```text
You are NanoCLI, an AI coding assistant running inside a terminal.
You help the user understand, review, debug, test, and modify code.
Be practical, precise, concise, and safe.

Rules:
- Work only from the provided prompt, project memory, and visible files.
- Do not invent files, APIs, dependencies, or project structure.
- Prefer small, maintainable changes.
- Do not expose secrets.
- Never modify files unless write or apply mode is enabled.
- When unsure, state uncertainty and suggest a verification step.
```

### 21.2 Ask Mode

```text
Mode: ASK
Goal: Answer the user's coding question directly.
Rules:
- Be concise.
- Include code only when useful.
- Use project memory if the question is project-related.
- Do not modify files.
```

### 21.3 Chat Mode

```text
Mode: CHAT
Goal: Act as a coding pair-programmer in an interactive terminal session.
Rules:
- Keep useful context from the current session.
- Use project memory when available.
- Ask short follow-up questions only when required.
- Keep output within the current mode budget.
```

### 21.4 Review Mode

```text
Mode: REVIEW
Goal: Review code for correctness, maintainability, security, performance, and project consistency.
Rules:
- Focus on real issues.
- Give file location when possible.
- Explain impact briefly.
- Suggest concrete fixes.
- Do not rewrite the whole file unless requested.
```

### 21.5 Debug Mode

```text
Mode: DEBUG
Goal: Find the most likely cause of the error and suggest a safe fix.
Rules:
- Preserve the error message exactly.
- Use file content, changelog, and bug memory.
- Give a minimal fix first.
- Suggest verification commands.
```

### 21.6 Token-Aware Output Rule

```text
Token rule:
Be concise.
Do not repeat context.
Do not restate the full user request.
Do not include unrelated explanations.
Prefer focused code snippets over full files.
```

---

## 22. Continuation Controller

NanoCLI tetap memakai Continuation Controller untuk mencegah output terpotong.

Konfigurasi:

```json
{
  "continuation": {
    "enabled": true,
    "doneMarker": "[[NANOCLI_DONE]]",
    "maxRounds": 2,
    "stopOnRepetition": true,
    "preserveFormat": true,
    "allowForPatch": false,
    "showNotice": true
  }
}
```

Aturan:

1. Auto continue aktif untuk `ask`, `chat`, `review`, `debug`, `test`, dan `plan`.
2. Auto continue dibatasi untuk `patch`.
3. Maksimal 2 round secara default agar biaya API terkendali.
4. Pengguna dapat menaikkan batas dengan `--max-continuation`.
5. NanoCLI menghitung biaya setiap continuation.

---

## 23. Context Compaction

Context Compaction wajib aktif secara default karena NanoCLI memakai API berbayar.

Pipeline:

```text
User request
    |
    v
Load project memory
    |
    v
Load target file
    |
    v
Estimate baseline token
    |
    v
Select relevant chunks
    |
    v
Remove duplication
    |
    v
Summarize old context
    |
    v
Estimate actual token
    |
    v
Send compact prompt
```

Acceptance criteria:

1. NanoCLI dapat menghitung estimasi panjang konteks.
2. NanoCLI tidak memotong user request.
3. NanoCLI tidak memotong error message.
4. NanoCLI memilih memory paling relevan.
5. NanoCLI meringkas memory lama.
6. NanoCLI memberi ringkasan konteks jika opsi aktif.
7. NanoCLI mencatat token saving.

---

## 24. Cost and Usage Analytics

NanoCLI menyediakan statistik:

```bash
nanocli token stats
nanocli token reset
nanocli cost estimate
nanocli cost report
```

Output contoh:

```text
Token Usage Summary

Requests: 42
Input tokens: 120,430
Output tokens: 38,220
Estimated baseline tokens: 354,000
Estimated saved tokens: 195,350
Average saving: 55.2%
Best saving: 73.1%
Most expensive mode: extra-high
```

Acceptance criteria:

1. Statistik tersimpan lokal.
2. Pengguna dapat reset statistik.
3. NanoCLI membedakan token input dan output.
4. NanoCLI membandingkan baseline dan actual.
5. NanoCLI tidak menyimpan isi prompt mentah jika privacy mode aktif.

---

## 25. Keamanan

### 25.1 File Safety

NanoCLI tidak membaca file berikut secara default:

1. `.env`
2. `.env.*`
3. private key
4. certificate
5. database dump
6. credential file
7. token file
8. file dengan nama mengandung `secret`, `credential`, `password`, atau `private`

### 25.2 API Safety

1. API key dibaca dari environment variable.
2. API key tidak dicetak di terminal.
3. API key tidak disimpan di session log.
4. Request log tidak menyimpan prompt mentah jika privacy mode aktif.
5. Pengguna dapat melihat konteks sebelum dikirim dengan `--dry-run-context`.

### 25.3 Patch Safety

1. Patch selalu tampil sebagai diff.
2. Default tidak apply.
3. Apply butuh konfirmasi.
4. Patch untuk file sensitif ditolak.
5. Patch besar harus dipecah.

---

## 26. Kebutuhan Non-Fungsional

### 26.1 Performa

Target performa:

1. `nanocli` membuka chat kurang dari 2 detik sebelum request API.
2. Streaming dimulai segera setelah OpenRouter mengirim chunk pertama.
3. `memory search` lokal selesai kurang dari 2 detik untuk proyek kecil.
4. `memory update` proyek kecil selesai dalam 1 sampai 3 menit.
5. Context compaction selesai kurang dari 5 detik untuk file kecil.
6. Token estimation tidak terasa menghambat UX.

### 26.2 Reliabilitas

1. Jika API key tidak ada, tampilkan instruksi singkat.
2. Jika model tidak tersedia, sarankan `models list`.
3. Jika OpenRouter error, tampilkan status dan fallback.
4. Jika rate limit, tawarkan mode lebih murah atau tunggu.
5. Jika context terlalu besar, jalankan compaction.
6. Jika compaction masih gagal, minta pengguna memilih file target.

### 26.3 Portabilitas

1. Berjalan di Windows.
2. Berjalan di Linux.
3. Berjalan di macOS.
4. Tidak bergantung pada GPU.
5. Tidak membutuhkan Ollama.
6. Membutuhkan Node.js 20+.

---

## 27. Tech Stack Final

| Komponen | Pilihan |
|---|---|
| Bahasa | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Package manager | pnpm |
| CLI framework | Commander atau oclif |
| Terminal prompt | @clack/prompts |
| Terminal setup UI | @clack/prompts |
| Full-screen TUI opsional | Ink |
| Terminal style | chalk |
| Markdown render | marked atau cli-markdown |
| Syntax highlight | shiki atau cli-highlight |
| LLM provider | OpenRouter API |
| HTTP client | native fetch atau undici |
| Config | JSON |
| Schema validation | zod |
| Secret storage opsional | @github/keytar atau adapter OS secret manager |
| Database | SQLite |
| SQLite client | better-sqlite3 |
| ORM opsional | drizzle-orm |
| Text search | SQLite FTS5 |
| Testing | vitest |
| Linting | eslint |
| Formatting | prettier |
| Bundling | tsup |
| Packaging | npm package bin |

---

## 28. Struktur Project NanoCLI

```text
NanoCLI/
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
  LICENSE
  src/
    index.ts
    cli.ts
    commands/
      ask.ts
      chat.ts
      setup.ts
      auth.ts
      review.ts
      debug.ts
      test.ts
      plan.ts
      patch.ts
      memory.ts
      config.ts
      models.ts
      token.ts
    ui/
      setupWizard.ts
      apiKeyPrompt.ts
      modelPicker.ts
      modelFilter.ts
      costWarning.ts
    auth/
      apiKeyManager.ts
      secretManager.ts
      envKeySource.ts
    llm/
      openrouterClient.ts
      modelSelector.ts
      streaming.ts
      fallback.ts
    prompts/
      promptBuilder.ts
      commandPrompts.ts
      systemPrompt.ts
      outputRules.ts
    memory/
      memoryManager.ts
      indexer.ts
      retriever.ts
      sqlite.ts
      summarizer.ts
    context/
      contextBuilder.ts
      contextCompactor.ts
      contextPreview.ts
    tokens/
      tokenEstimator.ts
      tokenBudgetManager.ts
      costEstimator.ts
      tokenStats.ts
    files/
      fileReader.ts
      fileChunker.ts
      sensitiveFileBlocker.ts
      languageDetector.ts
    safety/
      safetyRules.ts
      patchGuard.ts
    ui/
      render.ts
      spinner.ts
      tables.ts
    config/
      configManager.ts
      defaultConfig.ts
      schema.ts
    utils/
      logger.ts
      errors.ts
      path.ts
  tests/
    cli.test.ts
    config.test.ts
    fileReader.test.ts
    memory.test.ts
    tokenBudget.test.ts
    contextCompactor.test.ts
  examples/
    sample-project/
```

---

## 29. Roadmap Pengembangan

### Phase 0: Setup TypeScript Project

Target:

1. Buat struktur folder.
2. Buat `package.json`.
3. Pasang TypeScript, tsup, vitest, eslint, prettier.
4. Buat entry point `nanocli`.

Definition of done:

```bash
nanocli --help
```

berjalan dengan benar.

---

### Phase 1: OpenRouter Core dan Setup UI

Target:

1. Implementasi OpenRouter client.
2. Implementasi streaming output.
3. Implementasi model selector.
4. Error handling API key.
5. Error handling rate limit dan provider error.
6. `models list` dan `models search`.
7. `nanocli setup` untuk onboarding awal.
8. `nanocli auth login` untuk memasukkan API key melalui terminal UI.
9. `nanocli auth status` untuk mengecek status kredensial.
10. `nanocli models ui` untuk memilih model profile.
11. Model picker dari chat melalui `/model`.

Definition of done:

```bash
nanocli setup
nanocli auth status
nanocli models ui
nanocli ask "hello"
nanocli models list
```

berhasil.

---

### Phase 2: Default Chat dan Mode

Target:

1. `nanocli` langsung masuk chat.
2. `/mode fast`
3. `/mode normal`
4. `/mode high`
5. `/mode extra-high`
6. `/model <model-id>`

Definition of done:

Pengguna dapat chat dan mengganti mode langsung dari terminal.

---

### Phase 3: Token Reduction Engine MVP

Target:

1. Token estimation.
2. Token budget per mode.
3. Context preview.
4. Baseline comparison.
5. Token stats.

Definition of done:

```bash
nanocli ask "..." --project --dry-run-context
nanocli token stats
```

menampilkan estimasi token dan penghematan.

---

### Phase 4: File-Based Commands

Target:

1. `review`
2. `debug`
3. `test`
4. File reader
5. Sensitive file blocker
6. Focused snippet extractor

Definition of done:

NanoCLI dapat membaca file, memberi review, membantu debugging, dan membuat test.

---

### Phase 5: Project Memory MVP

Target:

1. `init`
2. `memory update`
3. `PROJECT_CONTEXT.md`
4. `AGENTS.md`
5. `decisions.md`
6. `changelog.md`
7. Session log

Definition of done:

NanoCLI menyimpan ringkasan proyek dan membaca ulang saat project mode digunakan.

---

### Phase 6: Memory Retrieval dan Compaction

Target:

1. SQLite index.
2. SQLite FTS5 search.
3. Retrieval top-k context.
4. Context builder.
5. Context compaction.
6. Token saving measurement.

Definition of done:

NanoCLI mengambil konteks paling relevan dan menampilkan penghematan token.

---

### Phase 7: Plan and Patch

Target:

1. `plan`
2. `patch`
3. Diff preview.
4. Confirmation sebelum apply.
5. Auto changelog setelah patch.

Definition of done:

NanoCLI dapat memberi rencana fitur dan patch aman.

---

### Phase 8: Stabilization

Target:

1. Unit test.
2. Dokumentasi.
3. Benchmark model.
4. Packaging npm.
5. Release v0.1.0.

Definition of done:

Project siap dipakai harian.

---

## 30. MVP Scope

MVP harus berisi fitur berikut.

1. `nanocli` langsung chat.
2. `nanocli init`
3. `nanocli ask`
4. `nanocli chat`
5. `nanocli review`
6. `nanocli debug`
7. `nanocli test`
8. `nanocli memory update`
9. `nanocli memory search`
10. `nanocli config show`
11. `nanocli config set`
12. `nanocli setup`
13. `nanocli auth login`
14. `nanocli auth status`
15. `nanocli models list`
16. `nanocli models search`
17. `nanocli models ui`
18. `nanocli token stats`
19. `--dry-run-context`

Fitur yang bisa ditunda:

1. `patch --apply`
2. Embedding vector search kompleks.
3. Agent auto-run command.
4. Multi-repository workspace.
5. Advanced provider routing rules.
6. Response cache management manual.

---

## 31. Risiko Produk dan Solusi

| Risiko | Dampak | Solusi |
|---|---|---|
| Biaya API membengkak | Pengguna berhenti memakai produk | Token budget, cost guard, compaction |
| Konteks terlalu kecil | Jawaban kurang akurat | Mode high dan extra-high |
| Model murah kurang bagus | Review tidak memadai | Model profile dan fallback |
| Pengguna salah pilih model | Biaya atau kualitas tidak sesuai | Mode preset dan benchmark |
| File sensitif terkirim | Risiko keamanan | Sensitive file blocker dan dry-run context |
| Prompt terlalu panjang | Error atau biaya tinggi | Context compaction |
| Auto continue mahal | Biaya naik | Max continuation rendah |
| Model tidak tersedia | Request gagal | Model list cache dan fallback |
| Memory tidak update | Jawaban tidak sesuai proyek | Reminder memory update |
| Klaim 70% tidak tercapai | Ekspektasi salah | Ukur sebagai KPI, bukan jaminan |

---

## 32. Definisi Sukses

NanoCLI dianggap berhasil jika:

1. Pengguna bisa mengetik `nanocli` dan langsung masuk chat.
2. Pengguna bisa memilih mode `fast`, `normal`, `high`, dan `extra-high`.
3. Pengguna bisa memasukkan API key melalui setup UI yang aman.
4. Pengguna bisa memilih model OpenRouter melalui model picker.
5. Project Memory membuat jawaban lebih sesuai konteks.
5. Token Reduction Engine mengurangi token secara terukur.
6. Rata-rata penghematan token pada proyek menengah mencapai minimal 40%.
7. Penghematan sampai 70% tercapai pada skenario proyek besar dengan prompt baseline panjang.
8. Review, debug, dan test memberi hasil praktis.
9. Tidak ada file sensitif yang terbaca atau terkirim tanpa izin.
10. Pengguna dapat melihat estimasi token dan biaya sebelum request besar.
11. Mode fast terasa cepat dan murah.
12. Mode extra-high memberi kualitas terbaik untuk tugas kompleks.
13. Konfigurasi model mudah diubah tanpa mengubah kode.
14. Produk siap dipakai harian melalui terminal.

---

## 33. Kesimpulan Teknis

Perubahan dari Python dan Ollama ke TypeScript dan OpenRouter adalah keputusan yang masuk akal jika tujuan produk bergeser dari local-only ke fleksibilitas model dan kualitas output. TypeScript cocok untuk CLI modern karena ekosistem Node.js kuat, packaging npm mudah, dan type safety membantu menjaga struktur proyek tetap rapi.

OpenRouter memberi keuntungan besar karena NanoCLI tidak perlu mengelola model lokal, tidak bergantung pada GPU, dan dapat mengakses banyak model melalui satu API. Namun, perubahan ini membawa konsekuensi biaya dan privasi. Karena itu, PRD harus memperkuat Token Reduction Engine, Cost Guard, Context Preview, dan Sensitive File Blocker.

Target penghematan token sampai 70% dapat dijadikan KPI agresif. Target ini paling mungkin tercapai saat NanoCLI membandingkan prompt baseline yang memasukkan seluruh file dengan prompt aktual yang memakai retrieval, focused snippet, summary memory, deduplication, dan output budget. Target ini tidak boleh ditulis sebagai jaminan mutlak untuk semua request.

Dengan desain ini, NanoCLI menjadi AI coding assistant terminal yang fleksibel, hemat token, dan project-aware. Produk tidak lagi bergantung pada kemampuan laptop menjalankan model lokal. Fokus utama berpindah ke pemilihan model, kontrol biaya, pengamanan konteks, dan efisiensi prompt.
