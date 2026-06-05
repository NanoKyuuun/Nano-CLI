import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

import path from 'path';
import fs from 'fs-extra';

export interface FileIndex {
  id?: number;
  path: string;
  hash: string;
  summary: string;
  lastIndexed: number;
}

export interface MemoryEntry {
  id?: number;
  type: string;
  content: string;
  sourceFile?: string;
  timestamp: number;
  // ── Self-learning fields (opsional, backward-compatible) ──────────────────
  /** 'project' | 'user' | 'session' — default: 'project' */
  scope?: string;
  /**
   * Asal memory: 'manual' | 'chat_extractor' | 'agent' | 'command'
   * Default: 'manual'
   */
  source?: string;
  /** Keyakinan relevansi 0.0–1.0. Default: 1.0 */
  confidence?: number;
  /** 1 = pinned (prioritas tinggi di RAG). Default: 0 */
  pinned?: number;
  /** ID entri yang menggantikan entri ini (konflik preferensi) */
  superseded_by?: number | null;
}

export class Indexer {
  private db!: DatabaseType;
  private dbPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.dbPath = path.join(projectRoot, '.nanocli', 'index', 'memory.sqlite');
  }

  async connect() {
    await fs.ensureDir(path.dirname(this.dbPath));
    this.db = new Database(this.dbPath);

    // Initialize tables and FTS5
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL,
        summary TEXT,
        last_indexed INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_file TEXT,
        timestamp INTEGER NOT NULL
      );

      -- Tabel feedback untuk rating response AI (digunakan sebagai training signal)
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        response_preview TEXT NOT NULL,  -- 200 char pertama dari response
        rating INTEGER NOT NULL,         -- 1=good, -1=bad, 0=skip
        prompt_preview TEXT,             -- 100 char pertama dari prompt user
        model_id TEXT,
        timestamp INTEGER NOT NULL
      );

      -- FTS5 Virtual Tables
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        path,
        summary,
        content='files',
        content_rowid='id'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        content,
        type,
        source_file,
        content='memory_entries',
        content_rowid='id'
      );

      -- Triggers for files_fts
      CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
        INSERT INTO files_fts(rowid, path, summary) VALUES (new.id, new.path, new.summary);
      END;
      CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, path, summary) VALUES('delete', old.id, old.path, old.summary);
      END;
      CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, path, summary) VALUES('delete', old.id, old.path, old.summary);
        INSERT INTO files_fts(rowid, path, summary) VALUES (new.id, new.path, new.summary);
      END;

      -- Triggers for memory_fts (termasuk source_file)
      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
        INSERT INTO memory_fts(rowid, content, type, source_file) VALUES (new.id, new.content, new.type, new.source_file);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, type, source_file) VALUES('delete', old.id, old.content, old.type, old.source_file);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, type, source_file) VALUES('delete', old.id, old.content, old.type, old.source_file);
        INSERT INTO memory_fts(rowid, content, type, source_file) VALUES (new.id, new.content, new.type, new.source_file);
      END;

      -- ── Indexes ──────────────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS feedback_rating_idx    ON feedback (rating);
      CREATE INDEX IF NOT EXISTS feedback_model_idx     ON feedback (model_id);
      CREATE INDEX IF NOT EXISTS feedback_timestamp_idx ON feedback (timestamp DESC);

      CREATE INDEX IF NOT EXISTS memory_entries_timestamp_idx ON memory_entries (timestamp DESC);
      CREATE INDEX IF NOT EXISTS memory_entries_type_idx      ON memory_entries (type);
    `);

    // Jalankan migrasi schema setelah inisialisasi tabel dasar.
    // Aman untuk database lama: PRAGMA check sebelum ALTER TABLE.
    this.runSchemaMigrations();
  }

  /**
   * Migrasi schema untuk kolom self-learning memory.
   *
   * SQLite tidak mendukung `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
   * Solusi: cek kolom existing via PRAGMA table_info, baru ALTER jika perlu.
   * Aman untuk database lama — tidak akan error jika sudah dijalankan sebelumnya.
   */
  private runSchemaMigrations(): void {
    const existingCols = (
      this.db.prepare('PRAGMA table_info(memory_entries)').all() as Array<{ name: string }>
    ).map(c => c.name);

    const migrations: Array<[string, string]> = [
      ['scope',          "ALTER TABLE memory_entries ADD COLUMN scope TEXT DEFAULT 'project'"],
      ['source',         "ALTER TABLE memory_entries ADD COLUMN source TEXT DEFAULT 'manual'"],
      ['confidence',     'ALTER TABLE memory_entries ADD COLUMN confidence REAL DEFAULT 1.0'],
      ['pinned',         'ALTER TABLE memory_entries ADD COLUMN pinned INTEGER DEFAULT 0'],
      ['superseded_by',  'ALTER TABLE memory_entries ADD COLUMN superseded_by INTEGER'],
    ];

    for (const [col, sql] of migrations) {
      if (!existingCols.includes(col)) {
        this.db.exec(sql);
      }
    }
  }

  updateFileIndex(file: FileIndex) {
    const upsert = this.db.prepare(`
      INSERT INTO files (path, hash, summary, last_indexed)
      VALUES (@path, @hash, @summary, @lastIndexed)
      ON CONFLICT(path) DO UPDATE SET
        hash = excluded.hash,
        summary = excluded.summary,
        last_indexed = excluded.last_indexed
    `);
    upsert.run(file);
  }

  /**
   * Ambil data file berdasarkan path relatif.
   * Digunakan untuk hash check incremental di updateMemory().
   * Kembalikan null jika belum pernah diindeks.
   */
  getFileByPath(relativePath: string): FileIndex | null {
    const stmt = this.db.prepare(
      'SELECT path, hash, summary, last_indexed AS lastIndexed FROM files WHERE path = ?'
    );
    return (stmt.get(relativePath) as FileIndex | undefined) ?? null;
  }

  /**
   * Hapus entry file dari index berdasarkan path relatif.
   * Dipanggil saat file dihapus dari disk — FileWatcher (P2-04).
   */
  removeFileIndex(relativePath: string): void {
    // Hapus dari table files
    this.db.prepare('DELETE FROM files WHERE path = ?').run(relativePath);
    // Hapus dari FTS5 virtual table
    this.db.prepare('DELETE FROM files_fts WHERE path = ?').run(relativePath);
  }

  addMemoryEntry(entry: MemoryEntry) {
    const insert = this.db.prepare(`
      INSERT INTO memory_entries
        (type, content, source_file, timestamp, scope, source, confidence, pinned)
      VALUES
        (@type, @content, @sourceFile, @timestamp, @scope, @source, @confidence, @pinned)
    `);
    insert.run({
      type:       entry.type,
      content:    entry.content,
      sourceFile: entry.sourceFile ?? null,
      timestamp:  entry.timestamp,
      scope:      entry.scope      ?? 'project',
      source:     entry.source     ?? 'manual',
      confidence: entry.confidence ?? 1.0,
      pinned:     entry.pinned     ?? 0,
    });
  }

  /**
   * Hapus satu memory entry berdasarkan ID.
   * Digunakan oleh /memory forget <id>.
   * Kembalikan true jika berhasil dihapus, false jika tidak ditemukan.
   */
  deleteMemoryEntry(id: number): boolean {
    // Gunakan named parameter (@id) bukan positional (?)
    // untuk menghindari SQL logic error di better-sqlite3 saat
    // id berasal dari hasil query yang sama.
    const result = this.db.prepare('DELETE FROM memory_entries WHERE id = @id').run({ id: Number(id) });
    return result.changes > 0;
  }

  /**
   * Ambil daftar memory entries terbaru untuk ditampilkan di /memory review.
   * Diurutkan dari yang paling baru.
   */
  listMemoryEntries(limit: number = 20): Array<{
    id: number;
    type: string;
    content: string;
    scope: string;
    source: string;
    confidence: number;
    pinned: number;
    timestamp: number;
  }> {
    return this.db.prepare(`
      SELECT id, type, content, scope, source, confidence, pinned, timestamp
      FROM memory_entries
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];
  }

  /**
   * Simpan rating feedback response AI ke SQLite.
   * Digunakan sebagai training signal untuk dataset LLM.
   *
   * @param rating  1 = good, -1 = bad, 0 = neutral/skip
   */
  saveFeedback(feedback: {
    sessionId: string;
    responsePreview: string;
    rating: 1 | -1 | 0;
    promptPreview?: string;
    modelId?: string;
    timestamp: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO feedback (session_id, response_preview, rating, prompt_preview, model_id, timestamp)
      VALUES (@sessionId, @responsePreview, @rating, @promptPreview, @modelId, @timestamp)
    `);
    // better-sqlite3 tidak menerima `undefined` — harus di-convert ke null secara eksplisit.
    // Ini penting untuk field opsional (promptPreview, modelId) agar tidak throw RangeError.
    stmt.run({
      sessionId:       feedback.sessionId,
      responsePreview: feedback.responsePreview,
      rating:          feedback.rating,
      promptPreview:   feedback.promptPreview ?? null,
      modelId:         feedback.modelId ?? null,
      timestamp:       feedback.timestamp,
    });
  }

  /**
   * Full-text search dengan BM25 ranking.
   *
   * BM25 adalah algoritma ranking yang lebih baik dari simple keyword match:
   * - Mempertimbangkan frekuensi term dalam dokumen
   * - Mempertimbangkan panjang dokumen (normalisasi)
   * - SQLite FTS5 bm25() mengembalikan nilai negatif: lebih negatif = lebih relevan
   *
   * Score dinormalisasi ke 0–1 via normalizeBm25() agar bisa
   * digabungkan dengan cosine similarity dari remote search di re-ranking global.
   */
  search(query: string): {
    files:  Array<{ path: string; summary: string; score: number }>;
    memory: Array<{
      id: number;
      type: string;
      content: string;
      source_file?: string;
      scope: string;
      confidence: number;
      score: number;
    }>;
  } {
    const safeQuery = this.sanitizeFtsQuery(query);
    if (!safeQuery) return { files: [], memory: [] };

    const fileSearch = this.db.prepare(`
      SELECT f.id, f.path, f.summary,
             bm25(files_fts) AS bm25_score
      FROM files_fts
      INNER JOIN files f ON f.id = files_fts.rowid
      WHERE files_fts MATCH ?
      ORDER BY bm25(files_fts)
      LIMIT 10
    `);

    const memorySearch = this.db.prepare(`
      SELECT me.id, me.type, me.content, me.source_file,
             COALESCE(me.scope, 'project')  AS scope,
             COALESCE(me.confidence, 1.0)   AS confidence,
             COALESCE(me.pinned, 0)          AS pinned,
             bm25(memory_fts) - (COALESCE(me.pinned, 0) * 5.0) AS adjusted_score
      FROM memory_fts
      INNER JOIN memory_entries me ON me.id = memory_fts.rowid
      WHERE memory_fts MATCH ?
        AND COALESCE(me.confidence, 1.0) >= 0.50
        AND COALESCE(me.scope, 'project') IN ('project', 'user')
      ORDER BY adjusted_score ASC
      LIMIT 10
    `);
    // Catatan scope filter:
    // 'project' = memory untuk project ini (default, cross-session dalam project)
    // 'user'    = memory preferensi personal user (cross-project)
    // 'session' = DIKECUALIKAN — hanya relevan selama session berjalan, tidak boleh bocor ke sesi lain

    try {
      const rawFiles  = fileSearch.all(safeQuery)  as Array<any>;
      const rawMemory = memorySearch.all(safeQuery) as Array<any>;

      return {
        files: rawFiles.map(f => ({
          path:    f.path,
          summary: f.summary,
          score:   this.normalizeBm25(f.bm25_score),
        })),
        memory: rawMemory.map(m => ({
          id:          m.id,
          type:        m.type,
          content:     m.content,
          source_file: m.source_file ?? undefined,
          scope:       m.scope,
          confidence:  m.confidence,
          score:       this.normalizeBm25(m.bm25_score),
        })),
      };
    } catch {
      return { files: [], memory: [] };
    }
  }

  /**
   * Normalisasi BM25 score dari SQLite FTS5 ke range 0–1.
   *
   * SQLite FTS5 bm25() mengembalikan nilai negatif:
   *   0      → tidak ada kata yang cocok
   *   -5     → match sedang (~score 0.25)
   *   -10    → match baik   (~score 0.5)
   *   -20+   → match sangat baik (capped → score 1.0)
   */
  private normalizeBm25(bm25: number): number {
    if (bm25 >= 0) return 0;
    return Math.min(1.0, -bm25 / 20);
  }

  /**
   * Sanitize query untuk FTS5 dengan stopwords dan AND untuk strong terms.
   *
   * Strategi:
   * - Hapus stopwords (kata pendek dan sangat umum)
   * - Strong terms (≥4 karakter) digabung dengan AND → precision tinggi
   * - Weak terms (2–3 karakter, bukan stopword) digabung dengan OR → recall
   * - Kombinasi: (strong AND) OR (weak OR)
   *
   * Contoh:
   *   Input : "fix bug in auth.ts"
   *   Output: "fix* AND auth* AND ts* OR bug*"
   *   Hasil : Entry yang mengandung "auth" dan "ts" diprioritaskan
   */
  private sanitizeFtsQuery(query: string): string {
    const STOPWORDS = new Set([
      // Inggris
      'in', 'on', 'at', 'to', 'of', 'the', 'a', 'an', 'is', 'are', 'was',
      'be', 'by', 'do', 'if', 'or', 'as', 'it', 'he', 'we', 'my', 'up',
      // Indonesia
      'di', 'ke', 'dari', 'yang', 'dan', 'atau', 'ini', 'itu', 'ada', 'untuk',
      'jika', 'jadi', 'bisa', 'agar', 'saat', 'cara',
    ]);

    const sanitized = query
      .toLowerCase()
      .replace(/["'`]/g, ' ')
      .replace(/[(){}[\]^~*:!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) return '';

    const words = sanitized
      .split(' ')
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));

    if (words.length === 0) return '';

    // Strong terms (≥4 char) → AND → precision
    const strong = words.filter(w => w.length >= 4).map(w => `${w}*`);
    // Weak terms (2–3 char, sudah lewat stopwords) → OR → soft recall
    const weak   = words.filter(w => w.length < 4).map(w => `${w}*`);

    const strongQuery = strong.join(' AND ');
    const weakQuery   = weak.join(' OR ');

    return [strongQuery, weakQuery].filter(Boolean).join(' OR ');
  }

  /**
   * Ambil statistik ringkas dari database lokal.
   * Digunakan oleh `nanocli data stats` untuk tampilkan insight.
   */
  getLocalStats(): {
    filesIndexed: number;
    memoryByType: Record<string, number>;
    feedbackTotal: number;
    feedbackGood: number;
    feedbackBad: number;
    feedbackNeutral: number;
  } {
    const filesCount = (this.db.prepare('SELECT COUNT(*) AS c FROM files').get() as any).c as number;

    const typeRows = this.db
      .prepare('SELECT type, COUNT(*) AS c FROM memory_entries GROUP BY type')
      .all() as Array<{ type: string; c: number }>;
    const memoryByType: Record<string, number> = {};
    for (const row of typeRows) memoryByType[row.type] = row.c;

    const fbRows = this.db
      .prepare('SELECT rating, COUNT(*) AS c FROM feedback GROUP BY rating')
      .all() as Array<{ rating: number; c: number }>;
    let good = 0, bad = 0, neutral = 0;
    for (const row of fbRows) {
      if (row.rating === 1)  good    = row.c;
      if (row.rating === -1) bad     = row.c;
      if (row.rating === 0)  neutral = row.c;
    }

    return {
      filesIndexed:    filesCount,
      memoryByType,
      feedbackTotal:   good + bad + neutral,
      feedbackGood:    good,
      feedbackBad:     bad,
      feedbackNeutral: neutral,
    };
  }

  close() {
    if (this.db) this.db.close();
  }
}
