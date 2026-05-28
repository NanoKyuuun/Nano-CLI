# Evaluasi Lengkap dan Rancangan Pengembangan NanoCLI

## Fokus Evaluasi

Dokumen ini berisi evaluasi menyeluruh terhadap NanoCLI berdasarkan struktur proyek yang telah dicek, terutama dari sisi:

1. kualitas UI/UX terminal;
2. kemampuan terminal interaktif;
3. kemampuan membuat dan mengubah file;
4. workflow agentik seperti OpenCode atau Codex;
5. desain agent loop;
6. desain file operation manager;
7. desain TUI atau terminal user interface;
8. prioritas implementasi;
9. contoh command;
10. contoh tampilan terminal;
11. roadmap teknis pengembangan.

Secara umum, NanoCLI sudah memiliki fondasi yang cukup baik sebagai AI assistant berbasis CLI. Namun, jika targetnya adalah menjadi **AI coding agent terminal-first** seperti OpenCode atau Codex CLI, NanoCLI masih perlu peningkatan signifikan pada lapisan workflow, interaktivitas, dan UI/UX terminal.

---

# 1. Ringkasan Penilaian Keseluruhan

## 1.1 Kondisi NanoCLI Saat Ini

NanoCLI saat ini sudah memiliki beberapa kemampuan penting, yaitu:

- command `chat`;
- command `ask`;
- command `review`;
- command `debug`;
- command `plan`;
- command `patch`;
- command `test`;
- command `search`;
- command `terminal detect`;
- command `terminal run`;
- memory project;
- model picker;
- OpenRouter integration;
- web search mode;
- safe file reader;
- sensitive file blocker;
- command risk analyzer;
- approval gate;
- audit logger;
- token budget manager;
- context compactor;
- basic terminal UI dengan `chalk`, `cli-table3`, dan `enquirer`.

**Update 2026-05-27:** Audit menyeluruh telah dilakukan dan seluruh bug kritis ditemukan serta diperbaiki:

- context compactor tidak lagi memotong history terlalu agresif;
- terminal bridge tidak lagi memunculkan false positive approval dialog;
- `stdin` conflict di feedback prompt telah diatasi;
- model metadata tidak lagi di-fetch ulang setiap command;
- risk level audit log kini akurat setelah command diedit;
- `secretRedactor` tidak lagi meredact Git SHA dan UUID;
- `sensitiveFileBlocker` tidak lagi memblokir file source code seperti `tokenBudgetManager.ts`;
- global error handler ditambahkan di entry point;
- dependency tree dibersihkan: `sqlite3` (tidak dipakai) dihapus, `@types/fs-extra` dipindah ke `devDependencies`.

Fondasi ini sudah cukup bagus untuk ukuran CLI assistant. Akan tetapi, pengalaman pengguna masih belum terasa seperti **agent coding CLI modern** karena alurnya masih terlalu manual.

## 1.2 Kelemahan Utama

Kelemahan utama NanoCLI dapat diringkas menjadi lima poin besar:

| Area | Kondisi Saat Ini | Masalah Utama | Dampak |
|---|---|---|---|
| Terminal | Bisa menjalankan command sekali jalan | Belum mendukung terminal interaktif/PTY | Tidak nyaman untuk `npm create vite`, `npx create-next-app`, `npm init`, dan wizard terminal lain |
| Agent Loop | AI bisa mengusulkan command | Belum otomatis lanjut setelah command selesai | User harus menyambung workflow secara manual |
| File Creation | Baru terbatas pada `test --write` | Belum ada file tool umum | Tidak bisa membuat PRD, implementation plan, task list, README, dan file proyek lain secara natural |
| Patch Apply | `patch` hanya memberi saran | Belum ada apply + diff preview | AI belum bisa benar-benar mengedit file secara aman |
| UI/UX | Ada box, table, warna, prompt | Belum ada TUI layout, stepper, diff panel, file proposal, session sidebar | Pengalaman belum selevel OpenCode/Codex |
| **Bug / Stabilitas** | **✅ Diperbaiki 2026-05-27** | **Semua 10 bug aktif + 3 dependency issue telah difix** | **Fondasi kini lebih stabil dan aman** |

## 1.3 Kesimpulan Awal

Saat ini NanoCLI lebih tepat disebut sebagai:

> AI coding assistant berbasis CLI.

Target yang lebih kuat seharusnya:

> Terminal-first AI coding agent yang bisa membaca proyek, menjalankan command, menulis file, menerapkan patch, menjalankan test, dan melanjutkan workflow secara interaktif dengan approval user.

---

# 2. Benchmark Konseptual: OpenCode dan Codex

## 2.1 Pelajaran dari OpenCode

OpenCode menempatkan TUI atau **terminal user interface** sebagai pengalaman utama. Pengguna cukup membuka direktori proyek dan menjalankan:

```bash
opencode
```

Lalu pengguna masuk ke sesi interaktif untuk bekerja dengan LLM di dalam proyek. Hal penting dari pendekatan OpenCode adalah:

- terminal menjadi workspace utama;
- ada sesi kerja yang berkelanjutan;
- pengguna dapat memberi prompt langsung di TUI;
- agent dapat membaca konteks proyek;
- workflow bersifat keyboard-driven;
- pengalaman tidak terasa seperti command satu kali jalan;
- pengguna tidak perlu pindah ke GUI untuk melakukan pekerjaan inti.

Pelajaran untuk NanoCLI:

> NanoCLI perlu berubah dari command-based assistant menjadi session-based TUI agent.

## 2.2 Pelajaran dari Codex CLI

Codex CLI diposisikan sebagai coding agent lokal yang dapat:

- membaca kode;
- mengubah kode;
- menjalankan kode;
- bekerja di dalam direktori yang dipilih;
- memakai approval mode;
- memakai sandbox mode;
- membedakan mode read-only, auto, dan full access;
- menampilkan approval untuk aksi tertentu;
- mendukung workflow agentik yang lebih kuat.

Pelajaran untuk NanoCLI:

> NanoCLI perlu punya permission mode yang jelas, bukan hanya command approval.

Contoh mode yang sebaiknya dimiliki NanoCLI:

```text
Read Only     : hanya baca file dan memberi saran
Workspace     : boleh edit file di project root dengan approval ringan
Trusted       : boleh menjalankan command tertentu dan edit file dalam project
Strict        : semua aksi harus approval
Full Access   : akses luas, hanya untuk user yang benar-benar paham risiko
```

## 2.3 Arah UI/UX yang Disarankan

NanoCLI tidak harus meniru OpenCode atau Codex secara identik. Namun, NanoCLI perlu mengambil prinsip UX-nya:

1. terminal menjadi ruang kerja utama;
2. ada sesi percakapan yang hidup;
3. ada panel status yang jelas;
4. agent dapat membaca, mengubah, dan menjalankan kode;
5. setiap aksi penting punya preview;
6. file diff harus terlihat sebelum apply;
7. command berisiko harus jelas risikonya;
8. workflow harus bisa berlanjut tanpa user mengetik ulang instruksi kecil-kecil.

---

# 3. Temuan Teknis dari Struktur NanoCLI Saat Ini

## 3.1 Command yang Sudah Ada

Dari struktur proyek, NanoCLI sudah memiliki command utama berikut:

```text
src/commands/ask.ts
src/commands/debug.ts
src/commands/patch.ts
src/commands/plan.ts
src/commands/review.ts
src/commands/search.ts
src/commands/terminal.ts
src/commands/test.ts
```

Ini menunjukkan bahwa struktur awal sudah modular.

## 3.2 Terminal Executor Masih Non-Interaktif

Pada bagian `src/terminal/commandExecutor.ts`, command dijalankan dengan `child_process.spawn` dan konfigurasi input:

```ts
stdio: ['ignore', 'pipe', 'pipe']
```

Artinya:

- stdin tidak digunakan;
- user tidak bisa mengirim input lanjutan;
- command interaktif tidak bisa berjalan nyaman;
- proses seperti wizard tidak bisa dikendalikan secara bertahap.

Command seperti ini cocok:

```bash
git status
npm test
npm run build
ls
pwd
```

Command seperti ini belum cocok:

```bash
npm create vite@latest
npx create-next-app@latest
npm init
npx shadcn@latest init
npx prisma init
```

## 3.3 ChatUI Sudah Punya Proposal Command

Pada `src/ui/chatUI.ts`, sudah ada mekanisme untuk membaca format seperti:

```json
{
  "type": "terminal.propose",
  "command": "npm test",
  "reason": "Menjalankan test setelah perubahan"
}
```

Ini bagus karena menjadi awal dari sistem agent tool call.

**Update 2026-05-27:** Terdapat bug kritis yang sudah diperbaiki pada mekanisme ini:

- **False positive terminal proposal** (BUG-03): Fallback parser sebelumnya mencari field `command` dari JSON block sembarangan. Jika AI memberi contoh JSON API yang kebetulan punya field `command`, approval dialog akan muncul padahal bukan proposal terminal. Sudah dihapus — Terminal Bridge kini **hanya aktif** untuk format eksplisit `terminal.propose`.
- **Stdin conflict** (BUG-02): `readline.createInterface` dibuat tapi tidak dipakai, menyebabkan konflik listener di stdin. Sudah diperbaiki dengan `stdin.once` yang auto-cleanup.

Namun, mekanisme ini belum cukup karena:

- hanya fokus pada terminal command;
- belum ada proposal file write;
- belum ada proposal file patch;
- belum ada proposal multi-step task;
- setelah command selesai, AI belum otomatis melanjutkan proses;
- belum ada agent loop eksplisit.

## 3.4 File Writing Baru Terbatas

Kemampuan menulis file baru terlihat pada command `test --write`.

Contoh:

```bash
nanocli test src/foo.ts --write
```

Namun, command lain seperti `plan` dan `patch` belum memiliki opsi:

```bash
--out
--write
--apply
--preview
--diff
```

Akibatnya, output AI masih berhenti di terminal dan belum menjadi artefak proyek.

## 3.5 UI Masih Basic

NanoCLI sudah memakai:

- `chalk`;
- `cli-table3`;
- `enquirer`;
- `marked`;
- `marked-terminal`.

Ini sudah cukup untuk membangun TUI sederhana. Namun, tampilan saat ini belum punya:

- layout area;
- session header;
- status bar;
- activity timeline;
- file proposal card;
- diff preview;
- command output folding;
- persistent task summary;
- mode indicator;
- permission indicator;
- shortcut hint;
- panel active task.

---

# 4. Target Produk Baru: NanoCLI sebagai Terminal Coding Agent

## 4.1 Positioning Baru

Positioning yang disarankan:

> NanoCLI adalah AI coding agent berbasis terminal yang dapat memahami proyek, menjalankan command, membuat file, menerapkan patch, menjalankan test, dan mengelola workflow pengembangan software secara interaktif dengan approval yang aman.

## 4.2 Prinsip Desain

NanoCLI sebaiknya mengikuti prinsip berikut:

1. **Terminal-first**  
   Semua workflow utama bisa dilakukan dari terminal.

2. **Session-based**  
   Pengguna tidak hanya menjalankan command satu kali, tetapi masuk ke sesi kerja.

3. **Agentic but controlled**  
   Agent boleh mengambil langkah, tetapi tetap dalam kontrol user.

4. **Preview before change**  
   Semua perubahan file harus bisa dipreview.

5. **Diff-first editing**  
   Perubahan kode sebaiknya ditampilkan sebagai diff sebelum diterapkan.

6. **Permission-aware**  
   User harus tahu agent sedang berada di mode read-only, workspace-write, atau full access.

7. **Keyboard-friendly**  
   TUI harus nyaman digunakan tanpa mouse.

8. **Project-aware**  
   Agent harus memahami struktur proyek, package manager, framework, config, dan file penting.

9. **Recoverable**  
   Perubahan harus bisa dibatalkan atau minimal punya backup.

10. **Auditable**  
    Semua command dan file operation penting harus tercatat.

---

# 5. Rancangan UI/UX Terminal Bergaya OpenCode/Codex

## 5.1 Tampilan Awal

Saat user menjalankan:

```bash
nanocli
```

Tampilan yang disarankan:

```text
╭─ NanoCLI ─────────────────────────────────────────────────────────────╮
│ AI Coding Agent for Terminal                                          │
├───────────────────────────────────────────────────────────────────────┤
│ Project      : NanoCLI                                                │
│ Path         : /Users/user/projects/nanocli                           │
│ Model        : openrouter/auto                                        │
│ Mode         : Workspace                                              │
│ Permission   : Ask before write & command                             │
│ Git Branch   : main                                                   │
│ Status       : Ready                                                  │
╰───────────────────────────────────────────────────────────────────────╯

Type your task below. Examples:
  › Buat PRD fitur login dan simpan ke docs/PRD-login.md
  › Review arsitektur proyek ini
  › Buat project React TypeScript baru
  › Fix error build lalu jalankan test

You ›
```

## 5.2 Layout Saat Agent Bekerja

Ketika user memberi instruksi:

```text
Buatkan PRD dan implementation plan untuk fitur login JWT.
```

Tampilan yang disarankan:

```text
╭─ Task ────────────────────────────────────────────────────────────────╮
│ Buatkan PRD dan implementation plan untuk fitur login JWT             │
╰───────────────────────────────────────────────────────────────────────╯

╭─ Agent Activity ──────────────────────────────────────────────────────╮
│ ● Reading project structure                                           │
│ ● Detecting tech stack                                                │
│ ● Drafting PRD                                                        │
│ ● Preparing file proposal                                             │
╰───────────────────────────────────────────────────────────────────────╯

╭─ File Proposals ──────────────────────────────────────────────────────╮
│ CREATE  docs/PRD-login.md                                             │
│ CREATE  docs/IMPLEMENTATION-login.md                                  │
╰───────────────────────────────────────────────────────────────────────╯

? Action:
  Preview files
  Write files
  Edit paths
  Cancel
```

## 5.3 File Proposal Preview

```text
╭─ File Preview: docs/PRD-login.md ─────────────────────────────────────╮
│ # PRD: Fitur Login JWT                                                │
│                                                                       │
│ ## 1. Background                                                      │
│ Sistem membutuhkan mekanisme autentikasi berbasis JWT...              │
│                                                                       │
│ ## 2. Goals                                                           │
│ - User dapat login menggunakan email dan password                     │
│ - Sistem menghasilkan access token                                    │
│ - Sistem mendukung refresh token                                      │
╰───────────────────────────────────────────────────────────────────────╯

? Apply this file?
  Write file
  Edit content
  Change path
  Skip
```

## 5.4 Diff Preview untuk Patch

Jika agent ingin mengubah file:

```text
╭─ Diff Preview: src/auth.ts ───────────────────────────────────────────╮
│ - const token = jwt.sign(payload, secret);                            │
│ + const token = jwt.sign(payload, secret, { expiresIn: '15m' });       │
│                                                                       │
│ - return token;                                                       │
│ + return { accessToken: token, refreshToken };                        │
╰───────────────────────────────────────────────────────────────────────╯

Risk: Medium
Reason: Modifies authentication logic

? Apply patch?
  Apply
  Edit patch
  Reject
  Explain first
```

## 5.5 Command Approval Card

```text
╭─ Command Proposal ────────────────────────────────────────────────────╮
│ Command : npm run build                                               │
│ CWD     : /Users/user/projects/nanocli                                │
│ Risk    : Low                                                         │
│ Reason  : Verify that generated files do not break the build          │
╰───────────────────────────────────────────────────────────────────────╯

? Run command?
  Allow once
  Always allow npm run build in this project
  Edit command
  Reject
```

## 5.6 Terminal Output Folding

Output command sering panjang. Sebaiknya NanoCLI tidak langsung membanjiri layar.

Contoh:

```text
╭─ Command Output: npm run build ───────────────────────────────────────╮
│ Status    : Failed                                                    │
│ Exit Code : 1                                                         │
│ Duration  : 4.2s                                                      │
│                                                                       │
│ Error Summary:                                                        │
│ src/ui/chatUI.ts:248:12 - Property 'writeFile' does not exist         │
│                                                                       │
│ [Show full output] [Ask agent to fix] [Copy error]                    │
╰───────────────────────────────────────────────────────────────────────╯
```

## 5.7 Final Summary

Setelah workflow selesai:

```text
╭─ Task Completed ──────────────────────────────────────────────────────╮
│ Created                                                               │
│   + docs/PRD-login.md                                                 │
│   + docs/IMPLEMENTATION-login.md                                      │
│                                                                       │
│ Checked                                                               │
│   ✓ Project structure detected                                        │
│   ✓ Auth flow planned                                                 │
│   ✓ Security risks documented                                         │
│                                                                       │
│ Next Suggestions                                                      │
│   1. Generate TASKS-login.md                                          │
│   2. Implement auth service                                           │
│   3. Add unit tests for token generation                              │
╰───────────────────────────────────────────────────────────────────────╯
```

---

# 6. Command UX yang Disarankan

## 6.1 Command Mode Lama Tetap Dipertahankan

Command lama tetap berguna:

```bash
nanocli ask "apa fungsi file ini?"
nanocli review src/index.ts
nanocli debug src/index.ts "error build"
nanocli plan "fitur login"
nanocli patch src/auth.ts "tambahkan validasi token"
nanocli test src/auth.ts --write
```

Namun command perlu diperluas.

## 6.2 Command Baru: `generate`

Command ini digunakan untuk membuat dokumen proyek.

```bash
nanocli generate prd "fitur login JWT" --out docs/PRD-login.md
nanocli generate implementation "fitur login JWT" --out docs/IMPLEMENTATION-login.md
nanocli generate tasks "fitur login JWT" --out docs/TASKS-login.md
nanocli generate readme --out README.md
nanocli generate api-spec "fitur auth" --out docs/API_SPEC-auth.md
nanocli generate test-plan "fitur login JWT" --out docs/TEST_PLAN-login.md
```

## 6.3 Command Baru: `new`

Command ini digunakan untuk membuat proyek baru dengan wizard.

```bash
nanocli new
```

Contoh wizard:

```text
? Project type
  React + Vite
  Next.js
  SvelteKit
  Express API
  NestJS API
  Node CLI
  Fullstack App

? Project name
  my-dashboard

? Language
  TypeScript
  JavaScript

? Package manager
  npm
  pnpm
  yarn
  bun

? Install dependencies now?
  Yes
  No
```

Setelah itu NanoCLI bisa menjalankan command yang sesuai:

```bash
npm create vite@latest my-dashboard -- --template react-ts
```

Untuk workflow yang membutuhkan input interaktif, gunakan PTY.

## 6.4 Command Baru: `write`

Command ini untuk menulis file dari prompt.

```bash
nanocli write docs/PRD-login.md "Buat PRD fitur login JWT"
```

Opsi:

```bash
--overwrite
--preview
--mode high
--template prd
```

## 6.5 Command Baru: `apply`

Command ini untuk menerapkan patch.

```bash
nanocli patch src/auth.ts "tambahkan expiresIn JWT" --apply
```

Atau:

```bash
nanocli apply last
```

## 6.6 Command Baru: `agent`

Command ini menjalankan workflow agentik multi-step.

```bash
nanocli agent "buat fitur login JWT lengkap dengan PRD, implementasi, test, dan build check"
```

Opsi:

```bash
--max-steps 8
--permission workspace
--approval on-request
--dry-run
```

## 6.7 Command Chat Mode Baru

Di dalam chat, tambahkan slash command:

```text
/help
/status
/permissions
/model
/context
/files
/run
/write
/patch
/apply
/diff
/new
/plan
/tasks
/undo
/audit
/clear
```

Contoh:

```text
/write docs/PRD-login.md buatkan PRD fitur login JWT
/patch src/auth.ts tambahkan refresh token
/apply last
/diff
/run npm test
/permissions read-only
```

---

# 7. Rancangan Agent Loop

## 7.1 Masalah Saat Ini

NanoCLI saat ini sudah bisa:

```text
User → AI → terminal.propose → approval → command run → output masuk konteks
```

Namun belum otomatis lanjut:

```text
output command → AI menganalisis output → mengambil langkah berikutnya
```

## 7.2 Agent Loop yang Disarankan

Alur baru:

```text
1. User memberi task
2. Agent membuat rencana awal
3. Agent menentukan tool/action
4. Jika perlu approval, tampilkan approval
5. Tool dijalankan
6. Hasil tool masuk ke context
7. Agent membaca hasil
8. Agent melanjutkan ke step berikutnya
9. Ulangi sampai selesai atau max step tercapai
10. Agent memberi final summary
```

## 7.3 Pseudocode

```ts
export class AgentLoop {
  async run(task: string, options: AgentLoopOptions) {
    const state = await this.createInitialState(task, options);

    for (let step = 1; step <= options.maxSteps; step++) {
      const response = await this.model.next(state.messages);

      if (response.type === 'final') {
        return this.renderFinal(response);
      }

      const action = this.toolRouter.parse(response);

      const approval = await this.approvalGate.review(action, state.permission);

      if (!approval.approved) {
        state.messages.push({
          role: 'tool',
          content: `Action rejected: ${approval.reason}`
        });
        continue;
      }

      const result = await this.stepRunner.run(action);

      state.messages.push({
        role: 'tool',
        content: this.formatToolResult(result)
      });

      await this.activityLog.record(action, result);
    }

    return this.renderMaxStepSummary(state);
  }
}
```

## 7.4 Tool Types

Agent sebaiknya tidak hanya mengenal `terminal.propose`, tetapi juga:

```ts
type AgentAction =
  | TerminalRunAction
  | TerminalSessionAction
  | FileReadAction
  | FileWriteAction
  | FilePatchAction
  | FileMkdirAction
  | ProjectInspectAction
  | DiffPreviewAction
  | TestRunAction
  | FinalAnswerAction;
```

Contoh JSON action:

```json
{
  "type": "file.write",
  "path": "docs/PRD-login.md",
  "content": "# PRD: Fitur Login JWT\n\n...",
  "mode": "create",
  "reason": "User meminta PRD fitur login"
}
```

Contoh terminal action:

```json
{
  "type": "terminal.run",
  "command": "npm run build",
  "cwd": ".",
  "reason": "Memastikan project tetap bisa build"
}
```

---

# 8. Rancangan Terminal Interaktif / PTY

## 8.1 Masalah Teknis

Saat ini terminal executor memakai:

```ts
stdio: ['ignore', 'pipe', 'pipe']
```

Untuk terminal interaktif, NanoCLI perlu menggunakan pseudo terminal.

Rekomendasi library:

```bash
npm install node-pty
```

## 8.2 Struktur Baru

Tambahkan file:

```text
src/terminal/terminalSession.ts
src/terminal/ptyManager.ts
src/terminal/sessionRegistry.ts
src/terminal/terminalRenderer.ts
```

## 8.3 Contoh Interface

```ts
export interface TerminalSession {
  id: string;
  command: string;
  cwd: string;
  status: 'running' | 'exited' | 'killed';
  output: string[];
  startedAt: Date;
  exitCode?: number;
}

export interface TerminalSessionManager {
  start(command: string, options: TerminalStartOptions): Promise<TerminalSession>;
  send(sessionId: string, input: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  stop(sessionId: string): Promise<void>;
  getOutput(sessionId: string): Promise<string>;
}
```

## 8.4 Contoh Penggunaan

```bash
nanocli terminal start "npm create vite@latest"
nanocli terminal send "my-app"
nanocli terminal send enter
nanocli terminal send down
nanocli terminal send enter
nanocli terminal stop
```

Namun untuk UX yang lebih baik, jangan minta user mengetik `terminal send`. Lebih baik buat wrapper:

```bash
nanocli new
```

## 8.5 TUI untuk Terminal Interaktif

```text
╭─ Interactive Terminal ────────────────────────────────────────────────╮
│ npm create vite@latest                                                │
├───────────────────────────────────────────────────────────────────────┤
│ ? Project name: my-app                                                │
│ ? Select a framework:                                                 │
│   Vanilla                                                             │
│ ❯ React                                                               │
│   Vue                                                                 │
│   Svelte                                                              │
│   Solid                                                               │
╰───────────────────────────────────────────────────────────────────────╯

Keys: ↑↓ move | Enter select | Esc cancel | Ctrl+C stop
```

---

# 9. Rancangan File Operation Manager

## 9.1 Tujuan

File Operation Manager bertugas mengelola semua operasi file secara aman.

Operasi yang perlu disediakan:

```text
file.read
file.write
file.patch
file.mkdir
file.rename
file.delete
file.diff
file.backup
```

## 9.2 Struktur File Baru

```text
src/file/fileOperationManager.ts
src/file/fileRiskAnalyzer.ts
src/file/fileApprovalGate.ts
src/file/diffPreview.ts
src/file/backupManager.ts
src/file/pathGuard.ts
src/file/fileTypes.ts
```

## 9.3 Interface

```ts
export interface FileWriteAction {
  type: 'file.write';
  path: string;
  content: string;
  mode: 'create' | 'overwrite' | 'append';
  reason: string;
}

export interface FilePatchAction {
  type: 'file.patch';
  path: string;
  patch: string;
  reason: string;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  action: string;
  diff?: string;
  backupPath?: string;
  error?: string;
}
```

## 9.4 Aturan Keamanan

File operation harus mematuhi aturan:

1. tidak boleh keluar dari project root;
2. tidak boleh menulis ke `.env` tanpa approval tinggi;
3. tidak boleh overwrite tanpa preview;
4. tidak boleh delete tanpa approval tinggi;
5. perubahan harus punya diff;
6. overwrite harus membuat backup;
7. semua operasi dicatat di audit log;
8. file besar harus diberi warning;
9. binary file tidak boleh diubah sembarangan;
10. hidden file tertentu harus dilindungi.

## 9.5 Protected Paths

```text
.env
.env.*
**/id_rsa
**/id_ed25519
**/*.pem
**/*.key
**/node_modules/**
**/.git/**
**/dist/**
**/build/**
**/.next/**
```

## 9.6 File Proposal Object

```json
{
  "type": "file.write",
  "path": "docs/PRD-login.md",
  "content": "# PRD: Fitur Login JWT\n\n...",
  "mode": "create",
  "reason": "Membuat dokumen PRD sesuai permintaan user",
  "risk": "medium"
}
```

---

# 10. Rancangan Permission Mode

## 10.1 Mode yang Disarankan

```text
read-only
strict
workspace
trusted
full-access
```

## 10.2 Penjelasan Mode

| Mode | File Read | File Write | Command | Network | Cocok untuk |
|---|---|---|---|---|---|
| read-only | Ya | Tidak | Tidak | Tidak | Review, tanya jawab, audit |
| strict | Dengan approval | Dengan approval | Dengan approval | Dengan approval | Default aman |
| workspace | Ya | Boleh di project root | Command low-risk boleh | Approval untuk network | Coding harian |
| trusted | Ya | Ya | Ya untuk command umum | Approval untuk high-risk | Repo pribadi yang dipercaya |
| full-access | Ya | Ya | Ya | Ya | Advanced user, risiko tinggi |

## 10.3 Command Permission

```bash
nanocli permissions
nanocli permissions read-only
nanocli permissions workspace
nanocli permissions strict
```

Dalam chat:

```text
/permissions
/permissions workspace
/permissions read-only
```

## 10.4 UI Permission Indicator

```text
Mode: Workspace | Approval: On Request | Sandbox: Project Root
```

Atau:

```text
Permission: Read Only
```

---

# 11. Rancangan Project Inspector

## 11.1 Tujuan

Sebelum agent membuat plan atau menulis file, NanoCLI perlu memahami proyek.

Project Inspector membaca:

```text
package.json
tsconfig.json
vite.config.*
next.config.*
svelte.config.*
src/
app/
pages/
components/
.env.example
README.md
```

## 11.2 Output Project Inspector

```json
{
  "projectName": "nanocli",
  "language": "TypeScript",
  "packageManager": "npm",
  "framework": "CLI / Node.js",
  "entryPoints": ["src/main.ts", "src/cli.ts"],
  "testFramework": "unknown",
  "buildCommand": "npm run build",
  "runCommand": "npm start",
  "hasGit": true,
  "importantFiles": [
    "src/cli.ts",
    "src/ui/chatUI.ts",
    "src/terminal/commandExecutor.ts"
  ]
}
```

## 11.3 Manfaat

Project Inspector membuat agent tidak asal memberi saran. Agent dapat menyesuaikan output dengan struktur proyek yang nyata.

---

# 12. Rancangan Generator Dokumen

## 12.1 Generator PRD

Command:

```bash
nanocli generate prd "fitur login JWT" --out docs/PRD-login.md
```

Struktur output:

```md
# PRD: Fitur Login JWT

## 1. Background
## 2. Problem Statement
## 3. Goals
## 4. Non-Goals
## 5. User Stories
## 6. Functional Requirements
## 7. Non-Functional Requirements
## 8. User Flow
## 9. Edge Cases
## 10. Security Considerations
## 11. Acceptance Criteria
## 12. Success Metrics
## 13. Open Questions
```

## 12.2 Generator Implementation Plan

Command:

```bash
nanocli generate implementation "fitur login JWT" --out docs/IMPLEMENTATION-login.md
```

Struktur:

```md
# Implementation Plan: Fitur Login JWT

## 1. Overview
## 2. Current Architecture
## 3. Proposed Architecture
## 4. Files to Create
## 5. Files to Modify
## 6. Step-by-Step Implementation
## 7. Data Model
## 8. API Design
## 9. Error Handling
## 10. Security
## 11. Testing Plan
## 12. Rollback Plan
```

## 12.3 Generator Task Breakdown

Command:

```bash
nanocli generate tasks "fitur login JWT" --out docs/TASKS-login.md
```

Struktur:

```md
# Task Breakdown: Fitur Login JWT

## Phase 1: Setup
- [ ] Create auth module
- [ ] Add JWT dependency
- [ ] Add environment config

## Phase 2: Backend Logic
- [ ] Implement login endpoint
- [ ] Implement token generation
- [ ] Implement refresh token

## Phase 3: Testing
- [ ] Unit test token service
- [ ] Integration test login flow

## Phase 4: Documentation
- [ ] Update README
- [ ] Add API documentation
```

## 12.4 Generator README

Command:

```bash
nanocli generate readme --out README.md
```

Struktur:

```md
# Project Name

## Overview
## Features
## Tech Stack
## Installation
## Environment Variables
## Development
## Testing
## Build
## Project Structure
## Usage
## Contribution
## License
```

---

# 13. Rancangan Patch System

## 13.1 Masalah Saat Ini

Command `patch` saat ini memberikan saran patch, tetapi belum menerapkannya ke file.

Target baru:

```bash
nanocli patch src/auth.ts "tambahkan expiresIn pada JWT" --apply
```

## 13.2 Alur Aman

```text
1. Baca file
2. Kirim file + instruksi ke AI
3. AI menghasilkan unified diff
4. NanoCLI validasi diff
5. NanoCLI tampilkan preview
6. User approve
7. NanoCLI backup file lama
8. NanoCLI apply patch
9. NanoCLI jalankan formatter jika tersedia
10. NanoCLI tampilkan summary
```

## 13.3 Diff Preview

```text
╭─ Diff: src/auth.ts ───────────────────────────────────────────────────╮
│ @@ -12,7 +12,10 @@                                                   │
│ - const token = jwt.sign(payload, secret);                            │
│ + const token = jwt.sign(payload, secret, { expiresIn: '15m' });       │
╰───────────────────────────────────────────────────────────────────────╯
```

## 13.4 Rollback

Tambahkan:

```bash
nanocli undo last
nanocli undo --id 2026-05-20-001
```

---

# 14. Rancangan Memory dan Session

## 14.1 Session Registry

Setiap sesi agent perlu punya ID.

```text
.nanocli/sessions/
  2026-05-20-login-jwt.json
  2026-05-20-fix-build.json
```

## 14.2 Isi Session

```json
{
  "id": "2026-05-20-login-jwt",
  "task": "Buat fitur login JWT",
  "startedAt": "2026-05-20T10:00:00Z",
  "status": "completed",
  "steps": [
    {
      "type": "file.write",
      "path": "docs/PRD-login.md",
      "status": "success"
    }
  ],
  "filesChanged": [
    "docs/PRD-login.md"
  ],
  "commandsRun": [
    "npm run build"
  ]
}
```

## 14.3 Command Session

```bash
nanocli sessions
nanocli resume 2026-05-20-login-jwt
nanocli session show last
```

Dalam chat:

```text
/sessions
/resume last
```

---

# 15. Rancangan Audit Log

## 15.1 Tujuan

Audit log penting karena NanoCLI menjalankan command dan menulis file.

Log disimpan di:

```text
.nanocli/audit.log
```

## 15.2 Format Log

```json
{
  "time": "2026-05-20T10:00:00Z",
  "action": "file.write",
  "path": "docs/PRD-login.md",
  "risk": "medium",
  "approved": true,
  "userAction": "allow_once"
}
```

## 15.3 Command Audit

```bash
nanocli audit
nanocli audit last
nanocli audit --json
```

---

# 16. Rancangan Status Bar dan Shortcut

## 16.1 Status Bar

```text
NanoCLI 1.1.0 | Model: GPT/OpenRouter Auto | Mode: Workspace | Branch: main | Tokens: 12.4k | Cost: $0.012
```

## 16.2 Shortcut

```text
Ctrl+C     Cancel current task
Ctrl+L     Clear screen
Ctrl+D     Exit
Tab        Autocomplete command
↑/↓        Navigate history
Ctrl+R     Search history
?          Show help
```

## 16.3 Quick Menu

```text
? What do you want to do?
  Ask about codebase
  Generate PRD
  Generate implementation plan
  Create new project
  Apply patch
  Run test
  Review changed files
  Change permission mode
```

---

# 17. Rancangan UI Component Internal

## 17.1 Component yang Perlu Ada

```text
HeaderPanel
StatusBar
TaskPanel
ActivityTimeline
CommandCard
FileProposalCard
DiffPanel
OutputPanel
ApprovalPrompt
SessionList
ModelPicker
PermissionPicker
ErrorSummaryPanel
FinalSummaryPanel
```

## 17.2 Struktur Folder

```text
src/ui/
  components/
    HeaderPanel.ts
    StatusBar.ts
    TaskPanel.ts
    ActivityTimeline.ts
    CommandCard.ts
    FileProposalCard.ts
    DiffPanel.ts
    OutputPanel.ts
    ApprovalPrompt.ts
    FinalSummaryPanel.ts
  render.ts
  chatUI.ts
  tui.ts
```

## 17.3 Pilihan Library TUI

Dengan dependencies sekarang, NanoCLI sudah bisa membuat UI terminal sederhana memakai:

```text
chalk
cli-table3
enquirer
marked-terminal
```

Namun, jika ingin TUI yang lebih mirip OpenCode/Codex, pertimbangkan:

```text
ink
react
node-pty
cli-highlight
diff
ora
boxen
terminal-kit
blessed
```

Rekomendasi praktis:

| Kebutuhan | Library |
|---|---|
| TUI React-style | Ink |
| PTY terminal interaktif | node-pty |
| Spinner/status | ora |
| Box layout | boxen atau custom renderer |
| Diff generation | diff |
| Syntax highlight | cli-highlight |
| Keyboard event lebih kuat | readline/prompts/terminal-kit |

Jika ingin tetap sederhana, gunakan library yang sudah ada dulu, lalu tambahkan `node-pty` dan `diff`.

---

# 18. Rancangan Data Flow Baru

## 18.1 Data Flow Agent

```text
User Input
  ↓
ChatUI / TUI
  ↓
AgentLoop
  ↓
PromptBuilder + ProjectInspector + Memory
  ↓
LLM
  ↓
ToolRouter
  ↓
ApprovalGate
  ↓
Tool Runner
  ├── Terminal Runner
  ├── File Operation Manager
  ├── Project Inspector
  └── Search Tool
  ↓
Tool Result
  ↓
AgentLoop
  ↓
Final Summary
```

## 18.2 ToolRouter

ToolRouter membaca output model dan memutuskan aksi.

```ts
export class ToolRouter {
  parse(response: string): AgentAction | FinalAnswer {
    // parse JSON tool call
    // validate schema with zod
    // fallback to final answer
  }
}
```

Gunakan `zod` karena dependency ini sudah ada.

---

# 19. Rancangan Schema Tool Call

## 19.1 Terminal Run

```ts
const TerminalRunSchema = z.object({
  type: z.literal('terminal.run'),
  command: z.string(),
  cwd: z.string().optional(),
  reason: z.string(),
});
```

## 19.2 File Write

```ts
const FileWriteSchema = z.object({
  type: z.literal('file.write'),
  path: z.string(),
  content: z.string(),
  mode: z.enum(['create', 'overwrite', 'append']),
  reason: z.string(),
});
```

## 19.3 File Patch

```ts
const FilePatchSchema = z.object({
  type: z.literal('file.patch'),
  path: z.string(),
  patch: z.string(),
  reason: z.string(),
});
```

## 19.4 Final Answer

```ts
const FinalAnswerSchema = z.object({
  type: z.literal('final'),
  summary: z.string(),
  filesChanged: z.array(z.string()).optional(),
  commandsRun: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
});
```

---

# 20. Rancangan Prompt System untuk Agent

## 20.1 System Prompt Baru

```text
You are NanoCLI, a terminal-first AI coding agent.

You can:
- inspect project files;
- propose terminal commands;
- propose file creation;
- propose file patches;
- generate documentation;
- run verification steps;
- summarize completed work.

Rules:
- Do not modify files without a file.write or file.patch action.
- Do not run commands without terminal.run action.
- Prefer small, reviewable changes.
- Always explain why an action is needed.
- When creating files, include complete content.
- When editing files, prefer unified diff.
- Stop when the task is complete.
```

## 20.2 Tool Call Format

```json
{
  "type": "file.write",
  "path": "docs/PRD-login.md",
  "content": "...",
  "mode": "create",
  "reason": "User asked to create PRD"
}
```

## 20.3 Final Format

```json
{
  "type": "final",
  "summary": "PRD and implementation plan created successfully.",
  "filesChanged": [
    "docs/PRD-login.md",
    "docs/IMPLEMENTATION-login.md"
  ],
  "commandsRun": [],
  "nextSteps": [
    "Generate task breakdown",
    "Start implementing auth module"
  ]
}
```

---

# 21. Roadmap Implementasi

## Phase 1 — File Operation Basic

Target:

- `file.write`;
- `file.read`;
- path guard;
- approval file write;
- command `nanocli write`;
- opsi `plan --out`;
- opsi `generate prd --out`.

Estimasi hasil:

> NanoCLI mulai bisa membuat file PRD, implementation plan, README, dan dokumen lain.

## Phase 2 — Diff dan Patch Apply

Target:

- unified diff parser;
- diff preview;
- backup manager;
- command `patch --apply`;
- command `undo last`.

Estimasi hasil:

> NanoCLI mulai bisa mengedit file kode secara aman.

## Phase 3 — Agent Loop

Target:

- AgentLoop;
- ToolRouter;
- StepRunner;
- max step;
- final summary;
- multi-step tool usage.

Estimasi hasil:

> NanoCLI mulai terasa sebagai agent, bukan hanya assistant.

## Phase 4 — Terminal Interaktif / PTY

Target:

- node-pty;
- terminal session manager;
- command `terminal start`;
- command `terminal send`;
- command `new`;
- interactive project creation.

Estimasi hasil:

> NanoCLI bisa membuat project baru dan menjalankan wizard terminal interaktif.

## Phase 5 — TUI Polish

Target:

- header panel;
- status bar;
- activity timeline;
- file proposal card;
- diff panel;
- command output folding;
- permission picker;
- session list.

Estimasi hasil:

> UI/UX NanoCLI mulai mendekati pengalaman OpenCode/Codex-style terminal agent.

## Phase 6 — Session, Audit, dan Recovery

Target:

- session registry;
- resume session;
- audit log viewer;
- rollback;
- task history.

Estimasi hasil:

> NanoCLI lebih aman, stabil, dan cocok untuk proyek nyata.

---

# 22. Prioritas Paling Penting

Jika harus memilih tiga hal saja, prioritasnya adalah:

## 1. FileOperationManager

Tanpa ini, NanoCLI tidak bisa menjadi coding agent yang produktif karena tidak bisa membuat dan mengubah file secara umum.

## 2. AgentLoop

Tanpa ini, workflow tetap terputus-putus dan user harus terus menyambung manual.

## 3. TerminalSession / PTY

Tanpa ini, NanoCLI tidak bisa menangani command interaktif, termasuk pembuatan project baru.

---

# 23. Contoh Implementasi Minimal Paling Cepat

## 23.1 Tambahkan Command `generate prd`

```bash
nanocli generate prd "fitur login JWT" --out docs/PRD-login.md
```

Minimal flow:

```text
1. Ambil prompt user
2. Bangun system prompt PRD
3. Generate markdown
4. Preview
5. Approval
6. Write file
```

## 23.2 Tambahkan Command `plan --out`

```bash
nanocli plan "fitur login JWT" --out docs/IMPLEMENTATION-login.md
```

## 23.3 Tambahkan Command `/write`

Dalam chat:

```text
/write docs/PRD.md buatkan PRD fitur login
```

## 23.4 Tambahkan File Write Approval

```text
File Write Proposal
Path: docs/PRD.md
Mode: create
Risk: medium

[Preview] [Write] [Edit Path] [Cancel]
```

---

# 24. Contoh Struktur Folder Setelah Improvement

```text
src/
  agent/
    agentLoop.ts
    toolRouter.ts
    stepRunner.ts
    agentTypes.ts

  file/
    fileOperationManager.ts
    fileRiskAnalyzer.ts
    fileApprovalGate.ts
    pathGuard.ts
    diffPreview.ts
    backupManager.ts
    fileTypes.ts

  terminal/
    commandExecutor.ts
    terminalSession.ts
    ptyManager.ts
    sessionRegistry.ts
    shellDetector.ts

  generators/
    prdGenerator.ts
    implementationGenerator.ts
    taskGenerator.ts
    readmeGenerator.ts
    apiSpecGenerator.ts

  project/
    projectInspector.ts
    packageManagerDetector.ts
    frameworkDetector.ts

  ui/
    chatUI.ts
    tui.ts
    render.ts
    components/
      HeaderPanel.ts
      StatusBar.ts
      ActivityTimeline.ts
      CommandCard.ts
      FileProposalCard.ts
      DiffPanel.ts
      FinalSummaryPanel.ts

  security/
    approvalGate.ts
    commandRiskAnalyzer.ts
    fileRiskAnalyzer.ts
    policyEngine.ts
    auditLogger.ts
```

---

# 25. Contoh User Journey Ideal

## 25.1 Membuat Dokumen PRD

User:

```text
Buatkan PRD untuk fitur login JWT dan simpan ke docs/PRD-login.md
```

NanoCLI:

```text
● Reading project context
● Drafting PRD
● Preparing file proposal

CREATE docs/PRD-login.md

? Action:
  Preview
  Write
  Edit path
  Cancel
```

User memilih `Write`.

NanoCLI:

```text
✓ File created: docs/PRD-login.md

Next:
1. Generate implementation plan
2. Generate task breakdown
3. Start implementation
```

## 25.2 Membuat Project Baru

User:

```text
/new
```

NanoCLI:

```text
? Project type: React + Vite
? Project name: admin-dashboard
? Language: TypeScript
? Package manager: npm
? Install dependencies now? Yes
```

NanoCLI menjalankan:

```bash
npm create vite@latest admin-dashboard -- --template react-ts
cd admin-dashboard
npm install
```

Lalu:

```text
✓ Project created
✓ Dependencies installed
✓ Build command detected: npm run build

Next:
1. Generate README
2. Generate PRD
3. Create dashboard layout
```

## 25.3 Fix Error Build

User:

```text
Fix error build di project ini.
```

NanoCLI:

```text
● Running npm run build
● Reading error output
● Inspecting src/ui/chatUI.ts
● Preparing patch
```

Preview:

```text
MODIFY src/ui/chatUI.ts
```

User approve.

NanoCLI:

```text
✓ Patch applied
● Running npm run build again
✓ Build successful
```

Final:

```text
Task completed.
Changed:
- src/ui/chatUI.ts

Verified:
- npm run build success
```

---

# 26. Acceptance Criteria

NanoCLI bisa dianggap naik kelas menjadi agent CLI yang baik jika memenuhi kriteria berikut:

## 26.1 File Creation

- user bisa meminta pembuatan PRD;
- user bisa meminta implementation plan;
- user bisa meminta README;
- user bisa menentukan path output;
- NanoCLI menampilkan preview;
- NanoCLI meminta approval sebelum menulis file;
- file berhasil dibuat di project root.

## 26.2 Patch Apply

- user bisa meminta perubahan file;
- NanoCLI menampilkan diff;
- user bisa approve atau reject;
- patch diterapkan ke file;
- backup dibuat sebelum overwrite;
- ada summary perubahan.

## 26.3 Agent Loop

- agent bisa menjalankan lebih dari satu step;
- agent bisa membaca hasil command;
- agent bisa lanjut memperbaiki;
- ada batas max step;
- user bisa stop.

## 26.4 Terminal Interaktif

- NanoCLI bisa menjalankan command interaktif;
- user bisa memilih opsi wizard;
- pembuatan project baru bisa dilakukan dari CLI;
- output tidak merusak tampilan.

## 26.5 UI/UX

- ada header project;
- ada status bar;
- ada activity timeline;
- ada command proposal card;
- ada file proposal card;
- ada diff preview;
- ada final summary;
- shortcut jelas.

---

# 27. Risiko Pengembangan

## 27.1 Risiko Over-Automation

Jika agent terlalu bebas, agent bisa mengubah file di luar scope. Solusi:

- gunakan permission mode;
- gunakan approval;
- gunakan max step;
- gunakan path guard;
- gunakan audit log.

## 27.2 Risiko Command Berbahaya

Command seperti ini perlu diblokir atau diberi risk tinggi:

```bash
rm -rf
sudo
curl | bash
wget | bash
chmod -R 777
git reset --hard
git clean -fd
```

## 27.3 Risiko File Overwrite

Solusi:

- selalu preview;
- selalu backup;
- jangan overwrite tanpa approval;
- gunakan diff.

## 27.4 Risiko Context Salah

Agent bisa salah memahami proyek. Solusi:

- project inspector;
- file mention;
- context summary;
- user confirmation untuk perubahan besar.

---

# 28. Rekomendasi Final

NanoCLI sebaiknya tidak langsung menambah terlalu banyak command kecil. Fokus utama harus pada engine inti.

Urutan pengembangan paling tepat:

```text
1. FileOperationManager
2. Generate command untuk PRD/implementation/tasks
3. Patch apply dengan diff preview
4. AgentLoop multi-step
5. TerminalSession berbasis PTY
6. TUI polish
7. Session resume dan audit viewer
```

Dengan urutan ini, NanoCLI akan berkembang secara stabil dari:

> CLI assistant yang menjawab dan memberi saran

menjadi:

> AI coding agent berbasis terminal yang benar-benar bisa membantu membuat, mengubah, menguji, dan mendokumentasikan proyek.

---

# 29. Kesimpulan Akhir

Penilaian awal bahwa UI/UX NanoCLI belum maksimal adalah benar. Kekurangan paling terasa bukan pada model AI-nya, tetapi pada **lapisan pengalaman kerja**.

NanoCLI sudah punya fondasi:

```text
chat
ask
review
debug
plan
patch
test
terminal run
memory
security approval
```

Namun belum punya fondasi agentik utama:

```text
agent loop
file write manager
patch apply manager
interactive terminal session
diff preview
file proposal UI
session workflow
permission mode
```

Jika targetnya adalah pengalaman seperti OpenCode atau Codex, maka NanoCLI perlu diarahkan ke konsep:

```text
terminal-first
session-based
permission-aware
diff-first
file-capable
agent-loop-driven
```

Tiga komponen yang paling menentukan adalah:

```text
1. AgentLoop
2. TerminalSession / PTY
3. FileOperationManager
```

Jika tiga komponen ini berhasil dibangun, NanoCLI akan naik kelas secara signifikan dan mulai terasa sebagai coding agent modern, bukan sekadar assistant CLI.

---

# 30. Referensi Pembanding

Referensi berikut digunakan sebagai pembanding konseptual untuk arah UI/UX dan agent workflow:

1. OpenCode Documentation — TUI  
   https://opencode.ai/docs/tui/

2. OpenCode Documentation — Intro  
   https://opencode.ai/docs/

3. OpenAI Developers — Codex CLI  
   https://developers.openai.com/codex/cli

4. OpenAI Developers — Codex CLI Features  
   https://developers.openai.com/codex/cli/features

5. OpenAI Developers — Codex Agent Approvals & Security  
   https://developers.openai.com/codex/agent-approvals-security

6. OpenAI Developers — Codex Configuration Reference  
   https://developers.openai.com/codex/config-reference

---

# 31. Log Audit dan Bug Fix

> Bagian ini mencatat hasil audit kode dan perbaikan bug yang telah diselesaikan. Bagian ini akan terus diperbarui seiring perkembangan project.

## 31.1 Audit Menyeluruh — 2026-05-27

Audit kode menyeluruh dilakukan terhadap seluruh modul NanoCLI. Ditemukan **10 bug aktif**, **3 masalah dependency**, dan **1 masalah arsitektur**. Semua telah diperbaiki dan diverifikasi dengan TypeScript compiler (0 error, 0 warning).

### Bug Aktif yang Diperbaiki

| ID | File | Masalah | Dampak Sebelum Fix |
|---|---|---|---|
| BUG-01 | `contextCompactor.ts` | Loop `break` terlalu agresif saat ada pesan besar | Context percakapan terpotong lebih dari yang diperlukan |
| BUG-02 | `chatUI.ts` | `readline.createInterface` dibuat tapi tidak dipakai, conflict dengan `stdin.on` | Potensi crash di feedback prompt pada beberapa platform |
| BUG-03 | `chatUI.ts` | Fallback parser JSON block memunculkan approval dialog untuk JSON apapun yang punya field `command` | False positive terminal proposal — dialog muncul saat AI menjelaskan struktur API |
| BUG-04 | `memoryManager.ts` | Regex function extraction terlalu broad — menangkap method calls, keyword, dan constructor calls | Noise di FTS5 index, kualitas RAG search menurun |
| BUG-05 | `modelManager.ts` | Tidak ada in-memory cache — `getModel()` trigger disk/network setiap pemanggilan | Latency tambahan di setiap command, potensi failure cascade jika API key tidak valid |
| BUG-06 | `policyEngine.ts` | Risk level di return value dan audit log menggunakan risk original, bukan risk dari command yang diedit | Audit log mencatat level risk yang tidak akurat |
| BUG-07 | `patch.ts` | `require('path')` inline di dalam async method | Anti-pattern TypeScript, inkonsistensi dengan modul lain |
| BUG-08 | `cli.ts` | `process.exit(0)` saat API key tidak ada — exit code menandakan sukses | Script CI/CD tidak dapat mendeteksi kondisi error ini |
| BUG-09 | `secretRedactor.ts` | Threshold hex token 32 chars meredact Git SHA (40 chars), UUID (32 chars), MD5 hash | File kode yang mengandung Git SHA/UUID dikirim ke LLM dengan konten ter-redact |
| WARN-06 | `sensitiveFileBlocker.ts` | Pattern `/token/i` memblokir file source code seperti `tokenBudgetManager.ts`, `tokenizer.ts` | User tidak bisa melakukan `nanocli review tokenizer.ts` — error misleading |

### Masalah Dependency yang Diperbaiki

| ID | File | Masalah | Fix |
|---|---|---|---|
| DEP-01 | `package.json` | `@types/fs-extra` di `dependencies` bukan `devDependencies` | Dipindah ke `devDependencies` |
| DEP-03 | `package.json` | `sqlite3` terinstall padahal tidak digunakan (hanya `better-sqlite3` yang dipakai) | Dihapus dari dependencies |

### Masalah Arsitektur yang Diperbaiki

| ID | File | Masalah | Fix |
|---|---|---|---|
| ARCH-02 | `main.ts` | Tidak ada global error handler — crash menampilkan stack trace mentah | Ditambahkan `.catch()` handler dengan pesan informatif dan `DEBUG` env flag |

## 31.2 Bug yang Masih Dicatat sebagai Warning (Non-Kritis)

Beberapa isu non-kritis dicatat namun belum memerlukan perbaikan segera:

| ID | File | Masalah | Status |
|---|---|---|---|
| WARN-01 | `chatUI.ts` | Catch-all `break` pada chat loop menelan error yang seharusnya di-log | Terdaftar untuk perbaikan di iterasi berikutnya |
| WARN-02 | `commandRiskAnalyzer.ts` | Pattern `\bsu\s` tidak match `su-` dan terlalu broad untuk beberapa edge case | Perlu review aturan risiko secara menyeluruh saat Phase Security Hardening |
| WARN-04 | `tokenBudgetManager.ts` | `getStats()` tidak menggunakan `getBudgetForModel()` — footer chat tidak konsisten dengan budget sebenarnya | Akan diperbaiki saat TUI status bar diimplementasi |
| ARCH-01 | `cli.ts` | 14 instance dibuat di module scope saat startup — memperlambat cold start untuk command sederhana | Akan ditangani saat refactor ke lazy initialization |
| ARCH-03 | Seluruh project | Zero unit test — modul security kritis belum ada coverage sama sekali | Prioritas tinggi saat phase testing ditambahkan ke roadmap |

## 31.3 Status Keamanan Setelah Fix

Setelah audit dan perbaikan, status keamanan NanoCLI:

```text
✅ PolicyEngine      : Analisis risiko selalu dijalankan sebelum eksekusi
✅ Risk Level        : Akurat setelah command diedit oleh user
✅ SecretRedactor    : Tidak lagi meredact kode biasa yang mengandung hex/UUID
✅ SensitiveFileBlocker : Tidak lagi memblokir file source code yang aman
✅ AuditLogger       : Semua keputusan security tercatat dengan data yang benar
✅ Terminal Bridge   : Hanya aktif untuk format eksplisit terminal.propose
✅ Global Error Handler : Crash ditangani dengan pesan yang informatif
```

## 31.4 Pelajaran dari Audit untuk Pengembangan Selanjutnya

Beberapa pola masalah yang ditemukan perlu dijadikan acuan saat membangun fitur baru:

1. **Regex terlalu broad adalah risiko tersembunyi.** Pattern di `secretRedactor` dan `sensitiveFileBlocker` tadinya terlalu umum. Setiap pattern baru harus diuji dengan edge case seperti file source code, UUID, dan Git SHA.

2. **False positive lebih berbahaya dari false negative pada approval system.** Jika approval dialog muncul terlalu sering untuk alasan yang tidak valid, user akan mulai mengabaikannya — ini disebut "approval fatigue". Setiap trigger approval harus dipertimbangkan matang.

3. **In-memory cache harus disertakan dari awal.** `ModelManager` yang selalu fetch ke disk/network adalah performance issue yang tidak terlihat sampai diprofil. Untuk semua manager dengan data mahal, tambahkan cache dari awal.

4. **Exit code bukan detail kecil.** `process.exit(0)` vs `process.exit(1)` penting untuk kompatibilitas dengan script, CI/CD, dan tools seperti `make`. Selalu gunakan exit code yang benar.

5. **Kompilasi TypeScript adalah test minimum.** Project ini tidak memiliki unit test, sehingga TypeScript strict mode menjadi safety net pertama. Pertahankan selalu di 0 error.

