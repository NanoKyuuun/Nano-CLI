/**
 * fileTypes.ts
 *
 * Type definitions untuk semua file operation di NanoCLI.
 * Semua komponen file/ mengacu ke file ini.
 */

// ─── Write Mode ───────────────────────────────────────────────────────────────

export type FileWriteMode = 'create' | 'overwrite' | 'append';

// ─── Risk Level ───────────────────────────────────────────────────────────────

export type FileRiskLevel = 'low' | 'medium' | 'high' | 'blocked';

// ─── Actions (Tool Call dari model AI) ────────────────────────────────────────

export interface FileWriteAction {
  type: 'file.write';
  path: string;
  content: string;
  mode: FileWriteMode;
  reason: string;
}

export interface FilePatchAction {
  type: 'file.patch';
  path: string;
  patch: string;        // unified diff atau full file replacement
  reason: string;
}

export interface FileReadAction {
  type: 'file.read';
  path: string;
  reason?: string;
}

export interface FileMkdirAction {
  type: 'file.mkdir';
  path: string;
  reason?: string;
}

export type FileAction =
  | FileWriteAction
  | FilePatchAction
  | FileReadAction
  | FileMkdirAction;

// ─── Risk Analysis Result ─────────────────────────────────────────────────────

export interface FileRiskResult {
  level: FileRiskLevel;
  reasons: string[];
  blocked: boolean;
}

// ─── Operation Result ─────────────────────────────────────────────────────────

export interface FileOperationResult {
  success: boolean;
  path: string;
  action: string;
  /** Unified diff antara konten lama dan baru (jika overwrite) */
  diff?: string;
  /** Path backup sebelum overwrite */
  backupPath?: string;
  error?: string;
  /** Ukuran file setelah operasi dalam bytes */
  sizeBytes?: number;
}

// ─── Approval Result ──────────────────────────────────────────────────────────

export interface FileApprovalResult {
  approved: boolean;
  reason: string;
  /** Path yang mungkin diedit oleh user */
  editedPath?: string;
}

// ─── Backup Entry ─────────────────────────────────────────────────────────────

export interface BackupEntry {
  originalPath: string;
  backupPath: string;
  timestamp: number;
  sizeBytes: number;
}
