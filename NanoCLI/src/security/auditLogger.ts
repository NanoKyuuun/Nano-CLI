/**
 * auditLogger.ts
 *
 * Menyimpan audit log terminal commands ke:
 *   .nanocli/logs/terminal-audit.jsonl
 *
 * Format: JSON Lines — satu event per baris.
 * Semua data di-redact sebelum ditulis.
 *
 * TIDAK PERNAH menyimpan:
 * - password
 * - token / API key
 * - private key
 * - raw env values
 * - output mentah (hanya summary)
 */

import fs from 'fs-extra';
import path from 'path';
import { SecretRedactor } from './secretRedactor';

export interface AuditEntry {
  timestamp: string;
  type: string;
  session?: string;
  shell?: string;
  cwd?: string;
  command?: string;
  risk?: string;
  approved?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  reason?: string;
  [key: string]: unknown;
}

export class AuditLogger {
  private logPath: string;
  private redactor: SecretRedactor;

  constructor(projectRoot: string = process.cwd()) {
    this.logPath = path.join(projectRoot, '.nanocli', 'logs', 'terminal-audit.jsonl');
    this.redactor = new SecretRedactor();
  }

  /**
   * Tulis satu event ke audit log.
   * Semua string values di-redact otomatis.
   */
  async log(event: Record<string, unknown>): Promise<void> {
    try {
      // Redact semua string values dalam event
      const safeEvent: AuditEntry = {
        timestamp: new Date().toISOString(),
        type: 'unknown',
      };

      for (const [key, value] of Object.entries(event)) {
        if (typeof value === 'string') {
          safeEvent[key] = this.redactor.redact(value);
        } else {
          safeEvent[key] = value;
        }
      }

      // Pastikan timestamp selalu ada
      if (!safeEvent.timestamp) {
        safeEvent.timestamp = new Date().toISOString();
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.logPath));

      // Append JSONL
      await fs.appendFile(this.logPath, JSON.stringify(safeEvent) + '\n', 'utf-8');
    } catch {
      // Jangan crash jika log gagal — audit log adalah best-effort
    }
  }

  /**
   * Log hasil eksekusi command (setelah selesai).
   */
  async logExecution(entry: {
    command: string;
    session?: string;
    shell?: string;
    cwd: string;
    risk: string;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    redacted: boolean;
  }): Promise<void> {
    await this.log({
      type: 'terminal.execution',
      ...entry,
    });
  }
}
