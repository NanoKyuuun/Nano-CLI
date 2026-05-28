/**
 * backupManager.ts
 *
 * Membuat backup file ke .nanocli/backups/ sebelum overwrite.
 * Menyimpan manifest backup untuk mendukung `nanocli undo`.
 *
 * Format nama backup: {basename}.{timestamp}.bak
 * Manifest: .nanocli/backups/manifest.json
 */

import fs from 'fs-extra';
import path from 'path';
import { BackupEntry } from './fileTypes';

const MANIFEST_FILE = '.nanocli/backups/manifest.json';
const BACKUP_DIR = '.nanocli/backups';
/** Jumlah maksimum backup yang disimpan (FIFO) */
const MAX_BACKUPS = 50;

export class BackupManager {
  private projectRoot: string;
  private backupDir: string;
  private manifestPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.backupDir = path.join(this.projectRoot, BACKUP_DIR);
    this.manifestPath = path.join(this.projectRoot, MANIFEST_FILE);
  }

  /**
   * Backup file sebelum diubah.
   * Kembalikan BackupEntry atau null jika file tidak ada (tidak perlu backup).
   */
  async backup(absolutePath: string): Promise<BackupEntry | null> {
    if (!(await fs.pathExists(absolutePath))) {
      return null; // File baru, tidak perlu backup
    }

    await fs.ensureDir(this.backupDir);

    const stat = await fs.stat(absolutePath);
    const basename = path.basename(absolutePath);
    const timestamp = Date.now();
    const backupName = `${basename}.${timestamp}.bak`;
    const backupPath = path.join(this.backupDir, backupName);

    await fs.copy(absolutePath, backupPath);

    const entry: BackupEntry = {
      originalPath: absolutePath,
      backupPath,
      timestamp,
      sizeBytes: stat.size,
    };

    await this.appendManifest(entry);
    return entry;
  }

  /**
   * Restore file dari backup entry.
   */
  async restore(entry: BackupEntry): Promise<void> {
    if (!(await fs.pathExists(entry.backupPath))) {
      throw new Error(`Backup tidak ditemukan: ${entry.backupPath}`);
    }
    await fs.ensureDir(path.dirname(entry.originalPath));
    await fs.copy(entry.backupPath, entry.originalPath, { overwrite: true });
  }

  /**
   * Ambil backup terakhir dari manifest.
   */
  async getLastBackup(): Promise<BackupEntry | null> {
    const entries = await this.readManifest();
    return entries.length > 0 ? entries[entries.length - 1]! : null;
  }

  /**
   * Ambil semua backup dari manifest (terbaru di akhir).
   */
  async getAllBackups(): Promise<BackupEntry[]> {
    return this.readManifest();
  }

  /**
   * Hapus backup dan entry dari manifest.
   */
  async deleteBackup(entry: BackupEntry): Promise<void> {
    await fs.remove(entry.backupPath).catch(() => {});
    const entries = await this.readManifest();
    const filtered = entries.filter(e => e.backupPath !== entry.backupPath);
    await fs.writeJson(this.manifestPath, filtered, { spaces: 2 });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async readManifest(): Promise<BackupEntry[]> {
    if (!(await fs.pathExists(this.manifestPath))) return [];
    try {
      return await fs.readJson(this.manifestPath);
    } catch {
      return [];
    }
  }

  private async appendManifest(entry: BackupEntry): Promise<void> {
    let entries = await this.readManifest();
    entries.push(entry);

    // FIFO: hapus backup lama jika melebihi batas
    if (entries.length > MAX_BACKUPS) {
      const toDelete = entries.slice(0, entries.length - MAX_BACKUPS);
      for (const old of toDelete) {
        await fs.remove(old.backupPath).catch(() => {});
      }
      entries = entries.slice(entries.length - MAX_BACKUPS);
    }

    await fs.writeJson(this.manifestPath, entries, { spaces: 2 });
  }
}
