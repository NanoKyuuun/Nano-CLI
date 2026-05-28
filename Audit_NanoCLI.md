# Audit Teknis NanoCLI

**Project:** NanoCLI  
**Fokus audit:** context management, retrieval, tool system, streaming response, CLI UI/UX, memory, system prompt, orchestration, confirmation flow, dan context handling.  
**Status umum:** advanced prototype, belum production-ready.

---

## 1. Ringkasan Eksekutif

NanoCLI sudah memiliki fondasi yang cukup kuat sebagai CLI agent. Project ini bukan sekadar wrapper LLM sederhana. Struktur kode sudah menunjukkan arah yang serius karena terdapat agent loop, prompt builder, memory SQLite, retrieval, terminal bridge, file approval, streaming response, dan backend RAG.

Secara build, project terlihat stabil. TypeScript dapat dikompilasi, CLI dapat dijalankan, dan server Python tidak menunjukkan masalah sintaks dasar. Namun, beberapa bagian penting masih perlu diperkuat sebelum NanoCLI dipakai secara luas atau dirilis sebagai tool publik.

Masalah utama terdapat pada empat area:

1. Validitas format pesan agent ke LLM.
2. Keamanan eksekusi terminal dan file operation.
3. Akurasi context budgeting dan cost guard.
4. Konsistensi orchestration antara model, tool, approval, dan runtime action.

**Kesimpulan:** NanoCLI layak disebut prototype kuat. Untuk penggunaan pribadi, NanoCLI sudah cukup layak. Untuk penggunaan publik, perlu hardening terlebih dahulu.

---

## 2. Status Pemeriksaan Build

| Pemeriksaan | Hasil |
|---|---|
| Struktur project | Terbaca normal |
| Instalasi dependency | Berhasil |
| Build TypeScript | Berhasil |
| CLI help command | Berhasil |
| Python server compile check | Berhasil |
| Test suite | Belum tersedia secara serius |

Catatan penting: tidak ditemukan masalah kompilasi besar. Risiko utama lebih banyak muncul pada desain runtime, flow keamanan, dan integrasi agent-tool.

---

## 3. Skor Audit per Aspek

| Aspek | Nilai | Status |
|---|---:|---|
| Context management | 7/10 | Bagus, tetapi budgeting belum menghitung RAG context secara akurat |
| Retrieval | 6.5/10 | Cukup baik, tetapi local semantic retrieval belum matang |
| Tool system | 6/10 | Fondasi ada, tetapi format role tool berisiko runtime error |
| Streaming response | 7.5/10 | Stabil, tetapi usage dan parse error belum ideal |
| CLI UI/UX | 8/10 | Salah satu bagian paling kuat |
| Memory | 7/10 | Bagus, tetapi lifecycle dan deduplikasi belum matang |
| System prompt | 7/10 | Kuat, tetapi terlalu berat dan perlu disederhanakan |
| Orchestration | 6/10 | Ada agent loop, tetapi permission dan tool result handling belum aman |
| Confirmation flow | 7/10 | Sudah baik, tetapi masih ada bypass approval |
| Context handling | 7/10 | Cukup matang, tetapi context injection masih bisa tumpang tindih |

**Nilai keseluruhan:** 7/10

---

# 4. Audit Detail per Aspek

## 4.1 Context Management

### Kekuatan

NanoCLI sudah memiliki beberapa komponen penting untuk mengelola konteks:

- `ContextCompactor`
- `TokenBudgetManager`
- summarization fallback
- project context dari `.nanocli`
- mode-aware budget
- auto-injection file context

Struktur ini menunjukkan bahwa NanoCLI sudah memikirkan masalah context window sejak awal. Ini penting untuk CLI agent karena percakapan, file, memory, dan hasil tool dapat cepat membesar.

### Kelemahan

Beberapa kelemahan utama:

1. Context dari RAG bersifat ephemeral, tetapi belum dihitung secara akurat dalam cost guard.
2. Logging usage belum selalu menghitung pesan final yang benar-benar dikirim ke model.
3. Token footer bisa tidak selaras dengan kapasitas model aktual.
4. Context dari file, memory, RAG, dan system prompt dapat saling menumpuk.

### Risiko

Jika context yang dikirim lebih besar daripada yang dihitung oleh guard, NanoCLI dapat mengalami:

- biaya API lebih tinggi dari estimasi,
- request gagal karena token melebihi batas,
- kualitas jawaban turun karena konteks terlalu padat,
- bagian penting dari percakapan terpotong.

### Rekomendasi

Di `src/ui/chatUI.ts`, pastikan cost guard memakai pesan final yang benar-benar dikirim.

Kode bermasalah:

```ts
await this.checkCostGuard(compactedMessages);
```

Rekomendasi:

```ts
await this.checkCostGuard(messagesToSend);
```

Hal yang sama sebaiknya diterapkan pada logging usage.

---

## 4.2 Retrieval

### Kekuatan

Retrieval NanoCLI sudah memiliki beberapa lapisan:

- SQLite FTS5
- project file indexing
- memory entry search
- remote semantic search melalui self-host RAG server
- redaction sebelum context dikirim ke LLM

Ini sudah cukup baik untuk prototype CLI agent.

### Kelemahan

Retrieval lokal masih terbatas karena:

1. Pencarian lokal lebih kuat pada summary dan path, belum full-content semantic.
2. File indexing masih memakai heuristic summary, bukan embedding lokal.
3. Query planner belum selalu memaksa domain, filter, atau boundary pencarian.
4. Search decision masih rule-based dan bisa salah membaca intent user.

### Rekomendasi Arsitektur Retrieval

Untuk CLI coding agent, retrieval idealnya memiliki tiga lapis:

| Lapisan | Fungsi |
|---|---|
| Keyword search | Mencari path, nama file, symbol, error message |
| Full-text search | Mencari isi file secara cepat |
| Semantic search | Mencari konteks berdasarkan makna atau intent user |

NanoCLI sudah cukup baik di keyword search dan sebagian full-text search. Semantic search baru kuat jika self-host RAG aktif.

### Rekomendasi Implementasi

Tambahkan ranking gabungan:

```ts
type RetrievalScore = {
  pathScore: number;
  keywordScore: number;
  semanticScore: number;
  recencyScore: number;
  finalScore: number;
};
```

Formula awal:

```ts
finalScore =
  pathScore * 0.25 +
  keywordScore * 0.30 +
  semanticScore * 0.35 +
  recencyScore * 0.10;
```

---

## 4.3 Tool System

### Kekuatan

NanoCLI sudah memiliki komponen penting seperti:

- `ToolRouter`
- `StepRunner`
- `PolicyEngine`
- `CommandRiskAnalyzer`
- `FileOperationManager`
- `PathGuard`
- validasi schema action

Desain ini sudah benar. Tool tidak dicampur langsung ke UI, tetapi dipisah ke layer khusus.

### Masalah Kritis

Ada potensi masalah besar pada format pesan agent.

`AgentState.messages` mengizinkan role:

```ts
type AgentRole = 'user' | 'assistant' | 'system' | 'tool';
```

Namun `OpenRouterClient.Message` hanya menerima:

```ts
type MessageRole = 'system' | 'user' | 'assistant';
```

Jika role `tool` dikirim ke OpenRouter tanpa format tool call yang valid, request dapat gagal saat runtime.

### Risiko

Risiko dari masalah ini:

- agent loop gagal saat tool result dikirim ulang,
- LLM tidak memahami hasil tool dengan benar,
- API menolak request,
- TypeScript build tetap lolos karena ada type cast.

### Rekomendasi

Jangan kirim role `tool` langsung ke OpenRouter. Ubah hasil tool menjadi role `user` atau `system`.

Contoh sederhana:

```ts
state.messages.push({
  role: 'user',
  content: `[Tool result]\n${result.output}`
});
```

Atau:

```ts
state.messages.push({
  role: 'system',
  content: `Tool execution result:\n${result.output}`
});
```

Untuk versi lebih matang, buat adapter khusus:

```ts
function normalizeAgentMessagesForLLM(messages: AgentMessage[]): Message[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: `[Tool result]\n${message.content}`
      };
    }

    return {
      role: message.role,
      content: message.content
    };
  });
}
```

---

## 4.4 Streaming Response

### Kekuatan

Streaming response sudah cukup baik karena:

- memakai Axios stream,
- parsing SSE berbasis buffer,
- output mengalir langsung ke terminal,
- ada fallback saat stream gagal.

### Kelemahan

Masih ada beberapa kekurangan:

1. JSON parse error pada stream cenderung diabaikan.
2. Actual usage tidak selalu ditangkap.
3. Banyak caller tidak mengirim `onUsage`.
4. Estimasi biaya dan usage aktual belum dipisahkan secara jelas.

### Rekomendasi

Pisahkan usage menjadi dua jenis:

```ts
type UsageReport = {
  estimated: {
    promptTokens: number;
    completionTokens: number;
    cost: number;
  };
  actual?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
};
```

Tambahkan debug mode untuk stream parse error:

```ts
if (isDebugMode) {
  console.warn('Failed to parse stream chunk:', chunk);
}
```

---

## 4.5 CLI UI/UX

### Kekuatan

CLI UI/UX adalah salah satu bagian terbaik NanoCLI. Fitur yang sudah tersedia cukup lengkap:

- `/help`
- `/clear`
- `/compact`
- `/mode`
- `/model`
- `/memory`
- `/run`
- `/agent`
- token footer
- mode switching
- terminal bridge
- feedback collector
- onboarding API key

Default behavior tanpa argumen juga sudah baik karena langsung masuk ke chat UI.

### Kelemahan

Beberapa masalah UX:

1. Double confirmation pada terminal proposal.
2. Preview create file belum selalu cukup jelas.
3. Agent action interception dapat menjalankan ulang task awal, bukan action yang sudah dihasilkan.
4. `/ls` dapat membaca direktori absolut di luar project.

### Rekomendasi

#### Hilangkan double confirmation

Satu action cukup memiliki satu approval yang kuat. Jangan minta persetujuan di UI, lalu minta ulang di eksekutor.

#### Perkuat file preview

Untuk create file, tampilkan:

- path file,
- ukuran file,
- ringkasan isi,
- preview awal,
- konfirmasi eksplisit.

#### Jangan rerun task jika action sudah tersedia

Jika model sudah menghasilkan structured action, langsung eksekusi action itu melalui approval flow. Jangan jalankan agent loop ulang dari prompt awal.

---

## 4.6 Memory

### Kekuatan

Memory NanoCLI cukup baik untuk prototype:

- `.nanocli` workspace memory
- `PROJECT_CONTEXT.md`
- `AGENTS.md`
- SQLite database
- FTS memory entries
- feedback storage
- remote memory sync
- secret redaction

### Kelemahan

Memory belum memiliki lifecycle yang matang.

Kelemahan utama:

1. Belum ada TTL.
2. Belum ada pinned memory.
3. Belum ada confidence score.
4. Belum ada source tracking yang kuat.
5. Belum ada conflict resolution.
6. Belum ada deduplikasi memory yang matang.

### Rekomendasi Struktur Memory

Gunakan struktur seperti berikut:

```ts
type MemoryEntry = {
  id: string;
  scope: 'project' | 'user' | 'session';
  kind: 'preference' | 'fact' | 'decision' | 'constraint' | 'feedback';
  content: string;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  expiresAt?: string;
};
```

### Rekomendasi Command Memory

Tambahkan command:

```txt
/memory list
/memory add
/memory pin
/memory forget
/memory search
/memory conflicts
```

---

## 4.7 System Prompt

### Kekuatan

System prompt NanoCLI cukup kuat. Prompt sudah mencakup:

- aturan bahasa,
- mode behavior,
- terminal bridge policy,
- file editing policy,
- project context,
- memory context,
- environment context.

### Kelemahan

Prompt terlalu berat dan beberapa instruksi perlu dipindah ke policy code.

Masalah penting: agent prompt meminta model menjelaskan reasoning sebelum JSON block.

Contoh instruksi yang perlu dihindari:

```txt
Explain your reasoning BEFORE the JSON block.
```

Untuk agent CLI, instruksi seperti ini kurang ideal karena dapat membuat output lebih panjang dan kurang stabil.

### Rekomendasi

Ganti menjadi:

```txt
Briefly state the action purpose before the JSON block.
```

Atau dalam versi Indonesia:

```txt
Tuliskan tujuan aksi secara singkat sebelum blok JSON. Jangan tampilkan penalaran panjang.
```

### Prinsip Prompt yang Lebih Aman

System prompt sebaiknya:

1. pendek,
2. deterministik,
3. tidak mengulang aturan yang sudah dijaga oleh code,
4. fokus pada output format,
5. tidak meminta reasoning panjang.

---

## 4.8 Orchestration

### Kekuatan

NanoCLI sudah memiliki orchestration layer:

- `AgentLoop`
- `StepRunner`
- `ToolRouter`
- max steps
- final action
- compaction dalam agent loop
- terminal dan file execution flow

### Kelemahan

Masalah utama:

1. Role `tool` belum aman dikirim ke model.
2. Permission mode belum benar-benar membatasi action.
3. Agent terminal cwd bisa keluar dari project root.
4. Failure recovery masih sederhana.
5. Belum ada verify step setelah patch atau command execution.

### Rekomendasi Permission Mode

Buat mode permission eksplisit:

| Mode | Perilaku |
|---|---|
| `readonly` | Hanya boleh read, search, dan inspect |
| `workspace` | Boleh write dan run command hanya di project root |
| `full` | Boleh akses luar workspace, tetapi wajib approval eksplisit |

Contoh type:

```ts
type AgentPermissionMode = 'readonly' | 'workspace' | 'full';
```

### Rekomendasi Verify Step

Setelah action besar, agent sebaiknya melakukan verifikasi.

Contoh:

```ts
type AgentStep =
  | { type: 'inspect'; query: string }
  | { type: 'edit'; filePath: string; patch: string }
  | { type: 'run'; command: string; cwd?: string }
  | { type: 'verify'; command: string; expected: string }
  | { type: 'final'; response: string };
```

---

## 4.9 Confirmation Flow

### Kekuatan

Confirmation flow sudah lebih aman dibanding banyak CLI agent lain.

Kekuatan utama:

- terminal command dianalisis risikonya,
- high-risk command butuh approval,
- blocked command ditolak,
- file write dan patch lewat approval,
- ada backup,
- ada diff stats,
- ada sensitive file guard.

### Masalah Kritis

Ada bypass approval pada command test.

Di `src/commands/test.ts`, file test ditulis langsung:

```ts
fs.writeFile(testPath, testCode)
```

Ini melewati:

- `FileOperationManager`,
- approval,
- backup,
- risk analysis,
- file proposal UI.

### Rekomendasi

Semua operasi tulis file harus melewati `FileOperationManager`.

Contoh arah perbaikan:

```ts
await this.fileManager.writeFile({
  filePath: testPath,
  content: testCode,
  operation: overwrite ? 'overwrite' : 'create',
  reason: 'Generate test file from NanoCLI test command'
});
```

Nama method perlu disesuaikan dengan implementasi aktual `FileOperationManager`.

---

## 4.10 Context Handling

### Kekuatan

NanoCLI sudah cukup baik dalam context handling karena dapat:

- membaca file yang disebut user,
- menolak file sensitif,
- membatasi ukuran file,
- menambahkan RAG context secara ephemeral,
- menjaga project context,
- menyediakan compact command.

### Kelemahan

Masalah yang perlu diperbaiki:

1. RAG context belum masuk cost guard.
2. Context injection bisa tumpang tindih.
3. `/read` belum selalu memakai safe file reader.
4. Binary detection belum konsisten di semua jalur baca file.
5. File tree otomatis bisa terlalu besar untuk project besar.

### Rekomendasi

Buat context priority system:

```ts
type ContextBlock = {
  source: 'system' | 'memory' | 'project' | 'file' | 'rag' | 'tool';
  priority: number;
  tokenEstimate: number;
  content: string;
};
```

Lalu pilih context berdasarkan prioritas dan budget:

```ts
const selectedBlocks = selectContextBlocks({
  blocks,
  maxTokens,
  strategy: 'priority_then_recency'
});
```

---

# 5. Temuan Kritis yang Harus Diprioritaskan

## Prioritas 1: Perbaiki Role `tool` pada Agent Loop

**File terkait:**

```txt
src/agent/agentLoop.ts
src/agent/agentTypes.ts
src/llm/openrouterClient.ts
```

**Masalah:** agent menyimpan role `tool`, tetapi OpenRouter client tidak mendukung role itu secara valid.

**Dampak:** agent bisa gagal runtime atau request ditolak API.

**Solusi:** convert tool result menjadi role `user` atau `system` sebelum dikirim ke model.

---

## Prioritas 2: Validasi `cwd` Terminal Agar Tidak Keluar Project

**File terkait:**

```txt
src/agent/stepRunner.ts
src/commands/terminal.ts
```

Tambahkan validasi:

```ts
const effectiveCwd = path.resolve(this.projectRoot, action.cwd ?? '.');
const relative = path.relative(this.projectRoot, effectiveCwd);

if (relative.startsWith('..') || path.isAbsolute(relative)) {
  throw new Error('Command cwd is outside the project workspace');
}
```

---

## Prioritas 3: Jangan Tampilkan Raw Terminal Output Sebelum Redaction

**File terkait:**

```txt
src/terminal/commandExecutor.ts
```

**Masalah:** output live dari stdout dan stderr bisa tampil sebelum proses redaction.

**Dampak:** secret atau token dapat muncul di terminal.

**Solusi:** redact per baris sebelum render, atau buffer output untuk agent command.

---

## Prioritas 4: Semua Write Harus Lewat FileOperationManager

**File bermasalah:**

```txt
src/commands/test.ts
```

**Masalah:** `fs.writeFile` dipakai langsung.

**Solusi:** arahkan semua operasi tulis ke `FileOperationManager`.

---

## Prioritas 5: Backend RAG Jangan Aktif Tanpa API Key

**File terkait:**

```txt
nanocli-server/api/main.py
```

Tambahkan fail-fast:

```py
if ENABLE_RAG and not API_KEY:
    raise RuntimeError("API_KEY is required when ENABLE_RAG=true")
```

---

## Prioritas 6: Hitung Cost Berdasarkan Pesan Final

**File terkait:**

```txt
src/ui/chatUI.ts
```

Gunakan `messagesToSend`, bukan hanya `compactedMessages`.

---

# 6. Roadmap Perbaikan

## Tahap 1: Stabilkan Agent Core

Fokus pekerjaan:

- hapus role `tool` dari request LLM,
- validasi cwd,
- implementasikan permission mode,
- tambahkan readonly mode,
- buat agent result format yang konsisten.

Target hasil:

- agent tidak gagal karena format message,
- command tidak bisa keluar workspace tanpa izin,
- tool result terbaca jelas oleh model.

---

## Tahap 2: Amankan Terminal dan File Operation

Fokus pekerjaan:

- semua file write wajib melalui approval,
- live terminal output harus melalui redaction,
- command risk analyzer diperkuat,
- command network seperti `curl`, `wget`, `scp`, `rsync`, dan `ssh` diklasifikasikan lebih ketat.

Target hasil:

- risiko secret leak turun,
- operasi destruktif lebih terkendali,
- user punya kontrol eksplisit atas perubahan project.

---

## Tahap 3: Perkuat Retrieval

Fokus pekerjaan:

- full-content FTS,
- local embeddings opsional,
- symbol-aware search untuk TypeScript dan Python,
- ranking gabungan: path match, keyword, semantic, dan recency.

Target hasil:

- agent lebih akurat menemukan file dan konteks,
- jawaban coding lebih grounded,
- noise retrieval berkurang.

---

## Tahap 4: Rapikan UX

Fokus pekerjaan:

- hilangkan double confirmation,
- tampilkan preview file baru sebelum approve,
- jangan rerun agent saat action sudah muncul,
- buat command `/doctor` untuk cek konfigurasi NanoCLI.

Target hasil:

- flow lebih pendek,
- user lebih mudah memahami action agent,
- error konfigurasi lebih cepat ditemukan.

---

## Tahap 5: Tambahkan Test Suite

Minimal test untuk:

- `ToolRouter`
- `PathGuard`
- `CommandRiskAnalyzer`
- `ContextCompactor`
- `MemoryManager`
- `SearchDecisionEngine`
- `FileOperationManager`
- `AgentLoop`

Target hasil:

- refactor lebih aman,
- bug runtime lebih cepat terdeteksi,
- release lebih stabil.

---

# 7. Checklist Implementasi Cepat

## Security

- [ ] Validasi semua cwd agar tetap di project root.
- [ ] Redact terminal output sebelum tampil.
- [ ] Blok command berisiko tinggi secara konsisten.
- [ ] Semua file write wajib melalui approval flow.
- [ ] Backend RAG wajib API key saat aktif.

## Agent

- [ ] Jangan kirim role `tool` langsung ke LLM.
- [ ] Tambahkan message normalizer untuk agent messages.
- [ ] Tambahkan readonly permission mode.
- [ ] Tambahkan verify step setelah edit atau command.
- [ ] Batasi max retry per tool.

## Context

- [ ] Hitung RAG context dalam cost guard.
- [ ] Hitung usage berdasarkan messages final.
- [ ] Tambahkan context priority system.
- [ ] Kurangi duplikasi antara memory, file context, dan RAG.
- [ ] Batasi auto file tree pada project besar.

## Retrieval

- [ ] Tambahkan full-content FTS.
- [ ] Tambahkan local semantic retrieval opsional.
- [ ] Tambahkan symbol-aware search.
- [ ] Buat ranking gabungan.
- [ ] Log retrieval result untuk debugging.

## UX

- [ ] Hilangkan double confirmation.
- [ ] Tambahkan preview file baru.
- [ ] Tambahkan `/doctor`.
- [ ] Tambahkan `/permissions`.
- [ ] Tampilkan status model, mode, dan budget secara ringkas.

## Test

- [ ] Unit test untuk path guard.
- [ ] Unit test untuk command risk analyzer.
- [ ] Unit test untuk file approval.
- [ ] Unit test untuk context compaction.
- [ ] Integration test untuk agent loop sederhana.

---

# 8. Saran Struktur Issue GitHub

Jika NanoCLI memakai GitHub Issues, perbaikan dapat dipecah seperti ini:

## Issue 1: Normalize agent tool messages before LLM call

**Label:** bug, agent, high-priority  
**Deskripsi:** Tool result saat ini berpotensi dikirim sebagai role `tool` ke LLM client yang hanya menerima role `system`, `user`, dan `assistant`.

**Acceptance criteria:**

- role `tool` tidak pernah dikirim langsung ke OpenRouter client,
- semua tool result dikonversi menjadi message yang valid,
- agent loop tetap dapat membaca hasil tool pada step berikutnya.

---

## Issue 2: Enforce workspace boundary for terminal cwd

**Label:** security, terminal, high-priority  
**Deskripsi:** `cwd` command harus divalidasi agar tidak keluar dari project root.

**Acceptance criteria:**

- command dengan `../../` ditolak dalam workspace mode,
- absolute path di luar project root ditolak,
- error message jelas untuk user.

---

## Issue 3: Route all file writes through FileOperationManager

**Label:** security, file-system, high-priority  
**Deskripsi:** Semua file write harus melewati approval, backup, dan diff preview.

**Acceptance criteria:**

- tidak ada `fs.writeFile` langsung untuk operasi user-facing,
- command test memakai file approval flow,
- file baru menampilkan preview sebelum approval.

---

## Issue 4: Include RAG context in cost guard and usage logging

**Label:** context, cost, medium-priority  
**Deskripsi:** Cost guard harus menghitung final messages yang benar-benar dikirim ke model.

**Acceptance criteria:**

- `messagesToSend` digunakan untuk cost guard,
- usage log mencatat RAG context,
- token footer tidak menyesatkan.

---

## Issue 5: Add NanoCLI doctor command

**Label:** ux, cli, medium-priority  
**Deskripsi:** Tambahkan command `/doctor` untuk mengecek konfigurasi project.

**Acceptance criteria:**

- cek API key,
- cek model config,
- cek self-host server,
- cek `.nanocli`,
- cek permission mode,
- tampilkan rekomendasi perbaikan.

---

# 9. Kesimpulan Akhir

NanoCLI sudah berada di jalur yang benar. Project ini memiliki struktur yang lebih matang daripada CLI LLM sederhana karena sudah memisahkan agent, tool, memory, prompt, retrieval, terminal, dan UI.

Kelebihan utama NanoCLI adalah UI terminal yang cukup lengkap, integrasi memory yang sudah dipikirkan, serta adanya terminal bridge dan file approval. Kekurangan utamanya ada pada konsistensi runtime agent, keamanan eksekusi command, validasi boundary workspace, dan cost/context accounting.

Dengan memperbaiki enam prioritas utama, NanoCLI dapat naik dari advanced prototype menjadi CLI agent yang jauh lebih aman, stabil, dan layak dikembangkan sebagai produk open-source atau internal developer tool.
