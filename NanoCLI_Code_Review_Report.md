# Laporan Review Teknis NanoCLI

**Project:** NanoCLI  
**File yang diperiksa:** `NanoCLI.zip`  
**Tanggal review:** 18 Mei 2026  
**Jenis audit:** Static code review, arsitektur CLI, integrasi OpenRouter, token/cost handling, dan potensi bug runtime.

> Catatan batasan: review ini dilakukan dari source code di ZIP. Saya tidak menjalankan `npm install`, `npm run build`, atau request API nyata ke OpenRouter. Jadi temuan di bawah adalah hasil audit statis berbasis struktur dan implementasi kode.

---

## 1. Ringkasan Eksekutif

NanoCLI sudah punya pondasi MVP yang cukup kuat. Project ini bukan sekadar CLI kosong, karena sudah memiliki command utama, interactive chat, OpenRouter client, token budget manager, local memory, model picker, cost tracking, dan context builder.

Namun, untuk target sebagai CLI modern seperti `opencode` atau coding assistant terminal yang hemat token, project ini masih perlu penguatan pada lima area utama:

1. **Konsistensi mode config**, terutama `extra-high`.
2. **Keamanan credential dan file access**.
3. **Reliabilitas streaming response OpenRouter**.
4. **Token compression yang saat ini masih berupa pruning, belum semantic compression**.
5. **Cost tracking yang masih estimasi, belum berbasis usage aktual API**.

**Penilaian sementara:**

| Aspek | Nilai | Catatan |
|---|---:|---|
| Struktur project | 7/10 | Sudah modular, tapi masih bisa dipisah lebih bersih antara CLI, provider, context, config, dan memory. |
| MVP usability | 7/10 | Sudah bisa dipakai untuk ask/chat/review/debug/test/plan/patch. |
| Keamanan | 4/10 | API key plaintext lokal, file luar project bisa dibaca, `.env` bisa ikut terkirim. |
| Token efficiency | 5/10 | Ada budget dan compactor, tapi masih memangkas pesan, belum benar-benar mengompres konteks. |
| OpenRouter integration | 6/10 | Basic chat dan stream sudah ada, tapi fallback, usage aktual, dan parser SSE belum matang. |
| Kesiapan publik | 5/10 | Perlu hardening sebelum dipakai banyak user. |

---

## 2. Struktur Project Saat Ini

Struktur utama yang ditemukan:

```txt
NanoCLI/
├─ src/
│  ├─ main.ts
│  ├─ cli.ts
│  ├─ commands/
│  │  ├─ ask.ts
│  │  ├─ debug.ts
│  │  ├─ patch.ts
│  │  ├─ plan.ts
│  │  ├─ review.ts
│  │  └─ test.ts
│  ├─ context/
│  │  └─ contextCompactor.ts
│  ├─ files/
│  │  └─ configManager.ts
│  ├─ llm/
│  │  ├─ modelManager.ts
│  │  └─ openrouterClient.ts
│  ├─ memory/
│  │  ├─ indexer.ts
│  │  ├─ memoryManager.ts
│  │  └─ schema.ts
│  ├─ prompts/
│  │  └─ promptBuilder.ts
│  ├─ tokens/
│  │  ├─ statsManager.ts
│  │  └─ tokenBudgetManager.ts
│  └─ ui/
│     ├─ chatUI.ts
│     ├─ modelPickerUI.ts
│     ├─ render.ts
│     └─ setupUI.ts
├─ package.json
├─ package-lock.json
└─ tsconfig.json
```

### Bagian yang sudah bagus

- `src/main.ts` sudah menjadi entry point dengan shebang `#!/usr/bin/env node`.
- `src/cli.ts` sudah memakai `commander` dan memiliki command cukup lengkap.
- Command dipisah ke folder `src/commands`.
- OpenRouter diisolasi di `src/llm/openrouterClient.ts`.
- Token dan biaya dipisah di `src/tokens`.
- Memory lokal sudah mulai dibangun dengan SQLite FTS5.
- Prompt context sudah punya awareness terhadap file tree, `package.json`, `tsconfig.json`, `README.md`, dan file penting lain.

---

## 3. Bug dan Risiko Prioritas Tinggi

## 3.1 Bug fatal: mode `extra-high` tidak konsisten

**Lokasi:**

- `src/files/configManager.ts:13-18`
- `src/files/configManager.ts:133-138`
- `src/cli.ts`, `src/ui/chatUI.ts`, `src/tokens/tokenBudgetManager.ts`

Di interface config, mode ditulis sebagai:

```ts
models: {
  fast: { id: string; fallback: string[] };
  normal: { id: string; fallback: string[] };
  high: { id: string; fallback: string[] };
  extraHigh: { id: string; fallback: string[] };
};
```

Tetapi command CLI dan token budget memakai string:

```ts
'extra-high'
```

Default config juga memakai:

```ts
extraHigh: { id: 'openrouter/auto', fallback: [] }
```

Akibatnya, saat user menjalankan:

```bash
nanocli ask "buat arsitektur" --mode extra-high
```

method ini berisiko crash:

```ts
async getModelForMode(mode: string): Promise<string> {
  const config = await this.getConfig();
  const defaultConfig = this.getDefaultConfig();
  const modelConfig = (config.models as any)?.[mode] || (defaultConfig.models as any)[mode];
  return modelConfig.id;
}
```

Karena `(defaultConfig.models as any)['extra-high']` tidak ada.

### Fix yang disarankan

Buat tipe mode tunggal:

```ts
export const VALID_MODES = ['fast', 'normal', 'high', 'extra-high'] as const;
export type NanoMode = typeof VALID_MODES[number];

export interface ModelConfig {
  id: string;
  fallback: string[];
}

export interface Config {
  provider: {
    name: string;
    baseUrl: string;
    apiKeyEnv: string;
    stream: boolean;
    timeoutMs: number;
  };
  models: Record<NanoMode, ModelConfig>;
  chat: {
    defaultMode: NanoMode;
    openChatWhenNoArgs: boolean;
    saveSessions: boolean;
  };
}
```

Lalu ubah default config menjadi:

```ts
models: {
  fast: { id: 'openrouter/free', fallback: ['openrouter/auto'] },
  normal: { id: 'openrouter/auto', fallback: ['openrouter/free'] },
  high: { id: 'openrouter/auto', fallback: [] },
  'extra-high': { id: 'openrouter/auto', fallback: [] }
}
```

---

## 3.2 `isFirstRun()` bermasalah untuk user yang pakai ENV key

**Lokasi:** `src/files/configManager.ts:118-122`

Kode saat ini:

```ts
async isFirstRun(): Promise<boolean> {
  const configExists = await fs.pathExists(this.configPath);
  const hasApiKey = !!(await this.getApiKey());
  return !configExists || !hasApiKey;
}
```

Masalahnya, jika user sudah punya environment variable:

```bash
export OPENROUTER_API_KEY="xxx"
```

tetapi belum punya `.nanocli/config.json`, NanoCLI tetap dianggap first run.

### Dampak

Command seperti ini bisa tetap diblokir:

```bash
nanocli ask "hello"
```

Padahal API key sudah tersedia dari environment variable.

### Fix minimal

```ts
async isFirstRun(): Promise<boolean> {
  const hasApiKey = !!(await this.getApiKey());
  return !hasApiKey;
}
```

### Fix lebih rapi

Saat setup mode env dipilih dan env key terdeteksi, simpan default config jika belum ada:

```ts
public async setupEnvKey() {
  console.log(chalk.blue('\nInstruksi Environment Variable:'));
  console.log(chalk.white('1. Tambahkan ke shell profile Anda (.bashrc, .zshrc, dll):'));
  console.log(chalk.cyan('   export OPENROUTER_API_KEY="your_key_here"'));
  console.log(chalk.white('2. Restart terminal Anda.'));

  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    const currentConfig = await this.configManager.getConfig();
    if (Object.keys(currentConfig).length === 0) {
      await this.configManager.saveConfig(this.configManager.getDefaultConfig());
    }
    console.log(chalk.green('\n✔ OPENROUTER_API_KEY terdeteksi dan default config dibuat.'));
  } else {
    console.log(chalk.yellow('\n! OPENROUTER_API_KEY belum terdeteksi di sesi ini.'));
  }
}
```

---

## 3.3 Validasi mode belum merata

**Lokasi:**

- `src/commands/ask.ts:28-31`
- `src/commands/review.ts`
- `src/commands/debug.ts`
- `src/commands/test.ts:27-31`
- `src/commands/plan.ts`
- `src/commands/patch.ts`
- `src/ui/chatUI.ts:37-40`

Contoh di `ask.ts`:

```ts
const mode = options.mode || 'normal';
const apiKey = await this.configManager.getApiKey();
let modelId = options.model || await this.configManager.getModelForMode(mode);
```

Jika user mengetik:

```bash
nanocli ask "halo" --mode salah
```

maka `getModelForMode('salah')` bisa mengembalikan `undefined`, lalu crash di `.id`.

### Fix

Buat file baru:

```txt
src/config/modes.ts
```

Isi:

```ts
export const VALID_MODES = ['fast', 'normal', 'high', 'extra-high'] as const;
export type NanoMode = typeof VALID_MODES[number];

export function isValidMode(mode: string): mode is NanoMode {
  return VALID_MODES.includes(mode as NanoMode);
}
```

Lalu di setiap command:

```ts
if (!isValidMode(mode)) {
  Renderer.printStatus(`Mode tidak valid. Pilih: ${VALID_MODES.join(', ')}`, 'error');
  return;
}
```

---

## 3.4 Fallback model ada di config, tetapi belum digunakan

**Lokasi:**

- `src/files/configManager.ts:133-138`
- `src/llm/openrouterClient.ts:8-15`
- semua command yang memanggil `client.streamChat({ model: modelId, ... })`

Config sudah menyediakan fallback:

```ts
fast: { id: 'openrouter/free', fallback: ['openrouter/auto'] },
normal: { id: 'openrouter/auto', fallback: ['openrouter/free'] },
```

Tetapi request ke OpenRouter masih memakai:

```ts
{
  model: modelId,
  messages: compactedMessages,
  stream: true
}
```

Menurut dokumentasi OpenRouter, fallback model bisa digunakan dengan mengirim array `models` berisi model prioritas. Jika model pertama error, OpenRouter mencoba model berikutnya. Referensi: https://openrouter.ai/docs/guides/routing/model-fallbacks

### Fix desain

Update `ChatOptions`:

```ts
export interface ChatOptions {
  model?: string;
  models?: string[];
  messages: Message[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}
```

Tambahkan method config:

```ts
async getModelConfigForMode(mode: NanoMode): Promise<ModelConfig> {
  const config = await this.getConfig();
  const defaultConfig = this.getDefaultConfig();
  return config.models?.[mode] || defaultConfig.models[mode];
}
```

Saat request:

```ts
const modelConfig = await this.configManager.getModelConfigForMode(mode);

const payload = modelConfig.fallback.length > 0
  ? {
      models: [modelConfig.id, ...modelConfig.fallback],
      messages: compactedMessages,
      stream: true
    }
  : {
      model: modelConfig.id,
      messages: compactedMessages,
      stream: true
    };
```

---

## 3.5 Streaming parser rawan kehilangan chunk

**Lokasi:** `src/llm/openrouterClient.ts:71-96`

Kode saat ini:

```ts
for await (const chunk of response.data) {
  const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
  for (const line of lines) {
    const message = line.replace(/^data: /, '');
    if (message === '[DONE]') return;
    try {
      const parsed = JSON.parse(message);
      const content = parsed.choices[0]?.delta?.content;
      if (content) yield content;
    } catch (e) {
      // Ignore parse errors for incomplete chunks
    }
  }
}
```

Masalahnya, SSE chunk dari network bisa terpotong di tengah JSON. Jika parsing gagal, data saat ini langsung diabaikan. Ini bisa menyebabkan output hilang sebagian.

OpenRouter memakai SSE untuk streaming, dan dokumentasinya menyebut bahwa stream juga dapat berisi comment payload yang perlu diabaikan. Referensi: https://openrouter.ai/docs/api/reference/streaming dan https://openrouter.ai/docs/api/reference/overview

### Fix minimal dengan buffer

```ts
async *streamChat(options: ChatOptions): AsyncGenerator<string> {
  try {
    const response = await this.client.post(
      '/chat/completions',
      { ...options, stream: true },
      {
        headers: this.getHeaders(),
        responseType: 'stream',
        timeout: 120000
      }
    );

    let buffer = '';

    for await (const chunk of response.data) {
      buffer += chunk.toString('utf8');

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Dengan buffer, error parsing seharusnya jauh lebih jarang.
          // Jangan throw agar stream tidak langsung mati.
        }
      }
    }
  } catch (error: any) {
    this.handleError(error);
    throw error;
  }
}
```

### Fix lebih profesional

Tambahkan dependency:

```bash
npm install eventsource-parser
```

Lalu gunakan parser SSE khusus. Library ini memang dibuat untuk parsing Server-Sent Events dari stream. Referensi: https://github.com/rexxars/eventsource-parser

---

## 3.6 API key disimpan plaintext di folder project

**Lokasi:**

- `src/files/configManager.ts:33-36`
- `src/files/configManager.ts:92-104`

Saat ini credential disimpan di:

```txt
.nanocli/.credentials.json
```

Risikonya:

1. API key tersimpan plaintext.
2. Lokasinya project-local, bukan global user config.
3. `.gitignore` hanya ditambahkan jika file `.gitignore` sudah ada.
4. Kalau project belum punya `.gitignore`, credential tetap berisiko ikut commit.
5. Permission file belum diatur ke mode terbatas seperti `0600`.

### Fix yang disarankan

Pisahkan:

- Config project: `.nanocli/config.json`
- Credential user: `~/.nanocli/credentials.json`

Contoh:

```ts
constructor(projectRoot: string = process.cwd()) {
  this.configPath = path.join(projectRoot, '.nanocli', 'config.json');
  this.globalConfigDir = path.join(os.homedir(), '.nanocli');
  this.credentialsPath = path.join(this.globalConfigDir, 'credentials.json');
}

async saveApiKey(apiKey: string): Promise<void> {
  await fs.ensureDir(path.dirname(this.credentialsPath));
  await fs.writeJson(this.credentialsPath, { apiKey }, { spaces: 2 });
  await fs.chmod(this.credentialsPath, 0o600);
}
```

Tetap tambahkan `.nanocli/` ke `.gitignore` project:

```ts
async ensureProjectGitignore(): Promise<void> {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const entry = '\n.nanocli/\n';

  if (!(await fs.pathExists(gitignorePath))) {
    await fs.writeFile(gitignorePath, entry.trimStart(), 'utf-8');
    return;
  }

  const content = await fs.readFile(gitignorePath, 'utf-8');
  if (!content.includes('.nanocli/')) {
    await fs.appendFile(gitignorePath, entry);
  }
}
```

---

## 3.7 `/file`, `/ls`, dan auto-inject bisa membaca luar project root

**Lokasi:**

- `src/ui/chatUI.ts:281-323`
- `src/ui/chatUI.ts:332-356`
- `src/prompts/promptBuilder.ts`, method `autoInjectMentionedFiles()`

Kode `/file` saat ini mengizinkan absolute path:

```ts
const resolvedPath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);
```

Dampaknya, user dapat memuat file di luar project:

```bash
/file ~/.ssh/id_rsa
/file ../../.env
/file /etc/passwd
```

Untuk CLI pribadi, ini tetap berisiko karena isi file akan masuk ke context dan bisa terkirim ke model.

### Fix helper

Buat file:

```txt
src/utils/fsSafe.ts
```

Isi:

```ts
import path from 'path';

export function isInsideProject(projectRoot: string, targetPath: string): boolean {
  const relative = path.relative(projectRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isSecretLike(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);

  const blockedNames = new Set([
    '.env',
    '.env.local',
    '.env.production',
    '.credentials.json',
    'id_rsa',
    'id_ed25519'
  ]);

  if (blockedNames.has(name)) return true;
  if (normalized.includes('/.ssh/')) return true;
  if (normalized.includes('/.aws/')) return true;
  if (normalized.includes('/.config/gcloud/')) return true;

  return false;
}
```

Gunakan sebelum membaca file:

```ts
if (!isInsideProject(this.projectRoot, resolvedPath)) {
  Renderer.printStatus('Akses file di luar project root diblokir.', 'error');
  return;
}

if (isSecretLike(resolvedPath)) {
  Renderer.printStatus('File terlihat seperti secret dan tidak akan dikirim ke AI.', 'error');
  return;
}
```

---

## 3.8 `.env` bisa auto-inject ke prompt

**Lokasi:** `src/prompts/promptBuilder.ts`, regex `autoInjectMentionedFiles()`

Regex saat ini mencakup ekstensi:

```ts
env
```

Artinya ketika user menulis:

```txt
cek .env saya
```

isi `.env` bisa terbaca dan masuk ke prompt.

### Fix

Hapus `env` dari daftar ekstensi auto-read, atau tetap izinkan hanya jika user memakai flag eksplisit:

```bash
nanocli chat --allow-secrets
```

Untuk default behavior, file secret sebaiknya diblokir.

---

## 3.9 Context compactor belum benar-benar compression

**Lokasi:** `src/context/contextCompactor.ts`

Kodenya saat ini melakukan:

1. Pertahankan system prompt.
2. Pertahankan pesan terbaru.
3. Buang pesan lama jika melebihi budget.

Ini lebih tepat disebut **context pruning**, bukan **token compression**.

Masalahnya:

- Keputusan teknis lama bisa hilang.
- Bug lama bisa hilang.
- Constraint user bisa hilang.
- Assistant bisa memberi jawaban yang tidak konsisten setelah sesi panjang.

### Rekomendasi desain compression modern

Gunakan pipeline 4 lapis:

```txt
User Message
   ↓
Secret Redaction
   ↓
File Relevance Ranking
   ↓
Context Pruning
   ↓
Semantic Summarization
   ↓
Final Prompt Budgeting
   ↓
OpenRouter Request
```

Bentuk ringkasan yang disarankan:

```md
# Conversation Summary

## Current Goal
User sedang membangun NanoCLI, CLI coding assistant berbasis OpenRouter.

## Decisions
- CLI memakai TypeScript, Commander, OpenRouter API.
- Mode yang didukung: fast, normal, high, extra-high.
- Credential sebaiknya disimpan global di ~/.nanocli.

## Known Bugs
- extra-high mismatch dengan extraHigh.
- Streaming parser rawan kehilangan chunk.
- .env bisa auto-inject.

## Active Files
- src/files/configManager.ts
- src/llm/openrouterClient.ts
- src/context/contextCompactor.ts
```

### Implementasi awal

Tambahkan file:

```txt
src/context/summarizer.ts
```

Konsep:

```ts
export class ContextSummarizer {
  async summarizeOldMessages(messages: Message[], client: OpenRouterClient, model: string): Promise<Message> {
    const text = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const response = await client.chat({
      model,
      messages: [
        {
          role: 'system',
          content: 'Summarize this coding conversation into compact project memory. Preserve goals, decisions, bugs, constraints, and active files.'
        },
        {
          role: 'user',
          content: text
        }
      ]
    });

    return {
      role: 'system',
      content: `Conversation Summary:\n${response.choices[0]?.message?.content || ''}`
    };
  }
}
```

Untuk menghemat biaya, summarization bisa dipicu hanya jika context melewati 70-80% budget.

---

## 3.10 Cost tracking masih estimasi, belum usage aktual

**Lokasi:**

- `src/tokens/tokenBudgetManager.ts`
- `src/ui/chatUI.ts:130-146`
- `src/commands/ask.ts`
- command lain yang log usage manual

Saat ini input dan output token dihitung manual memakai `cl100k_base`:

```ts
this.encoding = getEncoding('cl100k_base');
```

Ini baik untuk estimasi kasar, tetapi tidak selalu akurat untuk semua model OpenRouter, karena tokenizer bisa berbeda antar provider/model.

OpenRouter model metadata memang menyediakan pricing pada Models API. Referensi: https://openrouter.ai/docs/api/api-reference/models/get-models

### Fix

Tetap gunakan estimasi sebelum request, tetapi simpan usage aktual jika API mengembalikan data `usage`.

Untuk non-stream:

```ts
const res = await client.chat(payload);
const usage = res.usage;
```

Untuk stream, buat stream generator mengembalikan final metadata, atau gunakan callback:

```ts
async streamChat(
  options: ChatOptions,
  onUsage?: (usage: any) => void
): Promise<AsyncGenerator<string>>
```

Jika final chunk menyertakan usage, log data aktual. Jika tidak tersedia, baru fallback ke estimasi.

---

## 3.11 `test --write` bisa overwrite file test lama

**Lokasi:** `src/commands/test.ts:127-147`

Saat user menjalankan:

```bash
nanocli test src/foo.ts --write
```

file output menjadi:

```txt
src/foo.test.ts
```

Kode saat ini langsung:

```ts
await fs.writeFile(testPath, testCode, 'utf-8');
```

Jika file test sudah ada, akan tertimpa.

### Fix

```ts
if (await fs.pathExists(testPath)) {
  Renderer.printStatus(`File test sudah ada: ${testPath}. Gunakan --overwrite untuk menimpa.`, 'warn');
  return;
}
```

Tambahkan option:

```ts
.option('--overwrite', 'Timpa file test jika sudah ada')
```

---

## 3.12 Memory index masih dummy summary

**Lokasi:** `src/memory/memoryManager.ts:84-103`

Saat update memory, summary masih seperti ini:

```ts
const summary = `File: ${relativePath}. Berisi kode sumber proyek.`;
```

Ini belum memberi nilai semantic search yang kuat, karena semua file akan punya summary generik.

### Fix bertahap

Tahap MVP:

```ts
const summary = await this.buildHeuristicSummary(relativePath, content);
```

Contoh heuristic:

```ts
private buildHeuristicSummary(relativePath: string, content: string): string {
  const imports = content.match(/^import .+$/gm)?.slice(0, 10).join('; ') || '';
  const classes = content.match(/class\s+\w+/g)?.join(', ') || '';
  const funcs = content.match(/(?:function|async function)\s+\w+/g)?.join(', ') || '';

  return [
    `File: ${relativePath}`,
    classes ? `Classes: ${classes}` : '',
    funcs ? `Functions: ${funcs}` : '',
    imports ? `Imports: ${imports}` : ''
  ].filter(Boolean).join('\n');
}
```

Tahap lanjut:

- Summarize file dengan model murah.
- Simpan hash.
- Jangan re-summarize kalau hash belum berubah.
- Chunk file besar per symbol/function.

---

## 3.13 FTS query bisa error jika query mengandung karakter khusus

**Lokasi:** `src/memory/indexer.ts:111-128`

SQLite FTS5 `MATCH ?` bisa error pada query tertentu, misalnya karakter kutip, operator, atau simbol khusus.

### Fix minimal

Buat sanitizer:

```ts
function sanitizeFtsQuery(query: string): string {
  return query
    .replace(/["'`]/g, ' ')
    .replace(/[(){}[\]^~*:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(term => `${term}*`)
    .join(' OR ');
}
```

Lalu:

```ts
const safeQuery = sanitizeFtsQuery(query);
return {
  files: fileSearch.all(safeQuery),
  memory: memorySearch.all(safeQuery)
};
```

---

## 4. Rekomendasi Struktur Project Versi Lebih Modern

Saya sarankan struktur dipecah seperti ini:

```txt
nano-cli/
├─ src/
│  ├─ main.ts
│  ├─ cli/
│  │  ├─ program.ts
│  │  ├─ commands.ts
│  │  └─ validators.ts
│  ├─ commands/
│  │  ├─ ask.ts
│  │  ├─ chat.ts
│  │  ├─ review.ts
│  │  ├─ debug.ts
│  │  ├─ test.ts
│  │  ├─ plan.ts
│  │  └─ patch.ts
│  ├─ providers/
│  │  └─ openrouter/
│  │     ├─ client.ts
│  │     ├─ stream.ts
│  │     ├─ models.ts
│  │     └─ pricing.ts
│  ├─ config/
│  │  ├─ defaults.ts
│  │  ├─ configManager.ts
│  │  ├─ credentials.ts
│  │  └─ modes.ts
│  ├─ context/
│  │  ├─ builder.ts
│  │  ├─ compactor.ts
│  │  ├─ summarizer.ts
│  │  ├─ relevance.ts
│  │  └─ redactor.ts
│  ├─ memory/
│  │  ├─ indexer.ts
│  │  ├─ store.ts
│  │  ├─ search.ts
│  │  └─ summarizer.ts
│  ├─ tokens/
│  │  ├─ counter.ts
│  │  ├─ budget.ts
│  │  └─ cost.ts
│  ├─ ui/
│  │  ├─ chatUI.ts
│  │  ├─ setupUI.ts
│  │  ├─ modelPickerUI.ts
│  │  └─ render.ts
│  └─ utils/
│     ├─ errors.ts
│     ├─ fsSafe.ts
│     ├─ logger.ts
│     └─ text.ts
├─ package.json
├─ README.md
├─ .gitignore
├─ .env.example
└─ tsconfig.json
```

### Kenapa perlu dipisah?

- `llm/` lebih baik menjadi `providers/openrouter/`, agar nanti bisa menambah Anthropic, OpenAI, Gemini, local Ollama, atau provider lain.
- `files/configManager.ts` lebih tepat masuk `config/`.
- `ContextCompactor` sebaiknya tidak hanya memangkas, tapi punya pipeline `redactor → relevance → pruning → summarizer`.
- `memory/` perlu dibedakan antara indexer, store, search, dan summarizer.

---

## 5. Roadmap Perbaikan Berdasarkan Prioritas

## Fase 1 — Bugfix wajib sebelum dipakai harian

1. Samakan `extra-high`, jangan pakai `extraHigh`.
2. Tambahkan validasi mode global.
3. Fix `isFirstRun()` agar ENV key tidak diblokir.
4. Tambahkan `.gitignore` otomatis untuk `.nanocli/`.
5. Blok akses file luar project root.
6. Blok `.env`, SSH key, credential, dan secret file.
7. Perbaiki stream parser dengan buffer.

## Fase 2 — OpenRouter integration lebih matang

1. Gunakan fallback `models: [...]`.
2. Simpan model yang benar-benar dipakai jika response mengembalikannya.
3. Ambil usage aktual jika tersedia.
4. Tambahkan retry policy untuk network error.
5. Tambahkan timeout dari config, bukan hardcoded.
6. Tambahkan provider-specific request options.

## Fase 3 — Token compression beneran

1. Buat `ContextRedactor`.
2. Buat `FileRelevanceRanker`.
3. Buat `ContextSummarizer`.
4. Simpan conversation summary di `.nanocli/sessions`.
5. Trigger summary saat context > 70% budget.
6. Tambahkan prompt caching untuk context statis jika memakai model/provider yang mendukung.

OpenRouter memiliki dokumentasi prompt caching untuk mengurangi biaya pada input yang berulang: https://openrouter.ai/docs/guides/best-practices/prompt-caching  
OpenRouter juga memiliki response caching beta untuk request identik: https://openrouter.ai/docs/guides/features/response-caching

## Fase 4 — CLI polish

1. Tambahkan README lengkap.
2. Tambahkan `.env.example`.
3. Tambahkan command `doctor`.
4. Tambahkan command `config get/set`.
5. Tambahkan `--json` output untuk automation.
6. Tambahkan unit test untuk ConfigManager, OpenRouterClient parser, dan ContextCompactor.
7. Tambahkan CI GitHub Actions.

---

## 6. Command Baru yang Saya Sarankan

```bash
nanocli doctor
```

Untuk cek:

- Node version.
- Config path.
- Credential source.
- OpenRouter reachable atau tidak.
- Model default valid atau tidak.
- `.nanocli` sudah init atau belum.
- `.gitignore` aman atau tidak.

```bash
nanocli config get
nanocli config set models.normal anthropic/claude-3.5-sonnet
```

Untuk edit config tanpa buka file manual.

```bash
nanocli memory summarize
```

Untuk membuat ringkasan project memory semantik.

```bash
nanocli context inspect
```

Untuk melihat apa saja yang akan dikirim ke model sebelum request.

```bash
nanocli ask "review" --dry-run
```

Untuk menampilkan token estimate dan context payload tanpa memanggil API.

---

## 7. Nama Binary CLI

Saat ini package memakai:

```json
"bin": {
  "nanocli": "dist/main.js"
}
```

Ini aman, tetapi jika branding-nya **Nano CLI**, saya sarankan sediakan alias:

```json
"bin": {
  "nanocli": "dist/main.js",
  "nano-cli": "dist/main.js",
  "ncli": "dist/main.js"
}
```

Hindari binary bernama `nano`, karena sudah sangat identik dengan text editor di Linux/macOS.

---

## 8. Checklist Bugfix Singkat

| Prioritas | Item | Status Saat Ini | Target |
|---|---|---|---|
| P0 | Fix `extra-high` vs `extraHigh` | Bermasalah | Wajib fix |
| P0 | Validasi mode semua command | Parsial | Wajib fix |
| P0 | Stream parser buffer | Belum | Wajib fix |
| P0 | Blok `.env` dan secret | Belum | Wajib fix |
| P0 | Blok file luar project root | Belum | Wajib fix |
| P1 | ENV setup tidak butuh config lokal | Bermasalah | Fix cepat |
| P1 | Credential global `~/.nanocli` | Belum | Disarankan |
| P1 | OpenRouter fallback `models` | Belum | Disarankan |
| P1 | Usage aktual API | Belum | Disarankan |
| P2 | Semantic summarization | Belum | Target utama token compression |
| P2 | Relevance ranking file | Belum | Penting untuk hemat token |
| P2 | Memory summary meaningful | Belum | Perlu upgrade |
| P2 | Unit test | Belum | Perlu sebelum publish |

---

## 9. Kesimpulan Akhir

NanoCLI sudah punya fondasi yang bagus untuk MVP coding assistant berbasis terminal. Arsitekturnya sudah mengarah benar karena command, OpenRouter client, memory, token budget, dan UI sudah dipisah.

Namun, sebelum dikembangkan lebih jauh, sebaiknya jangan langsung menambah fitur besar. Prioritasnya adalah memperbaiki bug dasar dan keamanan:

1. `extra-high` mismatch.
2. Validasi mode.
3. Stream parser.
4. Credential storage.
5. File access safety.
6. Secret redaction.

Setelah itu, baru fokus ke fitur pembeda utama NanoCLI, yaitu **token compression**. Saat ini yang ada masih pruning. Agar benar-benar terasa seperti CLI modern hemat token, NanoCLI perlu semantic summarization, file relevance ranking, secret redaction, dan caching strategy.

Dengan perbaikan itu, NanoCLI bisa naik dari MVP biasa menjadi CLI coding assistant yang lebih serius dan siap dikembangkan sebagai produk.
