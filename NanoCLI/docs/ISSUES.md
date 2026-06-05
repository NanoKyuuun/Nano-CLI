# NanoCLI Issue Tracker

**Status:** Beta (Sedang dalam proses rilis)  
**Target:** Public Beta — npm publish  
**Update terakhir:** 2026-06-05  
**Sumber audit:** Antigravity Agent + OpenCode Agent (cross-validated)

---

> **CATATAN:** Isu yang bertanda `⚠️ KOREKSI STATUS` berarti status di versi sebelumnya tidak akurat
> dan telah dikoreksi berdasarkan verifikasi langsung ke kode aktual.

---

## P0 — Critical (Wajib selesai sebelum Public Beta)

| ID | Masalah | Status | File | Sumber |
|----|---------|--------|------|--------|
| P0-01 | Fix README internal — instruksi npm, bukan pip | ✅ Selesai | `NanoCLI/README.md`, `INSTALL.md` | Antigravity |
| P0-02 | Fix cost calculation — per-million bukan per-token | ✅ Selesai | `tokenBudgetManager.ts` | OpenCode |
| P0-03 | Fix agent loop — duplicate action guard | ✅ Selesai | `agentLoop.ts` | OpenCode |
| P0-04 | Minimal test suite — Vitest (107 tests) | ✅ Selesai | `tests/*.test.ts` | OpenCode |
| P0-05 | Filter env vars di terminal runner | ✅ Selesai | `commandExecutor.ts` | OpenCode |
| P0-06 | Fix patch extraction — double-wrap di stepRunner | ✅ Selesai | `stepRunner.ts` | OpenCode |
| P0-07 | Secure backend authentication default (hard fail) | ✅ Selesai ⚠️ KOREKSI STATUS | `nanocli-server/api/main.py:56-68` — `raise RuntimeError` jika `API_KEY` kosong tanpa `DEV_MODE` | Antigravity |
| P0-08 | Root README masih `pip install -e .` | ✅ Selesai | `README.md` (root) — diganti instruksi npm + build tools prereq | OpenCode |
| P0-09 | Cost accumulator korup — data lama `$-15,098` | ✅ Selesai | `statsManager.ts:getStats()` — auto-clamp korup saat baca, guard di `logUsage()` | OpenCode |

### P0-08 Detail
Root `README.md` di path `c:\Users\NanoKyuuun\Documents\Project\Python\NanoCLI\README.md` (bukan README internal NanoCLI) masih berisi instruksi yang salah:
```bash
pip install -e .   # ← SALAH, ini proyek TypeScript/Node.js
```
Ini adalah kesan pertama yang dilihat user dari GitHub. Harus segera diperbaiki.

### P0-09 Detail
File `NanoCLI/.nanocli/memory/token_stats.json` berisi:
```json
{
  "totalCostUsd": -15098,
  "history": [{"costUsd": -176}, {"costUsd": -304}, ...]
}
```
Root cause: `openrouter/auto` mengembalikan pricing sentinel `-1`, yang dikalkulasi menjadi nilai negatif raksasa sebelum P0-02 dipatch. Data lama tidak pernah di-migrasi. Perlu:
1. Reset atau clamp `totalCostUsd` ke 0 di `statsManager.ts:getStats()`
2. Filter history entries dengan `costUsd < 0` atau `costUsd` tidak rasional

---

## P1 — High (Sebaiknya selesai sebelum Public Beta)

| ID | Masalah | Status | File | Sumber |
|----|---------|--------|------|--------|
| P1-01 | Tambah `/memory` ke help menu | ✅ Selesai | `render.ts` — section MEMORY sudah ada | Antigravity |
| P1-02 | Stabilkan markdown rendering saat streaming | ⏳ Ditunda (trade-off) | `chatUI.ts` — raw stream dipilih demi latensi | Keduanya |
| P1-03 | Fix memory pinned, scope, confidence di retrieval | ✅ Selesai | `indexer.ts` — pinned boost + scope filter + confidence threshold | Antigravity |
| P1-04 | Improve FTS query — AND + stopwords | ✅ Selesai | `indexer.ts` — `sanitizeFtsQuery()` strong/weak split | Antigravity |
| P1-05 | Graceful degradation tanpa backend Python | ✅ Selesai ⚠️ KOREKSI STATUS | `chatUI.ts:103-114` — `isAvailable()` + fallback ke SQLite lokal | Antigravity |
| P1-06 | Memory extraction quiet saat exit | ✅ Selesai ⚠️ KOREKSI STATUS | `chatUI.ts:1261` — quiet extraction, hanya tampilkan ringkasan | Antigravity |
| P1-07 | Markdown rendering saat streaming (full render) | ❌ Ditunda (trade-off UX) | `chatUI.ts:345-348` — masih `process.stdout.write(chunk)` | OpenCode |
| P1-08 | Agent interactive question capability | ❌ Belum | `agentLoop.ts` — tidak ada mekanisme agent bertanya ke user | OpenCode |
| P1-09 | Cost NaN guard di `StatsManager.logUsage()` | ✅ Selesai | `statsManager.ts` — guard `isFinite && >= 0` di `logUsage()` + clamp di `getStats()` | OpenCode |

### P1-09 Detail (Baru dari OpenCode)
```typescript
// statsManager.ts baris 47 — saat ini:
stats.totalCostUsd += record.costUsd;  // ← tidak ada guard!

// Seharusnya:
const safeCost = (isFinite(record.costUsd) && record.costUsd >= 0) ? record.costUsd : 0;
stats.totalCostUsd += safeCost;
```

---

## P2 — Medium (Dikerjakan setelah fondasi stabil)

| ID | Masalah | Status | File | Sumber |
|----|---------|--------|------|--------|
| P2-01 | Batch approval mode | ✅ Selesai | `cli.ts`, `stepRunner.ts`, `agentLoop.ts` | Antigravity |
| P2-02 | Post-write validation (JSON, TS, YAML) | ✅ Selesai | `src/file/writeValidator.ts` | Antigravity |
| P2-03 | Git integration minimal | ✅ Selesai | `src/git/gitManager.ts`, `cli.ts` | Antigravity |
| P2-04 | Auto-index watcher (chokidar) | ✅ Selesai | `src/memory/fileWatcher.ts`, `memoryManager.ts` | Antigravity |
| P2-05 | Structured error recovery (`ActionFeedback`) | ✅ Selesai ⚠️ KOREKSI STATUS | `src/agent/agentTypes.ts:85-95` — interface sudah ada | Antigravity |
| P2-06 | JSON parser lebih robust (json5 fallback) | ✅ Selesai | `toolRouter.ts` | Antigravity |
| P2-07 | Model caching (TTL-based) | ❌ Belum | `modelManager.ts` — setiap call = HTTP request baru | OpenCode |
| P2-08 | Local embedding untuk semantic search | ❌ Belum | `memory/` — FTS5 keyword-only | Keduanya |
| P2-09 | Persistent DB connection di MemoryManager | ❌ Belum | `memoryManager.ts` — SQLite buka/tutup setiap operasi | OpenCode |
| P2-10 | Retry + queue untuk home server uploads | ❌ Belum | `memoryManager.ts` — fire-and-forget, silent data loss | OpenCode |

### P2-07 Detail (Baru dari OpenCode)
Setiap pemanggilan `modelManager.getModel()` melakukan HTTP request ke OpenRouter tanpa caching. Dengan 346+ model, ini menjadi bottleneck. Solusi: cache dengan TTL 5 menit.

### P2-09 Detail (Baru dari OpenCode)
`MemoryManager` membuka dan menutup koneksi SQLite hingga 6x per satu operasi gabungan. Ini overhead yang tidak perlu dan berisiko connection leak jika ada exception di tengah operasi.

---

## P3 — Long Term

| ID | Fitur | Status | Catatan |
|----|-------|--------|---------|
| P3-01 | Publish ke npm | ❌ Belum | Langkah berikutnya setelah P0-08 dan P0-09 selesai |
| P3-02 | `nanocli doctor` health check | ✅ Selesai | `src/commands/doctor.ts` — 10 checks |
| P3-03 | Benchmark suite | ❌ Belum | |
| P3-04 | Local semantic memory (sqlite-vec atau Ollama lokal) | ❌ Belum | |
| P3-05 | Interactive diff viewer | ❌ Belum | |
| P3-06 | Sandboxed execution (Docker) | ❌ Belum | |
| P3-07 | Offline mode (Ollama fallback) | ❌ Belum | OpenCode: single point of failure jika tidak ada internet |
| P3-08 | Agent task interruption/resume | ❌ Belum | |
| P3-09 | Conversation history search | ❌ Belum | SQLite menyimpan ini tapi belum ada UI query | OpenCode |
| P3-10 | Cost alerts (warn ketika monthly spend > threshold) | ❌ Belum | Berguna setelah P0-09 dan P1-09 diselesaikan | OpenCode |

---

## Test Coverage

| Module | File Test | Tests | Status |
|--------|-----------|-------|--------|
| TokenBudgetManager | `tokenBudgetManager.test.ts` | 10 | ✅ |
| PatchApplicator | `patchApplicator.test.ts` | 7 | ✅ |
| ToolRouter | `toolRouter.test.ts` | 21 | ✅ |
| CommandExecutor | `commandExecutor.test.ts` | 11 | ✅ |
| AgentLoop | `agentLoop.test.ts` | 15 | ✅ |
| PathGuard | `pathGuard.test.ts` | 20 | ✅ |
| Indexer | `indexer.test.ts` | 23 | ✅ |

**Total: 107 tests passing** ✅

### Belum ada test untuk:
- ConfigManager
- ChatUI
- MemoryManager (unit test penuh)
- PromptBuilder
- OpenRouterClient
- GitManager *(baru)*
- StepRunner *(baru)*
- WriteValidator *(baru)*
- SecretRedactor
- E2E / integration tests

---

## Public Beta Checklist

### ✅ Semua Blocker Selesai
- [x] **P0-08**: Root `README.md` diperbaiki — npm install + build tools prereq
- [x] **P0-09**: Data cost korup otomatis di-clamp di `getStats()`, guard di `logUsage()`
- [x] **P1-09**: NaN/negatif guard ditambah di `StatsManager.logUsage()`

### Installation
- [x] README internal NanoCLI valid dan menggunakan `npm`
- [x] INSTALL.md tersedia
- [x] `nanocli doctor` tersedia
- [x] `.env.example` tersedia
- [x] **Root README diperbaiki** (P0-08 ✅)
- [ ] Fresh clone berhasil dari nol (manual end-to-end test)

### Core CLI
- [x] `npm test` berjalan (107 tests)
- [x] `npm run typecheck` berjalan (0 errors)
- [x] Test cost calculation ada
- [x] Test env whitelist ada
- [x] Test patch extraction ada
- [x] Test agent termination ada
- [x] Test indexer ada
- [x] Test pathGuard ada

### Data Integrity
- [x] **Cost accumulator diperbaiki** (P0-09 ✅, P1-09 ✅)
- [x] `statsManager.ts` clamp negatif/NaN sebelum akumulasi
- [x] Data lama korup otomatis di-sanitasi saat `getStats()` dipanggil

### Security
- [x] Env var tidak diwariskan penuh ke subprocess
- [x] Secret redactor aktif
- [x] File path guard aktif
- [x] Backend butuh API key (P0-07 — `raise RuntimeError` sudah ada)
- [ ] Audit log tersedia secara penuh (partially implemented)

### Dokumentasi
- [x] README ringkas dan benar (internal)
- [x] INSTALL.md ada
- [x] SECURITY.md ada
- [x] CONTRIBUTING.md ada
- [x] Root README diperbaiki (P0-08 ✅)
- [ ] `examples/` direktori ada
- [ ] Known limitations dicantumkan secara jujur

---

## Ringkasan Status dari Dua Sumber Audit

| Kategori | Antigravity Score | OpenCode Score | Gap & Catatan |
|----------|-------------------|----------------|---------------|
| Installation | 7/10 | 4/10 | OpenCode menguji root README yang masih rusak |
| User Experience | 8/10 | 6/10 | OpenCode menemukan streaming tanpa markdown |
| Coding Capability | 8/10 | 5/10 | OpenCode menemukan patch regex yang fragile |
| Agent Capability | 8/10 | 4/10 | OpenCode menemukan agent tidak bisa tanya user |
| Memory | 8/10 | 6/10 | OpenCode: FTS5 bukan true semantic RAG |
| Error Handling | 8/10 | 5/10 | OpenCode menemukan banyak empty catch block |
| **Overall** | **77/100** | **52/100** | Gap besar — Antigravity tidak menguji root README dan token_stats korup |

**Perbedaan skor terjadi karena:**
1. Antigravity sudah mengetahui isu root README (P0-08) tapi belum memperhitungkan dampak skornya
2. OpenCode menguji `token stats` command dan melihat `$-15,098` secara langsung
3. Antigravity menguji koneksi backend yang sudah berjalan di Docker (kondisi ideal)
