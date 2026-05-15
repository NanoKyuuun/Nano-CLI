# Product Requirements Document
# NanoCLI: Local AI Coding Assistant berbasis CLI dengan Project Memory

**Versi:** PRD Final Detail Qwen3.5 Strategy
**Tanggal:** 15 Mei 2026
**Model utama:** qwen3.5:4b-q4_K_M
**Model deep:** qwen3.5:9b-q4_K_M
**Model memory:** nomic-embed-text

## 1. Ringkasan Produk

NanoCLI adalah aplikasi Command Line Interface berbasis Python untuk membantu pekerjaan coding harian menggunakan model LLM lokal melalui Ollama. Produk ini dirancang untuk laptop dengan spesifikasi menengah, yaitu Intel Core i5-11400H, RAM 16 GB, dan NVIDIA RTX 3050 Laptop 4GB VRAM.

NanoCLI tidak hanya menjawab prompt biasa. Produk ini membaca file, melakukan review kode, membantu debugging, membuat unit test, dan menyimpan riwayat konteks proyek ke dalam Project Memory. Dengan Project Memory, model dapat memahami struktur proyek, keputusan teknis sebelumnya, perubahan terakhir, dan pola kode yang sudah digunakan.

Produk ini tidak melatih ulang model secara otomatis. Produk ini membuat model tampak lebih paham proyek dengan cara menyimpan konteks proyek dalam file dan database lokal, lalu mengambil konteks paling relevan saat pengguna menjalankan perintah.

## 2. Masalah yang Ingin Diselesaikan

Developer sering menghadapi masalah berikut.

1. Harus menjelaskan ulang konteks proyek setiap kali meminta bantuan AI.
2. Model lokal sering lupa perubahan terakhir karena tidak punya memori jangka panjang.
3. Review kode manual memakan waktu.
4. Debugging lambat karena error, file terkait, dan riwayat perubahan tidak tersimpan dalam satu konteks.
5. Model besar sering tidak lancar di laptop 16 GB RAM dan RTX 3050 4GB VRAM.
6. CLI AI biasa hanya menerima prompt, tetapi tidak memahami proyek secara berkelanjutan.

NanoCLI menyelesaikan masalah tersebut dengan pendekatan local-first, ringan, berbasis file, dan project-aware.

## 3. Tujuan Produk

Tujuan utama NanoCLI adalah menyediakan AI coding assistant lokal yang cepat, hemat resource, dan mampu memahami konteks proyek secara bertahap.

Tujuan khusus:

1. Membantu developer bertanya cepat melalui terminal.
2. Membantu review kode per file.
3. Membantu debugging berdasarkan file dan pesan error.
4. Membantu membuat unit test.
5. Menyimpan ringkasan proyek dan keputusan teknis dalam Project Memory.
6. Mengambil konteks relevan dari memory saat menjawab.
7. Memberi rekomendasi perubahan kode secara aman, tidak langsung menimpa file tanpa izin.
8. Tetap nyaman digunakan pada laptop dengan RAM 16 GB dan VRAM 4GB.

## 4. Non-Goals

NanoCLI tidak ditujukan untuk hal berikut pada versi awal.

1. Menggantikan IDE penuh seperti VS Code.
2. Melatih ulang model lokal secara otomatis.
3. Menjalankan model 14B, 32B, atau lebih besar secara nyaman di hardware target.
4. Mengubah file secara otomatis tanpa preview.
5. Mengirim kode pengguna ke cloud secara default.
6. Menjadi agent otonom yang bebas menjalankan command berisiko.

## 5. Target Pengguna

### 5.1 Pengguna Utama

Developer individu, mahasiswa informatika, pembuat aplikasi kecil, dan pengguna terminal yang ingin memakai AI lokal untuk membantu coding harian.

### 5.2 Kebutuhan Pengguna

Pengguna membutuhkan alat yang:

1. Cepat dibuka dari terminal.
2. Bisa membaca file kode.
3. Bisa memahami konteks proyek.
4. Bisa menyimpan ringkasan perubahan terakhir.
5. Bisa digunakan tanpa internet setelah model terunduh.
6. Tidak terlalu berat untuk laptop menengah.
7. Memberi jawaban teknis yang langsung bisa dipakai.

## 6. Spesifikasi Hardware Target

Hardware utama:

- CPU: Intel Core i5-11400H
- RAM: 16 GB
- GPU: NVIDIA GeForce RTX 3050 Laptop
- VRAM: 4GB dedicated
- Shared GPU memory: 8GB
- OS target: Windows 10 atau Windows 11, dengan dukungan WSL opsional

### 6.1 Implikasi Hardware

VRAM 4GB membatasi penggunaan model besar. Model 7B masih bisa berjalan, tetapi dapat terasa lebih lambat jika context terlalu panjang. Model 14B dan 32B tidak direkomendasikan untuk penggunaan harian lokal.

Karena itu, NanoCLI harus memakai strategi berikut.

1. Model default kecil dan cepat.
2. Model besar hanya untuk mode deep review.
3. Context dibatasi.
4. File panjang diringkas sebelum dikirim ke model.
5. Project Memory digunakan untuk mengambil konteks relevan, bukan memasukkan seluruh proyek ke prompt.

## 7. Rekomendasi Model Final Berbasis Qwen3.5

Strategi model NanoCLI diperbarui agar lebih mengutamakan Qwen3.5. Alasan utamanya adalah Qwen3.5 memiliki context window besar, dukungan multimodal pada varian tertentu, mode thinking, dan kemampuan agentic yang lebih baik untuk workflow coding modern.

Namun, karena target hardware hanya memiliki RTX 3050 Laptop 4GB VRAM dan RAM 16 GB, NanoCLI tidak boleh memakai semua kemampuan context Qwen3.5 secara penuh. Context window 256K tetap harus dikontrol melalui `num_ctx`, context compaction, dan retrieval Project Memory.

### 7.1 Model Default Harian

Model default yang dipilih:

```bash
qwen3.5:4b-q4_K_M
```

Alasan:

1. Ukuran sekitar 3.4 GB sehingga masih masuk akal untuk laptop dengan RTX 3050 4GB.
2. Mendukung context window 256K, tetapi NanoCLI tetap membatasi context runtime agar tidak membebani VRAM.
3. Mendukung input text dan image, sehingga dapat dikembangkan untuk analisis screenshot atau diagram di masa depan.
4. Lebih baru dibanding Qwen2.5-Coder dan lebih cocok untuk agentic CLI yang butuh planning, tool-style prompt, dan long-context workflow.
5. Cocok sebagai default untuk `ask`, `chat`, `review`, `debug`, `test`, `plan`, dan memory-aware command.

Catatan penting:

Qwen3.5 tidak boleh dipaksa memakai context 256K di laptop target. Untuk harian, NanoCLI harus memakai context efektif sekitar 8K sampai 16K. Mode 32K hanya dipakai saat diperlukan dan harus memberi peringatan memori.

### 7.2 Model Cepat

Model cepat yang direkomendasikan:

```bash
qwen3.5:2b-q4_K_M
```

Alasan:

1. Lebih ringan daripada 4B.
2. Cocok untuk prompt pendek.
3. Cocok ketika laptop sedang menjalankan banyak aplikasi.
4. Cocok untuk `ask`, `chat`, command bantuan singkat, dan ringkasan kecil.

Batasan:

1. Kurang kuat untuk review kode kompleks.
2. Tidak direkomendasikan untuk patch besar.
3. Tidak ideal untuk analisis arsitektur.

### 7.3 Model Deep Review Lokal

Model deep review lokal:

```bash
qwen3.5:9b-q4_K_M
```

Alasan:

1. Lebih kuat untuk reasoning dan instruksi panjang.
2. Cocok untuk review arsitektur, refactor besar, debugging rumit, dan analisis multi-file.
3. Masih mungkin dijalankan di RAM 16 GB, tetapi kemungkinan lebih lambat karena model sekitar 6.6 GB dan VRAM hanya 4GB.

Batasan:

1. Tidak dijadikan default.
2. Hanya dipakai saat pengguna memberi opsi `--deep`.
3. Harus memakai context compaction.
4. Harus memberi peringatan jika RAM bebas rendah.

### 7.4 Fallback Coding-Specific

Model fallback coding-specific:

```bash
qwen2.5-coder:3b
```

Alasan:

1. Model ini memang dibuat khusus untuk coding.
2. Berguna jika Qwen3.5 4B memberi jawaban terlalu umum.
3. Cocok untuk generate fungsi, review file kecil, dan unit test sederhana.
4. Lebih stabil untuk tugas coding murni yang tidak membutuhkan multimodal atau long-context besar.

Model deep fallback coding-specific:

```bash
qwen2.5-coder:7b
```

Digunakan hanya jika pengguna memilih mode coding-specific deep review.

### 7.5 Model Embedding untuk Project Memory

Model embedding:

```bash
nomic-embed-text
```

Fungsi:

1. Mengubah ringkasan file, potongan kode, catatan bug, dan keputusan teknis menjadi embedding.
2. Membantu pencarian konteks relevan.
3. Mendukung sistem Project Memory lokal.
4. Tidak digunakan untuk chat karena model ini hanya untuk embedding.

### 7.6 Kebijakan Pemilihan Model

| Kebutuhan | Model Utama | Alternatif |
|---|---|---|
| Prompt cepat | qwen3.5:2b-q4_K_M | qwen2.5-coder:1.5b |
| Chat harian | qwen3.5:4b-q4_K_M | qwen2.5-coder:3b |
| Review file kecil | qwen3.5:4b-q4_K_M | qwen2.5-coder:3b |
| Debug ringan | qwen3.5:4b-q4_K_M | qwen2.5-coder:3b |
| Unit test sederhana | qwen3.5:4b-q4_K_M | qwen2.5-coder:3b |
| Plan fitur | qwen3.5:4b-q4_K_M | qwen3.5:9b-q4_K_M |
| Review arsitektur | qwen3.5:9b-q4_K_M | qwen2.5-coder:7b |
| Analisis error rumit | qwen3.5:9b-q4_K_M | qwen2.5-coder:7b |
| Patch kecil | qwen3.5:4b-q4_K_M | qwen2.5-coder:3b |
| Patch kompleks | qwen3.5:9b-q4_K_M | qwen2.5-coder:7b |
| Index memory | nomic-embed-text | none |

### 7.7 Model yang Tidak Direkomendasikan untuk Laptop Target

Model berikut tidak direkomendasikan untuk penggunaan lokal harian pada RAM 16 GB dan VRAM 4GB.

1. `qwen3.5:27b`
2. `qwen3.5:35b`
3. `qwen3.5:122b`
4. `qwen3-coder:30b`
5. `qwen3-coder-next`

Alasan:

1. Ukuran model terlalu besar.
2. Konsumsi RAM tinggi.
3. Respons lambat.
4. Tidak cocok untuk CLI harian.
5. Risiko freezing tinggi pada laptop target.

### 7.8 Strategi Context Qwen3.5

Walaupun Qwen3.5 mendukung context window besar, NanoCLI harus memakai batas operasional berikut.

| Mode | Target `num_ctx` | Penggunaan |
|---|---:|---|
| Fast | 4096 sampai 8192 | prompt pendek |
| Normal | 8192 sampai 16384 | ask, chat, review kecil |
| Project | 16384 sampai 32768 | project-aware ask, debug, test |
| Deep | 32768 | review arsitektur atau multi-file |
| Experimental Long Context | 65536 | hanya jika RAM cukup dan pengguna sadar risiko |

NanoCLI tidak boleh diam-diam menaikkan context. Jika pengguna meminta context besar, tampilkan peringatan karena context lebih besar meningkatkan kebutuhan memori.


## 8. Konsep Project Memory

Project Memory adalah fitur yang menyimpan konteks proyek secara lokal agar model tidak perlu diberi penjelasan ulang setiap sesi.

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
10. Embedding untuk pencarian konteks relevan.

### 8.1 Hal yang Bisa Dilakukan

Project Memory bisa membuat model:

1. Mengingat struktur proyek.
2. Memahami keputusan teknis sebelumnya.
3. Menjawab sesuai style kode proyek.
4. Menganalisis perubahan terakhir.
5. Menghubungkan error dengan file yang relevan.
6. Memberi saran refactor yang lebih kontekstual.

### 8.2 Hal yang Tidak Bisa Dilakukan

Project Memory tidak membuat model:

1. Melatih ulang bobot model.
2. Menjadi benar-benar berkembang sendiri seperti manusia.
3. Selalu benar tanpa validasi.
4. Aman menjalankan command berisiko tanpa kontrol pengguna.

Istilah yang paling tepat untuk fitur ini adalah project memory, retrieval-augmented context, atau local RAG memory.

## 9. Struktur Folder Project Memory

Saat pengguna menjalankan `nanocli init`, aplikasi membuat folder berikut.

```text
.nanocli/
  config.yaml
  PROJECT_CONTEXT.md
  memory/
    decisions.md
    changelog.md
    bugs.md
    todos.md
    coding_style.md
    dependencies.md
  index/
    memory.sqlite
    file_index.json
  summaries/
    files/
      main.py.md
      app.py.md
      routes.py.md
  sessions/
    2026-05-15_101500.md
  cache/
    last_context.json
  benchmarks/
    2026-05-15_model_benchmark.json
```

### 9.1 PROJECT_CONTEXT.md

File utama yang selalu dibaca oleh NanoCLI saat mode project aktif.

Isi minimal:

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

### 9.2 decisions.md

Menyimpan keputusan teknis.

Contoh:

```markdown
# Technical Decisions

## 2026-05-15
- Use Typer for CLI command structure.
- Use Rich for terminal formatting.
- Use qwen3.5:4b-q4_K_M as default model.
- Use local project memory instead of fine-tuning.
```

### 9.3 changelog.md

Menyimpan perubahan penting.

Contoh:

```markdown
# Project Changelog

## 2026-05-15
- Added ask command.
- Added Ollama streaming wrapper.
- Added config loader.
```

### 9.4 bugs.md

Menyimpan error yang pernah terjadi dan solusinya.

Contoh:

```markdown
# Known Bugs

## Error: Ollama connection refused
Cause: Ollama service was not running.
Solution: Run ollama serve or open Ollama desktop.
```

### 9.5 coding_style.md

Menyimpan gaya kode proyek.

Contoh:

```markdown
# Coding Style

- Use type hints.
- Use small functions.
- Keep CLI commands thin.
- Put Ollama logic in llm.py.
- Put file reading logic in utils.py.
```

## 10. Arsitektur Produk

```text
User Terminal
    |
    v
NanoCLI CLI Layer
    |
    |-- ask
    |-- chat
    |-- review
    |-- debug
    |-- test
    |-- memory
    |-- config
    |
    v
Command Controller
    |
    |-- Prompt Builder
    |-- File Reader
    |-- Project Memory Retriever
    |-- Safety Filter
    |-- Output Renderer
    |
    v
LLM Service Layer
    |
    |-- Ollama Client
    |-- Streaming Handler
    |-- Model Selector
    |
    v
Local Ollama Models
```

## 11. Modul Teknis

### 11.1 CLI Layer

File:

```text
nanocli/main.py
```

Tanggung jawab:

1. Mendefinisikan command.
2. Membaca argumen CLI.
3. Mengirim request ke controller.
4. Menampilkan output.

### 11.2 LLM Service

File:

```text
nanocli/llm.py
```

Tanggung jawab:

1. Menghubungkan aplikasi ke Ollama.
2. Mengirim prompt.
3. Mengaktifkan streaming.
4. Mengatur model.
5. Menangani error koneksi.

### 11.3 Prompt Builder

File:

```text
nanocli/prompts.py
```

Tanggung jawab:

1. Membuat prompt untuk setiap command.
2. Menggabungkan system prompt, user prompt, file context, dan memory context.
3. Membatasi panjang context.

### 11.4 File Handler

File:

```text
nanocli/files.py
```

Tanggung jawab:

1. Membaca file.
2. Mengecek ukuran file.
3. Mengabaikan file sensitif.
4. Memotong file terlalu panjang.
5. Membuat chunk file.

### 11.5 Memory Manager

File:

```text
nanocli/memory.py
```

Tanggung jawab:

1. Membuat folder `.nanocli`.
2. Membaca Project Memory.
3. Menulis riwayat sesi.
4. Memperbarui ringkasan proyek.
5. Melakukan pencarian konteks relevan.

### 11.6 Indexer

File:

```text
nanocli/indexer.py
```

Tanggung jawab:

1. Melakukan scan folder proyek.
2. Mengabaikan folder yang tidak perlu.
3. Membuat ringkasan file.
4. Membuat embedding.
5. Menyimpan index ke SQLite.

### 11.7 Config Manager

File:

```text
nanocli/config.py
```

Tanggung jawab:

1. Membaca konfigurasi.
2. Menulis konfigurasi.
3. Mengatur model default.
4. Mengatur batas context.
5. Mengatur ignore pattern.

### 11.8 Output Renderer

File:

```text
nanocli/render.py
```

Tanggung jawab:

1. Menampilkan output Markdown.
2. Menampilkan syntax-highlighted code.
3. Menampilkan tabel.
4. Menampilkan status proses.

## 12. Fitur Produk

## 12.1 Fitur 1: Project Initialization

Command:

```bash
nanocli init
```

Deskripsi:

Membuat konfigurasi awal NanoCLI di root proyek.

User story:

Sebagai developer, saya ingin menginisialisasi NanoCLI di proyek saya agar AI bisa menyimpan konteks proyek.

Acceptance criteria:

1. Command membuat folder `.nanocli`.
2. Command membuat `config.yaml`.
3. Command membuat `PROJECT_CONTEXT.md`.
4. Command membuat file memory dasar.
5. Command tidak menimpa file lama tanpa konfirmasi.

Output contoh:

```text
NanoCLI initialized.
Project memory created at .nanocli/
Default model: qwen3.5:4b-q4_K_M
```

## 12.2 Fitur 2: Ask Command

Command:

```bash
nanocli ask "buat fungsi validasi email di Python"
```

Deskripsi:

Menjawab prompt tunggal tanpa perlu membuka chat.

User story:

Sebagai developer, saya ingin bertanya cepat dari terminal agar tidak perlu membuka browser atau IDE lain.

Acceptance criteria:

1. Command menerima prompt string.
2. Command mengirim prompt ke Ollama.
3. Output tampil streaming.
4. Pengguna bisa memilih model dengan `--model`.
5. Jika Ollama belum aktif, sistem memberi pesan error yang jelas.

Opsi:

```bash
nanocli ask "jelaskan fungsi ini" --model qwen3.5:9b-q4_K_M
nanocli ask "buat regex password" --no-memory
```

## 12.3 Fitur 3: Chat Command

Command:

```bash
nanocli chat
```

Deskripsi:

Membuka sesi chat interaktif.

User story:

Sebagai developer, saya ingin berdialog dengan AI secara bertahap agar bisa mengembangkan ide dan memperbaiki kode melalui percakapan.

Acceptance criteria:

1. Pengguna dapat mengetik beberapa pesan.
2. Chat menyimpan session log lokal.
3. Command mendukung exit dengan `exit`, `quit`, atau `Ctrl+C`.
4. Chat bisa memakai Project Memory jika berada di folder proyek.
5. Riwayat sesi disimpan di `.nanocli/sessions/`.

Command tambahan di dalam chat:

```text
/memory show
/memory update
/model qwen3.5:9b-q4_K_M
/clear
/exit
```

## 12.4 Fitur 4: Review File

Command:

```bash
nanocli review path/to/file.py
```

Deskripsi:

Membaca file dan memberi review kode.

User story:

Sebagai developer, saya ingin AI mengecek kode saya agar saya tahu bug, masalah struktur, dan potensi refactor.

Acceptance criteria:

1. Command membaca file.
2. Command menolak file yang terlalu besar tanpa strategi chunking.
3. Output berisi masalah, dampak, dan saran perbaikan.
4. Output tidak mengubah file secara otomatis.
5. Command bisa memakai Project Memory.

Format output:

```markdown
## Ringkasan

## Masalah Penting

## Bug Potensial

## Saran Refactor

## Saran Keamanan

## Patch yang Disarankan
```

Opsi:

```bash
nanocli review app.py --deep
nanocli review app.py --with-memory
nanocli review app.py --focus security
```

Model default:

- Normal: qwen3.5:4b-q4_K_M
- Deep: qwen3.5:9b-q4_K_M
- Fallback coding-specific: qwen2.5-coder:3b

## 12.5 Fitur 5: Debug File

Command:

```bash
nanocli debug path/to/file.py "TypeError: NoneType is not subscriptable"
```

Deskripsi:

Menganalisis file dan pesan error.

User story:

Sebagai developer, saya ingin AI membaca file dan error agar bisa menemukan penyebab masalah lebih cepat.

Acceptance criteria:

1. Command menerima file path.
2. Command menerima pesan error opsional.
3. Output berisi kemungkinan penyebab, lokasi kode, dan solusi.
4. Jika Project Memory aktif, sistem mengambil bug serupa dari memory.
5. Command menyimpan error dan solusi ke `bugs.md` setelah pengguna menyetujui.

Opsi:

```bash
nanocli debug app.py --error-file traceback.txt
nanocli debug app.py --save-bug
```

## 12.6 Fitur 6: Generate Unit Test

Command:

```bash
nanocli test path/to/file.py
```

Deskripsi:

Membuat unit test berdasarkan file target.

User story:

Sebagai developer, saya ingin AI membuat unit test awal agar saya bisa mempercepat proses testing.

Acceptance criteria:

1. Command membaca file target.
2. Command mendeteksi bahasa pemrograman secara sederhana dari ekstensi.
3. Output berupa kode test.
4. Command memberi nama file test yang disarankan.
5. Command tidak menulis file tanpa opsi `--write`.

Opsi:

```bash
nanocli test calculator.py --framework pytest
nanocli test calculator.py --write
nanocli test calculator.py --deep
```

## 12.7 Fitur 7: Project Memory Update

Command:

```bash
nanocli memory update
```

Deskripsi:

Memperbarui ringkasan proyek, ringkasan file, changelog, dan index.

User story:

Sebagai developer, saya ingin NanoCLI menyimpan kondisi terakhir proyek agar AI dapat memahami pekerjaan saya pada sesi berikutnya.

Acceptance criteria:

1. Command membaca struktur proyek.
2. Command mengabaikan folder besar seperti `.git`, `node_modules`, `.venv`, `dist`, `build`, dan `__pycache__`.
3. Command memperbarui ringkasan file yang berubah.
4. Command menyimpan session summary.
5. Command memperbarui SQLite index.
6. Command tidak menyimpan isi file sensitif.

Output contoh:

```text
Memory updated.
Files scanned: 42
Files summarized: 7
Sensitive files skipped: 3
Index updated: .nanocli/index/memory.sqlite
```

## 12.8 Fitur 8: Project Memory Search

Command:

```bash
nanocli memory search "auth login bug"
```

Deskripsi:

Mencari konteks proyek yang relevan dari memory.

User story:

Sebagai developer, saya ingin mencari keputusan, bug, atau file terkait tanpa membuka semua dokumen.

Acceptance criteria:

1. Command mencari dari Markdown memory.
2. Command mencari dari SQLite index.
3. Output menampilkan file, ringkasan, dan skor relevansi.
4. Output tidak menampilkan file sensitif.

## 12.9 Fitur 9: Project-Aware Ask

Command:

```bash
nanocli ask "kenapa login saya gagal?" --project
```

Deskripsi:

Ask command yang memakai Project Memory.

User story:

Sebagai developer, saya ingin AI menjawab berdasarkan konteks proyek saya, bukan jawaban umum.

Acceptance criteria:

1. Command membaca `PROJECT_CONTEXT.md`.
2. Command mengambil 3 sampai 7 konteks relevan dari memory.
3. Prompt akhir tidak melebihi batas context.
4. Jawaban menyebut file atau keputusan teknis yang relevan jika ada.

## 12.10 Fitur 10: Dev Plan

Command:

```bash
nanocli plan "tambahkan fitur login dengan JWT"
```

Deskripsi:

Membuat rencana implementasi fitur berdasarkan konteks proyek.

User story:

Sebagai developer, saya ingin AI membuat rencana teknis sebelum saya mengubah kode.

Acceptance criteria:

1. Output berisi ringkasan kebutuhan.
2. Output berisi file yang perlu diubah.
3. Output berisi langkah implementasi.
4. Output berisi risiko.
5. Output berisi test yang perlu dibuat.
6. Output bisa disimpan ke memory.

## 12.11 Fitur 11: Patch Suggestion

Command:

```bash
nanocli patch path/to/file.py "perbaiki validasi input"
```

Deskripsi:

Memberi saran patch, tetapi tidak langsung menulis file.

User story:

Sebagai developer, saya ingin AI memberi patch yang bisa saya review sebelum diterapkan.

Acceptance criteria:

1. Output berupa diff.
2. Pengguna dapat memilih apply atau cancel.
3. Default tidak menulis file.
4. Patch disimpan ke session log.
5. Jika diterapkan, changelog diperbarui.

Opsi:

```bash
nanocli patch app.py "refactor function ini" --apply
nanocli patch app.py "tambahkan validasi" --dry-run
```

## 12.12 Fitur 12: Config Management

Command:

```bash
nanocli config show
nanocli config set default_model qwen3.5:4b-q4_K_M
nanocli config set fast_model qwen3.5:2b-q4_K_M
nanocli config set deep_model qwen3.5:9b-q4_K_M
```

Deskripsi:

Mengatur konfigurasi NanoCLI.

Acceptance criteria:

1. Pengguna bisa melihat konfigurasi aktif.
2. Pengguna bisa mengganti model default.
3. Pengguna bisa mengganti batas context.
4. Pengguna bisa mengatur ignore pattern.


## 12.13 Fitur 13: Model Benchmark

Command:

```bash
nanocli models benchmark
```

Deskripsi:

Menguji model lokal di laptop pengguna agar NanoCLI dapat memilih model terbaik secara empiris.

User story:

Sebagai developer, saya ingin mengetahui model mana yang paling lancar di laptop saya agar saya tidak salah memilih default model.

Acceptance criteria:

1. Command menguji model fast, default, deep, dan fallback.
2. Command mengukur waktu sampai token pertama.
3. Command mengukur total durasi respons.
4. Command mengukur estimasi token per detik.
5. Command menguji prompt coding pendek.
6. Command menguji prompt review kecil.
7. Command menyimpan hasil ke `.nanocli/benchmarks/`.
8. Command dapat merekomendasikan model default berdasarkan hasil benchmark.

Output contoh:

```text
Model Benchmark Result

qwen3.5:2b-q4_K_M
- First token: 2.1s
- Speed: 24 tok/s
- Recommendation: fast mode

qwen3.5:4b-q4_K_M
- First token: 4.8s
- Speed: 13 tok/s
- Recommendation: default mode

qwen3.5:9b-q4_K_M
- First token: 12.4s
- Speed: 5 tok/s
- Recommendation: deep mode only
```

Opsi:

```bash
nanocli models benchmark --save
nanocli models benchmark --set-best
nanocli models benchmark --include-fallback-coder
```


## 13. Alur Kerja Harian yang Direkomendasikan

### 13.1 Awal Proyek

```bash
nanocli init
nanocli memory update
```

### 13.2 Saat Membuat Fitur Baru

```bash
nanocli plan "buat fitur register user"
nanocli ask "buat struktur service register" --project
nanocli patch app/services/auth.py "tambahkan register service"
nanocli test app/services/auth.py --framework pytest
nanocli memory update
```

### 13.3 Saat Debugging

```bash
nanocli debug app/routes/auth.py "401 Unauthorized saat login"
nanocli memory search "login 401"
nanocli patch app/routes/auth.py "perbaiki validasi token"
nanocli memory update
```

### 13.4 Saat Review Sebelum Commit

```bash
nanocli review app/routes/auth.py --with-memory
nanocli test app/routes/auth.py
nanocli memory update
```

## 14. Sistem Memory: Cara Kerja Detail

### 14.1 Memory Pipeline

```text
Source Files
    |
    v
File Scanner
    |
    v
Ignore Sensitive Files
    |
    v
Chunking
    |
    v
Summarization
    |
    v
Embedding
    |
    v
SQLite Index
    |
    v
Retrieval during Ask, Review, Debug, Test
```

### 14.2 Data yang Disimpan

Data yang boleh disimpan:

1. Nama file.
2. Path relatif.
3. Ringkasan fungsi file.
4. Potongan kode non-sensitif.
5. Keputusan teknis.
6. Riwayat bug.
7. TODO.
8. Changelog.
9. Hasil review.

Data yang tidak boleh disimpan:

1. Password.
2. Token.
3. API key.
4. Private key.
5. Isi `.env`.
6. Credential database.
7. File sertifikat.

### 14.3 Ignore Pattern Default

```yaml
ignore:
  - .git/
  - node_modules/
  - .venv/
  - venv/
  - __pycache__/
  - dist/
  - build/
  - .env
  - .env.*
  - *.pem
  - *.key
  - *.crt
  - *.p12
  - *.sqlite
  - *.db
  - package-lock.json
  - poetry.lock
```

### 14.4 Retrieval Strategy

Saat pengguna menjalankan command dengan memory, NanoCLI mengambil konteks berikut.

1. Project context utama.
2. Coding style.
3. Keputusan teknis relevan.
4. Ringkasan file target.
5. Potongan memory paling relevan.
6. Bug serupa jika command debug.
7. Changelog terakhir.

Batas konteks default:

```yaml
context:
  normal_max_chars: 12000
  deep_max_chars: 24000
  memory_chunks: 5
  file_chunk_chars: 4000
```

## 15. Format Prompt Internal

### 15.1 Prompt Review

```text
You are a strict but practical code reviewer.
Review the file based on correctness, maintainability, security, performance, and consistency with project memory.
Return concise findings with location, issue, impact, and suggested fix.
Do not invent files or dependencies.
```

### 15.2 Prompt Debug

```text
You are a debugging assistant.
Analyze the provided file, error message, project memory, and recent changelog.
Identify the most likely cause.
Give step-by-step fix.
Do not guess beyond available evidence.
```

### 15.3 Prompt Test

```text
You are a test generation assistant.
Generate practical unit tests for the given file.
Follow the detected framework or user-selected framework.
Include edge cases.
Do not test implementation details that should remain private.
```

## 16. Konfigurasi Default

File:

```text
.nanocli/config.yaml
```

Isi default:

```yaml
models:
  default: qwen3.5:4b-q4_K_M
  fast: qwen3.5:2b-q4_K_M
  deep: qwen3.5:9b-q4_K_M
  fallback_coder: qwen2.5-coder:3b
  deep_coder: qwen2.5-coder:7b
  embedding: nomic-embed-text

ollama:
  host: http://localhost:11434
  stream: true
  temperature: 0.2
  top_p: 0.9
  num_ctx_fast: 8192
  num_ctx_normal: 16384
  num_ctx_deep: 32768
  num_predict: 2048

context:
  normal_max_chars: 16000
  deep_max_chars: 32000
  memory_chunks: 7
  file_chunk_chars: 5000
  enable_context_compaction: true

safety:
  block_sensitive_files: true
  require_confirm_before_write: true
  allow_shell_execution: false
  block_auto_apply_for_patch: true

memory:
  enabled: true
  auto_update_after_patch: true
  save_sessions: true
  summarization_model: qwen3.5:4b-q4_K_M
  embedding_model: nomic-embed-text
```

## 17. Kebutuhan Non-Fungsional

### 17.1 Performa

Target performa:

1. `ask` mulai streaming dalam 2 sampai 10 detik pada `qwen3.5:4b-q4_K_M`.
2. `ask --fast` mulai streaming lebih cepat menggunakan `qwen3.5:2b-q4_K_M`.
3. `review` file kecil selesai dalam 20 sampai 75 detik pada model 4B.
4. `memory update` proyek kecil selesai dalam 1 sampai 5 menit.
5. `--deep` menggunakan `qwen3.5:9b-q4_K_M` dan boleh lebih lambat.
6. Mode deep harus memberi peringatan jika RAM bebas rendah.
7. Mode normal harus menjaga `num_ctx` sekitar 8K sampai 16K.
8. Mode deep boleh memakai 32K context jika hardware masih stabil.

Indikator performa yang harus dicatat oleh NanoCLI:

1. Waktu sampai token pertama.
2. Total durasi respons.
3. Estimasi token per detik.
4. Model yang digunakan.
5. Context mode yang digunakan.
6. Jumlah file dan memory chunk yang masuk ke prompt.

### 17.2 Keamanan

1. Jangan membaca file sensitif secara default.
2. Jangan mengirim data ke cloud secara default.
3. Jangan menjalankan shell command dari model.
4. Jangan menulis file tanpa konfirmasi.
5. Selalu tampilkan diff sebelum apply patch.

### 17.3 Reliabilitas

1. Jika Ollama mati, tampilkan instruksi singkat.
2. Jika model belum terinstal, sarankan command `ollama pull`.
3. Jika file terlalu besar, gunakan chunking atau minta pengguna memilih mode deep.
4. Jika memory belum dibuat, sarankan `nanocli init`.

### 17.4 Portabilitas

1. Berjalan di Windows.
2. Berjalan di Linux.
3. Berjalan di macOS jika Ollama tersedia.
4. Tidak wajib memakai GPU.

## 18. Tech Stack Final

| Komponen | Pilihan |
|---|---|
| Bahasa | Python 3.10+ |
| CLI framework | Typer |
| Terminal UI | Rich |
| LLM runtime | Ollama |
| LLM client | ollama Python client |
| Config | YAML |
| Memory database | SQLite |
| Text search | SQLite FTS5 |
| Embedding | nomic-embed-text |
| Testing | pytest |
| Packaging | pyproject.toml |
| Linting | ruff |
| Type checking opsional | mypy |

## 19. Struktur Project NanoCLI

```text
NanoCLI/
  pyproject.toml
  README.md
  LICENSE
  nanocli/
    __init__.py
    main.py
    llm.py
    config.py
    files.py
    prompts.py
    memory.py
    indexer.py
    render.py
    safety.py
    models.py
    commands/
      __init__.py
      ask.py
      chat.py
      review.py
      debug.py
      test.py
      memory.py
      config.py
      plan.py
      patch.py
  tests/
    test_cli.py
    test_config.py
    test_files.py
    test_memory.py
  examples/
    sample_project/
```

## 20. Roadmap Pengembangan

### Phase 0: Setup Project

Target:

1. Buat struktur folder.
2. Buat `pyproject.toml`.
3. Pasang Typer, Rich, Ollama, PyYAML, pytest, ruff.
4. Buat entry point `nanocli`.

Definition of done:

```bash
nanocli --help
```

berjalan dengan benar.

### Phase 1: Core LLM dan Model Runtime

Target:

1. Implementasi Ollama client.
2. Implementasi streaming output.
3. Implementasi model selector.
4. Error handling jika Ollama mati.
5. Pull dan validasi model utama.
6. Tambahkan benchmark awal untuk Qwen3.5.

Model yang perlu diuji:

```bash
ollama pull qwen3.5:4b-q4_K_M
ollama pull qwen3.5:2b-q4_K_M
ollama pull qwen3.5:9b-q4_K_M
ollama pull nomic-embed-text
```

Definition of done:

```bash
nanocli ask "hello"
nanocli models benchmark
```

berhasil memberi jawaban dan menampilkan hasil benchmark lokal.

### Phase 2: Basic Commands

Target:

1. `ask`
2. `chat`
3. `config show`
4. `config set`

Definition of done:

Pengguna dapat bertanya, chat, dan mengganti model default.

### Phase 3: File-Based Commands

Target:

1. `review`
2. `debug`
3. `test`
4. File reader
5. Sensitive file blocker

Definition of done:

NanoCLI dapat membaca file, memberi review, membantu debugging, dan membuat test.

### Phase 4: Project Memory MVP

Target:

1. `init`
2. `memory update`
3. `PROJECT_CONTEXT.md`
4. `decisions.md`
5. `changelog.md`
6. Session log

Definition of done:

NanoCLI menyimpan ringkasan proyek dan membaca ulang saat `--project` digunakan.

### Phase 5: Memory Retrieval

Target:

1. SQLite index.
2. SQLite FTS5 search.
3. Embedding dengan nomic-embed-text.
4. Retrieval top-k context.
5. Context builder.

Definition of done:

NanoCLI mengambil konteks paling relevan saat menjawab prompt berbasis proyek.

### Phase 6: Plan and Patch

Target:

1. `plan`
2. `patch`
3. Diff preview.
4. Confirmation sebelum apply.
5. Auto changelog setelah patch.

Definition of done:

NanoCLI dapat memberi rencana fitur dan patch aman.

### Phase 7: Stabilization

Target:

1. Unit test.
2. Dokumentasi.
3. Benchmark performa.
4. Packaging.
5. Release v0.1.0.

Definition of done:

Project siap dipakai harian.

## 21. MVP Scope

MVP harus berisi fitur berikut.

1. `nanocli init`
2. `nanocli ask`
3. `nanocli chat`
4. `nanocli review`
5. `nanocli debug`
6. `nanocli test`
7. `nanocli memory update`
8. `nanocli memory search`
9. `nanocli config show`
10. `nanocli config set`

Fitur yang bisa ditunda:

1. `patch --apply`
2. Embedding vector search kompleks.
3. Agent auto-run command.
4. Cloud model integration.
5. Multi-repository workspace.

## 22. Risiko Produk dan Solusi

| Risiko | Dampak | Solusi |
|---|---|---|
| Model 7B lambat | UX buruk | Default pakai 3B |
| File terlalu besar | Prompt penuh | Chunking dan summarization |
| Memory membesar | Retrieval lambat | Compact memory berkala |
| Model memberi saran salah | Bug baru | Patch preview dan user approval |
| File sensitif terbaca | Risiko keamanan | Sensitive file blocker |
| Jawaban terlalu umum | Tidak membantu | Project Memory wajib untuk mode proyek |
| Index rusak | Memory tidak terbaca | Rebuild index command |

## 23. Command Lengkap yang Direkomendasikan

```bash
nanocli init
nanocli ask "prompt"
nanocli ask "prompt" --project
nanocli chat
nanocli review <file_path>
nanocli review <file_path> --deep
nanocli debug <file_path> "error message"
nanocli test <file_path>
nanocli plan "feature request"
nanocli patch <file_path> "change request"
nanocli memory update
nanocli memory show
nanocli memory search "query"
nanocli memory compact
nanocli memory rebuild
nanocli config show
nanocli config set <key> <value>
nanocli models list
nanocli models pull
nanocli models benchmark
```

## 24. Definisi Sukses

NanoCLI dianggap berhasil jika:

1. Pengguna bisa memakai AI lokal untuk coding harian tanpa membuka browser.
2. `qwen3.5:4b-q4_K_M` terasa responsif pada hardware target.
3. `qwen3.5:2b-q4_K_M` tersedia sebagai fast mode.
4. `qwen3.5:9b-q4_K_M` tersedia sebagai deep mode dengan peringatan memori.
5. Project Memory membuat jawaban lebih sesuai konteks.
6. Pengguna tidak perlu menjelaskan ulang struktur proyek setiap sesi.
7. Review, debug, dan test memberi hasil yang praktis.
8. Tidak ada file sensitif yang terbaca atau tersimpan tanpa izin.
9. Pengguna dapat melanjutkan proyek besar dengan konteks yang tersimpan.
10. Benchmark model dapat membantu pengguna memilih model paling lancar di laptopnya.

## 25. Kesimpulan Teknis

Dengan spesifikasi i5-11400H, RAM 16 GB, dan RTX 3050 4GB VRAM, NanoCLI tetap sangat mungkin dibuat dan digunakan secara nyaman jika strategi modelnya disiplin.

Model utama yang direkomendasikan adalah:

```bash
qwen3.5:4b-q4_K_M
```

Model ini dipilih karena lebih baru, mendukung context besar, mendukung workflow agentic, dan masih cukup realistis untuk laptop target. Namun, NanoCLI tetap harus membatasi `num_ctx` agar tidak membebani VRAM.

Untuk mode cepat, NanoCLI memakai:

```bash
qwen3.5:2b-q4_K_M
```

Untuk mode deep, NanoCLI memakai:

```bash
qwen3.5:9b-q4_K_M
```

Model deep tidak boleh menjadi default karena lebih berat. Model ini hanya digunakan untuk analisis arsitektur, debugging rumit, review multi-file, dan planning kompleks.

Qwen2.5-Coder tetap disimpan sebagai fallback coding-specific. Fallback ini berguna jika Qwen3.5 memberi jawaban terlalu umum untuk tugas coding murni.

Fitur Project Memory juga sangat mungkin dibuat. Cara terbaik bukan membuat model belajar sendiri melalui training, melainkan membuat sistem memory lokal yang menyimpan ringkasan proyek, keputusan teknis, changelog, bug, dan embedding. Saat pengguna bertanya, NanoCLI mengambil konteks relevan dari memory dan memasukkannya ke prompt.

Pendekatan ini ringan, aman, dan cocok untuk laptop target. NanoCLI akan terasa seperti coding assistant yang mengingat proyek, bukan sekadar chatbot terminal.

## 26. Desain Prompt dan Agent Behavior

NanoCLI harus memakai desain prompt yang mirip dengan coding CLI modern. Prompt tidak boleh hanya berupa instruksi singkat seperti “jawab pertanyaan ini”. Prompt perlu dibagi menjadi beberapa lapisan agar hasil model lebih stabil, aman, dan sesuai konteks proyek.

Lapisan prompt NanoCLI terdiri dari:

1. Core system prompt.
2. Project instruction prompt.
3. Command-specific prompt.
4. Retrieved memory prompt.
5. File context prompt.
6. User task prompt.
7. Output format prompt.

Urutan prompt yang direkomendasikan:

```text
[CORE SYSTEM PROMPT]
[PROJECT INSTRUCTIONS]
[COMMAND MODE]
[RELEVANT PROJECT MEMORY]
[FILE CONTEXT]
[USER REQUEST]
[OUTPUT RULES]
```

## 26.1 Core System Prompt

Core system prompt adalah aturan dasar yang selalu dipakai oleh NanoCLI.

```text
You are NanoCLI, a local AI coding assistant running inside a terminal.
You help the user understand, review, debug, test, and modify code.
You must be practical, precise, and safe.

General rules:
- Work only from the information provided in the prompt, project memory, and visible files.
- Do not invent files, commands, APIs, dependencies, or project structure.
- Ask for missing critical details only when the task cannot be completed safely.
- Prefer small, clear, maintainable changes.
- Explain risks before suggesting destructive actions.
- Do not expose or store secrets.
- Never modify files unless the user explicitly allows write or apply mode.
- When unsure, say what is uncertain and suggest a verification step.
```

## 26.2 Project Instruction File

NanoCLI perlu mendukung file instruksi proyek bernama:

```text
AGENTS.md
```

File ini berfungsi seperti README khusus untuk AI agent. NanoCLI membaca file ini sebelum menjalankan tugas berbasis proyek.

Isi contoh:

```markdown
# AGENTS.md

## Project Overview
This project is a Python CLI app that uses Ollama for local AI coding assistance.

## Setup Commands
- Install dependencies: pip install -e .
- Run tests: pytest
- Run lint: ruff check .

## Code Style
- Use type hints.
- Keep functions small.
- Keep CLI commands thin.
- Put business logic outside main.py.
- Use clear error messages.

## Safety Rules
- Do not read .env files.
- Do not print API keys.
- Do not write files without confirmation.

## Testing Rules
- Use pytest.
- Add tests for new behavior.
- Run existing tests before final suggestions.
```

NanoCLI juga dapat mendukung file tambahan:

```text
CONVENTIONS.md
```

File ini berisi gaya penulisan kode, format commit, standar nama variabel, dan kebiasaan teknis proyek.

## 26.3 Command Mode Prompt

Setiap command harus punya prompt khusus. Ini membuat hasil lebih konsisten.

### Ask Mode

```text
Mode: ASK
Goal: Answer the user's coding question clearly and directly.
Rules:
- Provide the shortest correct answer.
- Include code only when useful.
- If the question is project-related, use project memory first.
- Do not modify files.
```

### Chat Mode

```text
Mode: CHAT
Goal: Act as a coding pair-programmer in an interactive terminal session.
Rules:
- Keep context from the current session.
- Use project memory when available.
- Ask concise follow-up questions only when needed.
- Do not propose large rewrites unless requested.
```

### Review Mode

```text
Mode: REVIEW
Goal: Review the provided code for correctness, maintainability, security, performance, and consistency with the project.
Rules:
- Focus on real issues, not style preferences only.
- Give file location when possible.
- Explain impact briefly.
- Suggest concrete fixes.
- Do not rewrite the whole file unless requested.

Output format:
1. Summary
2. Critical issues
3. Suggested improvements
4. Security notes
5. Test suggestions
```

### Debug Mode

```text
Mode: DEBUG
Goal: Find the most likely cause of the error and suggest a safe fix.
Rules:
- Use the error message, file content, changelog, and bug memory.
- Identify the probable cause.
- Give a minimal fix first.
- Suggest verification commands.
- Do not guess beyond available evidence.

Output format:
1. Probable cause
2. Evidence from code
3. Fix steps
4. Verification
```

### Test Mode

```text
Mode: TEST
Goal: Generate useful tests for the provided file.
Rules:
- Match the project test framework.
- Cover normal cases, edge cases, and failure cases.
- Avoid brittle tests.
- Do not depend on external services unless mocked.

Output format:
1. Test file name
2. Test code
3. Cases covered
4. How to run
```

### Plan Mode

```text
Mode: PLAN
Goal: Create a technical implementation plan before code changes.
Rules:
- Do not modify files.
- Identify files likely involved.
- Break the work into small steps.
- Include risks and tests.

Output format:
1. Goal
2. Affected files
3. Implementation steps
4. Risks
5. Test plan
```

### Patch Mode

```text
Mode: PATCH
Goal: Suggest a minimal patch for the requested change.
Rules:
- Prefer unified diff format.
- Do not apply changes unless apply mode is enabled.
- Keep changes small.
- Explain why each change is needed.

Output format:
1. Summary
2. Unified diff
3. Notes
4. Suggested tests
```

## 26.4 Prompt untuk Project Memory

Saat Project Memory aktif, NanoCLI perlu memasukkan konteks singkat, bukan seluruh isi proyek.

Template:

```text
Relevant project memory:

Project summary:
{project_summary}

Coding style:
{coding_style}

Recent changelog:
{recent_changelog}

Relevant decisions:
{technical_decisions}

Relevant known bugs:
{known_bugs}

Relevant file summaries:
{file_summaries}
```

Aturan memory:

1. Ambil hanya konteks yang relevan.
2. Batasi jumlah chunk.
3. Jangan masukkan file sensitif.
4. Jangan masukkan seluruh repository.
5. Selalu prioritaskan file target dan changelog terbaru.

## 26.5 Prompt untuk File Context

Template:

```text
File context:

Path: {file_path}
Language: {language}
Size: {file_size}

Content:
```{language}
{file_content_or_chunk}
```
```

Untuk file panjang, gunakan format chunk.

```text
File chunk 1 of 4:
{chunk_1_summary}

File chunk 2 of 4:
{chunk_2_summary}

Relevant full snippet:
{focused_code_snippet}
```

## 26.6 Prompt untuk Guardrail Keamanan

Prompt keamanan harus selalu ditambahkan saat ada file operation, shell command, patch, atau memory update.

```text
Safety rules:
- Do not read files matching secret patterns such as .env, *.pem, *.key, credentials, token, or private config.
- Do not suggest destructive commands without warning.
- Do not run shell commands automatically.
- Do not modify files unless the user enables apply mode.
- If a patch may break compatibility, warn the user.
- If the task involves credentials, authentication, or deployment, recommend local verification.
```

## 26.7 Prompt untuk Local Model Kecil

Karena model default adalah model kecil, prompt harus singkat dan tegas.

Aturan prompt untuk model 3B:

1. Jangan terlalu banyak instruksi berulang.
2. Gunakan format output tetap.
3. Batasi konteks.
4. Kirim hanya file yang relevan.
5. Gunakan bullet atau numbered list untuk hasil teknis.
6. Jangan meminta model melakukan terlalu banyak tugas sekaligus.

Contoh instruksi singkat untuk model 3B:

```text
Be concise. Focus on actionable coding help. Do not rewrite unrelated code.
```

## 26.8 Fitur Prompt Preset

NanoCLI perlu menyediakan prompt preset agar pengguna bisa memilih gaya kerja.

```bash
nanocli ask "buat auth service" --preset concise
nanocli review app.py --preset strict
nanocli debug app.py --preset step-by-step
nanocli plan "fitur login" --preset architect
```

Preset yang disarankan:

| Preset | Fungsi |
|---|---|
| concise | Jawaban singkat dan langsung |
| strict | Review ketat |
| architect | Analisis desain dan struktur |
| beginner | Penjelasan lebih sederhana |
| test-first | Fokus pada test sebelum implementasi |
| security | Fokus keamanan |
| performance | Fokus performa |

## 26.9 Fitur Custom Prompt

NanoCLI harus mendukung custom prompt global dan project-level.

Struktur:

```text
~/.nanocli/prompts/global.md
.nanocli/prompts/project.md
.nanocli/prompts/review.md
.nanocli/prompts/debug.md
.nanocli/prompts/test.md
```

Prioritas prompt:

```text
User prompt
> Command prompt
> Project prompt
> AGENTS.md
> Global prompt
> Core system prompt
```

Artinya, permintaan langsung pengguna tetap menjadi prioritas tertinggi selama tidak melanggar aturan keamanan.

## 26.10 Contoh Prompt Final untuk Review

```text
You are NanoCLI, a local AI coding assistant running inside a terminal.
You help review code safely and practically.

Project instructions:
- Use type hints.
- Keep CLI commands thin.
- Use pytest for testing.
- Do not modify files without confirmation.

Mode: REVIEW
Review the provided code for correctness, maintainability, security, performance, and consistency with the project.
Focus on real issues.
Do not rewrite the whole file unless requested.

Relevant project memory:
- This project uses Typer, Rich, Ollama, YAML config, and SQLite memory.
- Default model is qwen3.5:4b-q4_K_M.
- File reading logic should stay in files.py.

File context:
Path: nanocli/main.py
Language: Python

```python
{file_content}
```

User request:
Review this file and suggest improvements.

Output format:
1. Summary
2. Critical issues
3. Suggested improvements
4. Security notes
5. Test suggestions
```

## 26.11 Kesimpulan Desain Prompt

Prompt NanoCLI bisa dan sebaiknya disesuaikan seperti CLI coding modern. Elemen pentingnya adalah AGENTS.md, command-specific prompt, Project Memory, guardrail keamanan, dan prompt preset.

Dengan desain ini, NanoCLI akan terasa lebih mirip coding agent terminal, bukan chatbot biasa. Model lokal kecil tetap bisa bekerja cukup baik karena konteks yang dikirim sudah dipilih, diringkas, dan diarahkan dengan format yang jelas.

## 27. Continuation Controller dan Context Compaction

NanoCLI perlu memiliki sistem lanjutan untuk mengatasi dua masalah umum pada model lokal kecil.

Masalah pertama adalah output terpotong. Ini terjadi saat model belum selesai menjawab, tetapi batas output sudah habis. Dalam penggunaan manual, pengguna biasanya mengetik “lanjutkan”. NanoCLI harus dapat melakukan proses ini secara otomatis.

Masalah kedua adalah context terlalu penuh. Ini terjadi saat prompt, Project Memory, isi file, changelog, dan jawaban sebelumnya melebihi batas konteks model. Masalah ini tidak cukup diselesaikan dengan auto-lanjut. NanoCLI perlu merangkum dan memilih konteks yang paling relevan.

Karena itu, NanoCLI perlu memiliki dua fitur yang saling melengkapi:

1. Continuation Controller.
2. Context Compaction.

## 27.1 Continuation Controller

Continuation Controller adalah fitur untuk melanjutkan output model secara otomatis saat jawaban belum selesai.

Tujuan:

1. Mengurangi kebutuhan pengguna mengetik “lanjutkan”.
2. Mencegah jawaban terpotong di tengah kalimat.
3. Menjaga struktur jawaban tetap konsisten.
4. Membantu model lokal kecil menghasilkan output panjang secara bertahap.

### 27.1.1 Cara Kerja

NanoCLI menambahkan marker selesai pada prompt.

```text
When your answer is fully complete, end with:
[[NANOCLI_DONE]]
```

Setelah output selesai streaming, NanoCLI memeriksa apakah marker berikut muncul.

```text
[[NANOCLI_DONE]]
```

Jika marker belum muncul, NanoCLI mengirim prompt lanjutan otomatis.

```text
Continue the previous answer from the exact stopping point.
Do not repeat previous content.
Keep the same structure, numbering, and code block format.
Finish the remaining answer.
End with [[NANOCLI_DONE]] when complete.
```

Jika marker sudah muncul, NanoCLI menghapus marker dari output final sebelum ditampilkan ke pengguna.

### 27.1.2 Aturan Aman

Continuation Controller harus memiliki batas agar tidak looping.

Aturan default:

1. Maksimal 3 kali auto-continue.
2. Berhenti jika output mulai mengulang isi sebelumnya.
3. Berhenti jika model menghasilkan output kosong.
4. Berhenti jika model tidak melanjutkan struktur sebelumnya.
5. Berhenti jika command berisiko menulis file atau menjalankan shell.

Jika batas tercapai, NanoCLI menampilkan pesan:

```text
Output stopped after 3 continuation rounds. Use --continue to extend manually.
```

### 27.1.3 Command yang Mendukung Auto Continue

Auto Continue aktif secara default untuk:

1. `ask`
2. `chat`
3. `review`
4. `debug`
5. `test`
6. `plan`
7. `memory search`

Auto Continue harus dibatasi untuk:

1. `patch`
2. `patch --apply`
3. command yang menulis file
4. command yang menjalankan shell
5. command yang menghasilkan unified diff panjang

Untuk mode patch, NanoCLI boleh melakukan auto-continue hanya jika output masih berupa penjelasan. Jika output sedang berada di dalam blok diff, NanoCLI harus berhenti dan meminta pengguna menjalankan ulang dengan opsi `--long-output` atau `--split-patch`.

## 27.2 Context Compaction

Context Compaction adalah proses meringkas dan memilih ulang konteks ketika prompt terlalu panjang.

Tujuan:

1. Mencegah prompt dipotong diam-diam.
2. Menjaga informasi penting tetap masuk ke model.
3. Mengurangi beban model kecil.
4. Membuat jawaban tetap relevan walaupun proyek besar.

### 27.2.1 Cara Kerja

Pipeline Context Compaction:

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
Estimate context size
    |
    v
If too large, compact context
    |
    v
Keep only relevant memory chunks
    |
    v
Summarize older changelog
    |
    v
Keep focused code snippets
    |
    v
Send compact prompt to model
```

### 27.2.2 Prioritas Konteks

Jika context terlalu penuh, NanoCLI harus menjaga urutan prioritas berikut.

Prioritas tertinggi:

1. User request.
2. Command-specific prompt.
3. File target.
4. Error message, jika command debug.
5. AGENTS.md.

Prioritas menengah:

1. Project summary.
2. Coding style.
3. Relevant decisions.
4. Relevant file summaries.
5. Recent changelog.

Prioritas rendah:

1. Changelog lama.
2. Session lama.
3. Memory yang skor relevansinya rendah.
4. File yang tidak langsung berkaitan.
5. Penjelasan umum yang tidak diperlukan.

### 27.2.3 Strategi Compaction

NanoCLI menggunakan beberapa strategi berikut.

1. Summarize long memory.
2. Select top-k relevant chunks.
3. Keep only focused code snippets.
4. Remove duplicated context.
5. Remove low-relevance file summaries.
6. Compress old session logs.
7. Preserve user request exactly.
8. Preserve error message exactly.

Contoh ringkasan compaction:

```text
Context was compacted before sending to the model.
Kept:
- User request
- AGENTS.md
- Target file: auth.py
- Relevant memory chunks: 5
- Recent changelog: last 3 entries
Dropped:
- Old sessions
- Low relevance file summaries
- Changelog older than 30 days
```

## 27.3 Config Continuation dan Compaction

Tambahkan konfigurasi berikut ke `.nanocli/config.yaml`.

```yaml
continuation:
  enabled: true
  done_marker: "[[NANOCLI_DONE]]"
  max_rounds: 3
  stop_on_repetition: true
  preserve_format: true
  allow_for_patch: false
  show_notice: true

context_compaction:
  enabled: true
  warn_before_truncate: true
  never_truncate_user_request: true
  never_truncate_error_message: true
  max_project_memory_chunks: 5
  max_recent_changelog_items: 3
  summarize_old_memory: true
  show_compaction_summary: true
```

## 27.4 Prompt Tambahan untuk Continuation

NanoCLI perlu menambahkan instruksi ini pada mode yang mendukung auto continue.

```text
Completion rule:
If the answer is complete, end with [[NANOCLI_DONE]].
If the answer is not complete, stop naturally at a safe boundary.
Do not end with [[NANOCLI_DONE]] until all requested content is complete.
```

Prompt lanjutan:

```text
Continue from the exact stopping point of the previous answer.
Do not repeat previous content.
Do not restart the answer.
Maintain the same structure, numbering, and code block format.
If a code block was open, continue or close it correctly.
End with [[NANOCLI_DONE]] only when the full answer is complete.
```

## 27.5 Deteksi Output Terpotong

NanoCLI dapat mendeteksi output terpotong melalui beberapa sinyal.

1. Marker `[[NANOCLI_DONE]]` tidak muncul.
2. Output berhenti di tengah kalimat.
3. Output berhenti di tengah numbered list.
4. Output berhenti di dalam code block.
5. Output berhenti di tengah unified diff.
6. Output berhenti setelah frasa seperti “berikut”, “contoh”, “langkah selanjutnya”, atau “kode”.

Jika salah satu sinyal muncul, NanoCLI dapat memicu continuation selama belum melewati `max_rounds`.

## 27.6 Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Auto continue looping | Output terlalu panjang | Batasi max_rounds |
| Model mengulang jawaban | Membuat output membingungkan | Aktifkan stop_on_repetition |
| Format kode rusak | Kode sulit dipakai | Preserve code block format |
| Diff terpotong | Patch berisiko salah | Matikan auto continue untuk patch apply |
| Context makin penuh | Jawaban makin tidak stabil | Jalankan context compaction |
| User tidak tahu konteks diringkas | Kurang transparan | Tampilkan compaction summary |

## 27.7 Acceptance Criteria

Continuation Controller dianggap selesai jika:

1. NanoCLI dapat mendeteksi jawaban belum selesai.
2. NanoCLI otomatis melanjutkan output maksimal sesuai `max_rounds`.
3. NanoCLI tidak mengulang jawaban sebelumnya.
4. NanoCLI menjaga format list dan code block.
5. NanoCLI menghapus marker `[[NANOCLI_DONE]]` dari output final.
6. NanoCLI berhenti aman jika output tidak stabil.

Context Compaction dianggap selesai jika:

1. NanoCLI dapat menghitung estimasi panjang konteks.
2. NanoCLI tidak memotong user request.
3. NanoCLI tidak memotong error message.
4. NanoCLI memilih memory yang paling relevan.
5. NanoCLI meringkas memory lama.
6. NanoCLI memberi ringkasan konteks yang dipakai jika opsi `show_compaction_summary` aktif.

## 27.8 Kesimpulan Fitur

Continuation Controller dan Context Compaction wajib masuk ke NanoCLI karena target utama produk ini adalah model lokal kecil. Auto Continue menyelesaikan masalah output terpotong, sedangkan Context Compaction menyelesaikan masalah prompt terlalu panjang.

Keduanya membuat NanoCLI lebih nyaman dipakai untuk proyek besar tanpa harus memakai model besar yang berat untuk RTX 3050 4GB.



## 28. Sumber Teknis Model

Bagian ini mencatat sumber teknis yang digunakan untuk menentukan strategi model.

1. Ollama Library Qwen3.5: Qwen3.5 menyediakan varian 2B, 4B, 9B, 27B, 35B, dan 122B. Varian `qwen3.5:4b-q4_K_M` berukuran sekitar 3.4 GB dengan context window 256K. Varian `qwen3.5:9b-q4_K_M` berukuran sekitar 6.6 GB dengan context window 256K.
2. Ollama Library Qwen2.5-Coder: Qwen2.5-Coder adalah seri code-specific dengan ukuran 0.5B sampai 32B, dan digunakan sebagai fallback coding-specific.
3. Ollama Library nomic-embed-text: `nomic-embed-text` adalah model embedding dan hanya digunakan untuk menghasilkan embedding.
4. Ollama Context Length Documentation: context lebih besar membutuhkan memori lebih besar, sehingga NanoCLI harus mengontrol `num_ctx` berdasarkan hardware.
