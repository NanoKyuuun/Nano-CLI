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

/**
 * Representasi baris di tabel `memory_entries`.
 *
 * Kolom baru (scope, source, confidence, pinned, superseded_by) ditambahkan
 * via migrasi PRAGMA di indexer.ts#runSchemaMigrations() — aman untuk DB lama.
 */
export interface MemoryEntryRow {
  id?: number;
  /** Tipe konten memory — lihat MemoryEntryType */
  type: string;
  content: string;
  source_file: string | null;
  timestamp: number;
  /** Scope memory: project (default) | user | session */
  scope?: string;
  /**
   * Asal memory:
   * - 'manual'          : user simpan via /memory save
   * - 'chat_extractor'  : otomatis dari MemoryExtractor saat /exit
   * - 'agent'           : agent menyimpan via tool call
   * - 'command'         : command nanocli (debug, plan, dll.)
   */
  source?: string;
  /** Keyakinan relevansi memory (0.0–1.0). Hasil ekstraksi otomatis < 1.0. */
  confidence?: number;
  /** Jika 1 (true), memory ini diprioritaskan di RAG retrieval. */
  pinned?: number;
  /**
   * ID memory_entries yang menggantikan entri ini.
   * Diisi jika ada konflik preferensi dan user memilih entri yang lebih baru.
   */
  superseded_by?: number | null;
}

/**
 * Tipe-tipe memory yang tersedia.
 *
 * MVP auto-save hanya mengizinkan: preference, coding_style, constraint, decision.
 * Tipe bug, solution, fact hanya bisa disimpan via /memory save (manual)
 * karena lebih rawan noise dan konteks usang.
 */
export type MemoryEntryType =
  | 'preference'    // preferensi user: tools, command, library pilihan
  | 'coding_style'  // gaya coding: naming, format, konvensi
  | 'decision'      // keputusan arsitektur atau teknologi
  | 'constraint'    // batasan kerja: jangan lakukan X
  | 'bug'           // bug yang pernah ditemukan (manual only)
  | 'solution'      // solusi yang pernah berhasil (manual only)
  | 'fact'          // fakta project (manual only)
  | 'todo'
  | 'style'
  | 'dependency'
  | 'web';

/** Type guard untuk MVP auto-save: hanya tipe ini yang boleh disimpan otomatis. */
export const MVP_AUTO_SAVE_TYPES = new Set<MemoryEntryType>([
  'preference',
  'coding_style',
  'constraint',
  'decision',
]);
