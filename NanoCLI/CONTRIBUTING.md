# CONTRIBUTING.md — Panduan Kontribusi NanoCLI

Terima kasih sudah tertarik berkontribusi ke NanoCLI! Dokumen ini menjelaskan cara setup environment, konvensi kode, dan proses kontribusi.

---

## Prasyarat

- **Node.js** >= 20
- **npm** >= 10
- **Git** >= 2.x
- **OpenRouter API key** untuk testing fitur LLM (opsional untuk kontribusi non-LLM)

---

## Setup Development

```bash
# 1. Fork dan clone repository
git clone https://github.com/<your-username>/Nano-CLI.git
cd Nano-CLI/NanoCLI

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Jalankan test
npm test

# 5. Typecheck
npm run typecheck

# Atau keduanya sekaligus:
npm run check
```

---

## Struktur Direktori

```
src/
├── agent/          # AgentLoop, StepRunner, ToolRouter, agentTypes
├── commands/       # ask, review, debug, patch, test, plan, write, generate
├── config/         # modes, constants
├── context/        # ContextCompactor
├── file/           # FileOperationManager, PatchApplicator
├── files/          # ConfigManager, safeFileReader
├── generators/     # PRD, implementation, task, readme generators
├── llm/            # OpenRouterClient, ModelManager
├── memory/         # Indexer, MemoryManager, MemoryExtractor
├── prompts/        # PromptBuilder, system prompts
├── remote/         # HomeServerClient (backend Python)
├── search/         # SearchDecisionEngine, types
├── security/       # SecretRedactor, AuditLogger, PolicyEngine
├── terminal/       # CommandExecutor, ShellDetector, OutputLimiter
├── tokens/         # TokenBudgetManager, StatsManager
└── ui/             # ChatUI, Renderer, ModelPickerUI, SetupUI
tests/              # Vitest test files
```

---

## Konvensi Kode

### TypeScript

- Gunakan `strict: true` — tidak ada `any` kecuali benar-benar diperlukan
- Prefer `const` atas `let`
- Gunakan `undefined` bukan `null` kecuali interface existing sudah memakai `null`
- Deklarasikan return type untuk public methods
- Gunakan `type` bukan `interface` untuk union types

### Naming

- **Class**: `PascalCase` (contoh: `TokenBudgetManager`)
- **Method/function**: `camelCase` (contoh: `estimateCost`)
- **Constant**: `SCREAMING_SNAKE_CASE` untuk constant global (contoh: `SAFE_ENV_KEYS`)
- **File**: `camelCase.ts` untuk source, `camelCase.test.ts` untuk test
- **Variable**: `camelCase`, nama deskriptif

### Comments

- Komentar dalam **Bahasa Indonesia** untuk logika bisnis
- Komentar dalam **Bahasa Inggris** untuk type definitions dan JSDoc
- Sertakan komentar `// BUG-xx fix:` jika fix mengacu ke bug spesifik
- Jangan hapus komentar existing yang menjelaskan intent

### Error Handling

- Gunakan `try/catch` di boundary layer (commands, agent loop, UI)
- Internal functions boleh throw — biarkan caller yang handle
- Jangan `console.error` langsung di business logic — gunakan `Renderer.printStatus`
- Jangan silent fail — jika tidak bisa handle error, log dan rethrow

---

## Menulis Test

NanoCLI menggunakan **Vitest**. Semua test ada di folder `tests/`.

```bash
# Jalankan semua test
npm test

# Watch mode
npm run test:watch
```

### Aturan test

1. Setiap bug fix **wajib** punya regression test
2. Test harus bisa jalan tanpa network call (mock atau unit test murni)
3. Test file naming: `<module>.test.ts`
4. Gunakan `describe` untuk grouping, `it` untuk test case individual
5. Deskripsi `it()` harus jelas dalam Bahasa Indonesia atau Inggris

Contoh struktur test yang baik:

```typescript
describe('TokenBudgetManager.estimateCost()', () => {
  it('menghitung cost dengan benar (per-million, bukan per-token)', () => {
    // ...
  });

  it('return null untuk sentinel -1', () => {
    // ...
  });
});
```

---

## Proses Kontribusi

### Bug Fix

1. Buat issue terlebih dahulu (describe bug + steps to reproduce)
2. Fork dan buat branch: `fix/<nama-bug>` (contoh: `fix/cost-calculation`)
3. Tulis regression test **sebelum** fix (TDD)
4. Fix bug
5. Pastikan `npm run check` clean
6. Buat Pull Request ke branch `main`

### Fitur Baru

1. Diskusikan di issue terlebih dahulu — jangan langsung PR
2. Pastikan fitur baru tidak bertentangan dengan roadmap
3. Buat branch: `feat/<nama-fitur>` (contoh: `feat/git-integration`)
4. Sertakan test untuk fitur baru
5. Update README jika ada command baru
6. Buat Pull Request dengan deskripsi yang jelas

### Dokumentasi

1. Branch: `docs/<topik>` (contoh: `docs/memory-guide`)
2. Tidak perlu issue untuk perubahan dokumentasi kecil

---

## Pull Request Checklist

Sebelum submit PR, pastikan:

- [ ] `npm run check` lulus (typecheck + test)
- [ ] Tidak ada `any` baru yang tidak justified
- [ ] Test baru ada (untuk bug fix dan fitur)
- [ ] Komentar kode memadai untuk logika non-obvious
- [ ] README diupdate jika ada command baru
- [ ] Tidak ada console.log debug yang tertinggal
- [ ] Commit message jelas (format: `fix: ...` / `feat: ...` / `docs: ...`)

---

## Area yang Butuh Kontribusi

Lihat `docs/ISSUES.md` untuk daftar issue aktif dan prioritasnya.

Area yang sangat dibutuhkan:
- Test coverage (khususnya `pathGuard`, `configManager`, memory retrieval)
- `nanocli doctor` command (P3-02)
- Post-write validation (P2-02)
- Git integration minimal (P2-03)
- Quiet memory extraction (P1-06)

---

## Lisensi

Dengan berkontribusi ke NanoCLI, kamu setuju bahwa kontribusimu akan dilisensikan di bawah lisensi **ISC** yang sama dengan proyek ini.
