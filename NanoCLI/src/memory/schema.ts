/**
 * Plain TypeScript interfaces yang mencerminkan schema SQLite aktual di indexer.ts.
 *
 * File ini tidak menggunakan ORM apapun. Semua DDL ada di indexer.ts (better-sqlite3).
 * Dibersihkan dari drizzle-orm dependency yang tidak digunakan.
 */

/** Representasi baris di tabel `files`. */
export interface FileIndexRow {
  id?: number;
  path: string;
  hash: string;
  summary: string | null;
  last_indexed: number;
}

/** Representasi baris di tabel `memory_entries`. */
export interface MemoryEntryRow {
  id?: number;
  type: string;   // 'decision' | 'bug' | 'todo' | 'style' | 'dependency' | dll
  content: string;
  source_file: string | null;
  timestamp: number;
}

/**
 * Tipe-tipe memory yang tersedia saat ini.
 * Akan diperluas saat Adaptive Memory (Tahap 6 roadmap) diimplementasikan.
 */
export type MemoryEntryType =
  | 'decision'
  | 'bug'
  | 'solution'
  | 'todo'
  | 'style'
  | 'dependency'
  | 'preference'
  | 'web';
