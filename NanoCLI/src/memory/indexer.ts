import Database from 'better-sqlite3';
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
}

export class Indexer {
  private db: any;
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

      -- Triggers for memory_fts
      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
        INSERT INTO memory_fts(rowid, content, type) VALUES (new.id, new.content, new.type);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, type) VALUES('delete', old.id, old.content, old.type);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, type) VALUES('delete', old.id, old.content, old.type);
        INSERT INTO memory_fts(rowid, content, type) VALUES (new.id, new.content, new.type);
      END;
    `);
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

  addMemoryEntry(entry: MemoryEntry) {
    const insert = this.db.prepare(`
      INSERT INTO memory_entries (type, content, source_file, timestamp)
      VALUES (@type, @content, @sourceFile, @timestamp)
    `);
    insert.run(entry);
  }

  search(query: string) {
    // Fix Bug 3.13: sanitize query sebelum dikirim ke FTS5
    // Karakter kutip, operator, dan simbol khusus bisa menyebabkan SQLite error
    const safeQuery = this.sanitizeFtsQuery(query);

    if (!safeQuery) {
      return { files: [], memory: [] };
    }

    // Search using FTS5 for high performance
    const fileSearch = this.db.prepare(`
      SELECT * FROM files 
      WHERE id IN (SELECT rowid FROM files_fts WHERE files_fts MATCH ?)
      LIMIT 10
    `);
    
    const memorySearch = this.db.prepare(`
      SELECT * FROM memory_entries 
      WHERE id IN (SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?)
      LIMIT 10
    `);

    try {
      return {
        files: fileSearch.all(safeQuery),
        memory: memorySearch.all(safeQuery)
      };
    } catch {
      // Fallback jika FTS masih error: kembalikan kosong daripada crash
      return { files: [], memory: [] };
    }
  }

  /**
   * Fix Bug 3.13: Sanitize query untuk FTS5.
   * Menghapus karakter khusus dan memformat query sebagai prefix search.
   */
  private sanitizeFtsQuery(query: string): string {
    const sanitized = query
      .replace(/["'`]/g, ' ')           // hapus kutip
      .replace(/[(){}[\]^~*:!]/g, ' ')  // hapus operator FTS
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) return '';

    // Ubah menjadi prefix search per kata agar lebih toleran
    const terms = sanitized
      .split(' ')
      .filter(t => t.length >= 2)       // skip token terlalu pendek
      .map(t => `${t}*`)
      .join(' OR ');

    return terms || '';
  }

  close() {
    if (this.db) this.db.close();
  }
}
