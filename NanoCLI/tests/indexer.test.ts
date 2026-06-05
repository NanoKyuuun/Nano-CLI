/**
 * indexer.test.ts
 *
 * Unit tests untuk Indexer — komponen SQLite/FTS5 untuk project memory.
 *
 * Coverage:
 *   - connect() — inisialisasi database dan schema migration
 *   - updateFileIndex() / getFileByPath() — CRUD file index
 *   - removeFileIndex() — hapus entry file (P2-04)
 *   - addMemoryEntry() / listMemoryEntries() — CRUD memory
 *   - deleteMemoryEntry() — hapus by ID
 *   - search() — FTS5 full-text search
 *   - saveFeedback() / getLocalStats() — feedback dan statistik
 *   - sanitizeFtsQuery (via search) — stopwords, AND/OR logic
 *
 * Strategy: test menggunakan database in-memory (:memory:)
 * dengan mengganti dbPath melalui workaround tmpdir unik per test run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { Indexer } from '../src/memory/indexer';

// Buat tmpdir unik agar test tidak saling interferensi
const TEST_ROOT = path.join(os.tmpdir(), `nanocli-indexer-test-${Date.now()}`);

describe('Indexer — File Index', () => {
  let indexer: Indexer;

  beforeAll(async () => {
    await fs.ensureDir(TEST_ROOT);
    indexer = new Indexer(TEST_ROOT);
    await indexer.connect();
  });

  afterAll(() => {
    indexer.close();
    fs.removeSync(TEST_ROOT);
  });

  it('connect() berhasil membuat file database', async () => {
    const dbPath = path.join(TEST_ROOT, '.nanocli', 'index', 'memory.sqlite');
    const exists = await fs.pathExists(dbPath);
    expect(exists).toBe(true);
  });

  it('getFileByPath() mengembalikan null untuk file yang belum diindeks', () => {
    const result = indexer.getFileByPath('src/nonexistent.ts');
    expect(result).toBeNull();
  });

  it('updateFileIndex() menyimpan entry baru', () => {
    indexer.updateFileIndex({
      path:        'src/utils.ts',
      hash:        'abc123',
      summary:     'Utility functions for string manipulation',
      lastIndexed: Date.now(),
    });

    const result = indexer.getFileByPath('src/utils.ts');
    expect(result).not.toBeNull();
    expect(result?.hash).toBe('abc123');
    expect(result?.summary).toBe('Utility functions for string manipulation');
  });

  it('updateFileIndex() melakukan upsert — update jika path sudah ada', () => {
    indexer.updateFileIndex({
      path:        'src/utils.ts',
      hash:        'def456',
      summary:     'Updated summary',
      lastIndexed: Date.now(),
    });

    const result = indexer.getFileByPath('src/utils.ts');
    expect(result?.hash).toBe('def456');
    expect(result?.summary).toBe('Updated summary');
  });

  it('removeFileIndex() menghapus entry file dari index', () => {
    indexer.updateFileIndex({
      path:        'src/temp.ts',
      hash:        'temp123',
      summary:     'Temporary file',
      lastIndexed: Date.now(),
    });

    // Pastikan ada dulu
    expect(indexer.getFileByPath('src/temp.ts')).not.toBeNull();

    // Hapus
    indexer.removeFileIndex('src/temp.ts');

    // Harus hilang
    expect(indexer.getFileByPath('src/temp.ts')).toBeNull();
  });

  it('removeFileIndex() tidak error jika path tidak ditemukan', () => {
    // Tidak boleh throw
    expect(() => indexer.removeFileIndex('src/nonexistent.ts')).not.toThrow();
  });
});

describe('Indexer — Memory Entries', () => {
  let indexer: Indexer;

  beforeAll(async () => {
    const root = path.join(os.tmpdir(), `nanocli-memory-test-${Date.now()}`);
    await fs.ensureDir(root);
    indexer = new Indexer(root);
    await indexer.connect();
  });

  afterAll(() => {
    indexer.close();
  });

  it('addMemoryEntry() menyimpan entry baru', () => {
    indexer.addMemoryEntry({
      type:      'decision',
      content:   'Gunakan TypeScript strict mode untuk semua file baru',
      timestamp: Date.now(),
    });

    const list = indexer.listMemoryEntries(10);
    expect(list.length).toBe(1);
    expect(list[0]?.type).toBe('decision');
    expect(list[0]?.content).toContain('TypeScript strict mode');
  });

  it('addMemoryEntry() menggunakan default value untuk field opsional', () => {
    indexer.addMemoryEntry({
      type:      'bug',
      content:   'Race condition di async queue',
      timestamp: Date.now(),
    });

    const list = indexer.listMemoryEntries(10);
    const entry = list.find(e => e.type === 'bug');
    expect(entry?.scope).toBe('project');
    expect(entry?.source).toBe('manual');
    expect(entry?.confidence).toBe(1);
    expect(entry?.pinned).toBe(0);
  });

  it('addMemoryEntry() menyimpan scope dan confidence kustom', () => {
    indexer.addMemoryEntry({
      type:       'preference',
      content:    'User lebih suka output dalam Bahasa Indonesia',
      scope:      'user',
      source:     'chat_extractor',
      confidence: 0.9,
      pinned:     1,
      timestamp:  Date.now(),
    });

    const list = indexer.listMemoryEntries(10);
    const entry = list.find(e => e.type === 'preference');
    expect(entry?.scope).toBe('user');
    expect(entry?.confidence).toBe(0.9);
    expect(entry?.pinned).toBe(1);
  });

  it('listMemoryEntries() mengembalikan entry diurutkan dari terbaru', () => {
    const list = indexer.listMemoryEntries(10);
    // Setiap entry berikutnya harus timestamp <= sebelumnya
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.timestamp).toBeLessThanOrEqual(list[i - 1]!.timestamp);
    }
  });

  it('deleteMemoryEntry() menghapus entry dan mengembalikan true', () => {
    indexer.addMemoryEntry({
      type:      'todo',
      content:   'Hapus ini segera',
      timestamp: Date.now() - 1, // pastikan lebih lama agar bisa dibedakan
    });

    const list = indexer.listMemoryEntries(20);
    const entry = list.find(e => e.type === 'todo');
    expect(entry).toBeDefined();
    expect(entry!.id).toBeTypeOf('number');

    const deleted = indexer.deleteMemoryEntry(entry!.id);
    expect(deleted).toBe(true);

    const afterDelete = indexer.listMemoryEntries(20);
    expect(afterDelete.find(e => e.id === entry!.id)).toBeUndefined();
  });

  it('deleteMemoryEntry() mengembalikan false untuk ID yang tidak ada', () => {
    const result = indexer.deleteMemoryEntry(99999);
    expect(result).toBe(false);
  });
});

describe('Indexer — FTS5 Search', () => {
  let indexer: Indexer;

  beforeAll(async () => {
    const root = path.join(os.tmpdir(), `nanocli-search-test-${Date.now()}`);
    await fs.ensureDir(root);
    indexer = new Indexer(root);
    await indexer.connect();

    // Seed data
    indexer.updateFileIndex({
      path:        'src/auth/authController.ts',
      hash:        'h1',
      summary:     'JWT authentication controller dengan login dan refresh token',
      lastIndexed: Date.now(),
    });
    indexer.updateFileIndex({
      path:        'src/database/userRepository.ts',
      hash:        'h2',
      summary:     'Database repository untuk user CRUD operations',
      lastIndexed: Date.now(),
    });
    indexer.addMemoryEntry({
      type:      'decision',
      content:   'Gunakan bcrypt untuk password hashing, bukan md5',
      timestamp: Date.now(),
    });
    indexer.addMemoryEntry({
      type:      'bug',
      content:   'JWT token tidak expire dengan benar saat logout',
      timestamp: Date.now(),
    });
  });

  afterAll(() => {
    indexer.close();
  });

  it('search() menemukan file yang relevan', () => {
    const result = indexer.search('authentication jwt');
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0]?.path).toContain('auth');
  });

  it('search() menemukan memory yang relevan', () => {
    const result = indexer.search('password bcrypt');
    expect(result.memory.length).toBeGreaterThan(0);
    expect(result.memory[0]?.content).toContain('bcrypt');
  });

  it('search() mengembalikan score antara 0 dan 1', () => {
    const result = indexer.search('database user');
    for (const file of result.files) {
      expect(file.score).toBeGreaterThanOrEqual(0);
      expect(file.score).toBeLessThanOrEqual(1);
    }
  });

  it('search() mengembalikan array kosong untuk query tanpa match', () => {
    const result = indexer.search('xyzqrstuvwxyz12345');
    expect(result.files).toHaveLength(0);
    expect(result.memory).toHaveLength(0);
  });

  it('search() tidak crash untuk query dengan karakter spesial FTS5', () => {
    // Karakter seperti ( ) " * harus disanitize
    expect(() => indexer.search('auth (login) "jwt" *')).not.toThrow();
  });

  it('search() mengembalikan kosong untuk string kosong', () => {
    const result = indexer.search('');
    expect(result.files).toHaveLength(0);
    expect(result.memory).toHaveLength(0);
  });

  it('search() mengembalikan kosong jika hanya stopwords', () => {
    const result = indexer.search('di ke dari yang');
    expect(result.files).toHaveLength(0);
    expect(result.memory).toHaveLength(0);
  });
});

describe('Indexer — Feedback & Stats', () => {
  let indexer: Indexer;

  beforeAll(async () => {
    const root = path.join(os.tmpdir(), `nanocli-stats-test-${Date.now()}`);
    await fs.ensureDir(root);
    indexer = new Indexer(root);
    await indexer.connect();
  });

  afterAll(() => {
    indexer.close();
  });

  it('getLocalStats() mengembalikan zero stats untuk database kosong', () => {
    const stats = indexer.getLocalStats();
    expect(stats.filesIndexed).toBe(0);
    expect(stats.feedbackTotal).toBe(0);
  });

  it('saveFeedback() menyimpan feedback dan muncul di getLocalStats()', () => {
    indexer.saveFeedback({
      sessionId:       'test-session-1',
      responsePreview: 'Response yang bagus',
      rating:          1,
      promptPreview:   'Tulis kode TypeScript',  // field opsional — kirim string
      timestamp:       Date.now(),
    });
    indexer.saveFeedback({
      sessionId:       'test-session-1',
      responsePreview: 'Response yang buruk',
      rating:          -1,
      promptPreview:   undefined,  // undefined OK — SQL menerima NULL
      timestamp:       Date.now(),
    });
    indexer.saveFeedback({
      sessionId:       'test-session-2',
      responsePreview: 'Response biasa',
      rating:          0,
      timestamp:       Date.now(),
    });

    const stats = indexer.getLocalStats();
    expect(stats.feedbackTotal).toBe(3);
    expect(stats.feedbackGood).toBe(1);
    expect(stats.feedbackBad).toBe(1);
    expect(stats.feedbackNeutral).toBe(1);
  });

  it('getLocalStats() menghitung filesIndexed dengan benar', () => {
    indexer.updateFileIndex({ path: 'f1.ts', hash: 'h1', summary: 'S1', lastIndexed: Date.now() });
    indexer.updateFileIndex({ path: 'f2.ts', hash: 'h2', summary: 'S2', lastIndexed: Date.now() });

    const stats = indexer.getLocalStats();
    expect(stats.filesIndexed).toBe(2);
  });

  it('getLocalStats().memoryByType mengelompokkan berdasarkan type', () => {
    indexer.addMemoryEntry({ type: 'bug', content: 'Bug 1', timestamp: Date.now() });
    indexer.addMemoryEntry({ type: 'bug', content: 'Bug 2', timestamp: Date.now() });
    indexer.addMemoryEntry({ type: 'decision', content: 'Decision 1', timestamp: Date.now() });

    const stats = indexer.getLocalStats();
    expect(stats.memoryByType['bug']).toBe(2);
    expect(stats.memoryByType['decision']).toBe(1);
  });
});
