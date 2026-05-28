/**
 * fileOperationManager.ts
 *
 * Orchestrator utama untuk semua operasi file di NanoCLI.
 *
 * Pipeline write:
 * PathGuard → FileRiskAnalyzer → FileApprovalGate → BackupManager → Write → Return Result
 *
 * Pipeline read:
 * PathGuard → safeReadTextFile → Return content
 */

import fs from 'fs-extra';
import path from 'path';
import { PathGuard } from './pathGuard';
import { FileRiskAnalyzer } from './fileRiskAnalyzer';
import { BackupManager } from './backupManager';
import { FileApprovalGate } from './fileApprovalGate';
import { DiffPreview } from './diffPreview';
import { safeReadTextFile } from '../files/safeFileReader';
import { FileWriteMode, FileOperationResult } from './fileTypes';
import { Renderer } from '../ui/render';

export interface WriteOptions {
  /** Tampilkan approval gate sebelum menulis (default: true) */
  requireApproval?: boolean;
  /** Alasan operasi ini (untuk ditampilkan di approval) */
  reason?: string;
  /** Tampilkan diff preview sebelum konfirmasi */
  showDiff?: boolean;
  /** Auto-approve tanpa prompt (untuk --yes flag) */
  autoApprove?: boolean;
}

export class FileOperationManager {
  private pathGuard: PathGuard;
  private riskAnalyzer: FileRiskAnalyzer;
  private backupManager: BackupManager;
  private approvalGate: FileApprovalGate;
  private diffPreview: DiffPreview;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
    this.pathGuard = new PathGuard(projectRoot);
    this.riskAnalyzer = new FileRiskAnalyzer();
    this.backupManager = new BackupManager(projectRoot);
    this.approvalGate = new FileApprovalGate();
    this.diffPreview = new DiffPreview();
  }

  /**
   * Tulis konten ke file dengan full safety pipeline.
   */
  async write(
    filePath: string,
    content: string,
    mode: FileWriteMode = 'create',
    options: WriteOptions = {},
  ): Promise<FileOperationResult> {
    const { requireApproval = true, reason, showDiff = true, autoApprove = false } = options;

    // 1. Path Guard
    const guardResult = this.pathGuard.validate(filePath);
    if (!guardResult.safe) {
      const r: FileOperationResult = { success: false, path: filePath, action: mode };
      if (guardResult.reason) r.error = guardResult.reason;
      return r;
    }

    const { absolutePath, relativePath } = guardResult;
    const fileExists = await fs.pathExists(absolutePath);

    // 2. Baca konten lama (untuk diff dan backup)
    let oldContent: string | undefined;
    let oldSizeBytes: number | undefined;
    if (fileExists) {
      try {
        const stat = await fs.stat(absolutePath);
        oldSizeBytes = stat.size;
        oldContent = await fs.readFile(absolutePath, 'utf-8');
      } catch {
        // file mungkin binary atau tidak bisa dibaca — lanjutkan
      }
    }

    // 3. Guard: mode 'create' TIDAK boleh menimpa file yang sudah ada.
    // Jika file sudah ada dan mode adalah 'create', tolak operasi dengan
    // pesan yang mengarahkan user ke mode 'overwrite' secara eksplisit.
    // Ini mencegah agent menimpa file yang tidak seharusnya ditimpa.
    if (mode === 'create' && fileExists) {
      return {
        success: false,
        path: relativePath,
        action: mode,
        error: `File sudah ada: ${relativePath}. Gunakan mode 'overwrite' untuk menimpa.`,
      };
    }

    // 4. Risk Analysis
    const risk = this.riskAnalyzer.analyze({
      relativePath,
      mode,
      fileExists,
      ...(oldSizeBytes !== undefined && { sizeBytes: oldSizeBytes }),
    });

    if (risk.blocked) {
      return { success: false, path: relativePath, action: mode, error: `Diblokir: ${risk.reasons.join(', ')}` };
    }

    // 5. Approval Gate
    if (requireApproval && !autoApprove) {
      let diffStr: string | undefined;

      if (showDiff && oldContent !== undefined) {
        diffStr = this.diffPreview.renderDiff(oldContent, content, relativePath);
      }

      const approval = await this.approvalGate.ask({
        path: relativePath,
        mode,
        risk: risk.level,
        ...(reason !== undefined && { reason }),
        sizeChars: content.length,
        ...(diffStr ? { showDiff: () => console.log(diffStr) } : {}),
      });

      if (!approval.approved) {
        return { success: false, path: relativePath, action: mode, error: `Dibatalkan: ${approval.reason}` };
      }
    }

    // 6. Backup sebelum overwrite
    // Catatan: mode 'create' tidak pernah sampai di sini jika file sudah ada
    // (sudah ditolak oleh guard di atas). Backup hanya relevan untuk 'overwrite'.
    let backupPath: string | undefined;
    if (fileExists && mode === 'overwrite') {
      const backup = await this.backupManager.backup(absolutePath);
      backupPath = backup?.backupPath;
    }

    // 7. Tulis file
    try {
      await fs.ensureDir(path.dirname(absolutePath));

      if (mode === 'append' && fileExists) {
        await fs.appendFile(absolutePath, content, 'utf-8');
      } else {
        await fs.writeFile(absolutePath, content, 'utf-8');
      }

      const stat = await fs.stat(absolutePath);

      // 8. Generate diff untuk summary
      let diff: string | undefined;
      if (oldContent !== undefined) {
        const stats = this.diffPreview.getStats(oldContent, content);
        diff = this.diffPreview.renderStats(stats);
      }

      const result: FileOperationResult = {
        success: true,
        path: relativePath,
        action: mode,
        sizeBytes: stat.size,
      };
      if (diff !== undefined) result.diff = diff;
      if (backupPath !== undefined) result.backupPath = backupPath;
      return result;
    } catch (err: any) {
      return { success: false, path: relativePath, action: mode, error: err.message };
    }
  }

  /**
   * Baca file dengan safety check.
   */
  async read(filePath: string): Promise<{ content: string; relativePath: string } | null> {
    try {
      const result = await safeReadTextFile(filePath, {
        projectRoot: this.projectRoot,
        maxBytes: 500_000,
      });
      return { content: result.content, relativePath: result.relativePath };
    } catch {
      return null;
    }
  }

  /**
   * Buat direktori baru.
   */
  async mkdir(dirPath: string): Promise<FileOperationResult> {
    const guardResult = this.pathGuard.validateDir(dirPath);
    if (!guardResult.safe) {
      const r: FileOperationResult = { success: false, path: dirPath, action: 'mkdir' };
      if (guardResult.reason) r.error = guardResult.reason;
      return r;
    }

    try {
      await fs.ensureDir(guardResult.absolutePath);
      return { success: true, path: guardResult.relativePath, action: 'mkdir' };
    } catch (err: any) {
      return { success: false, path: dirPath, action: 'mkdir', error: err.message };
    }
  }

  /**
   * Shortcut: render hasil operasi ke console.
   */
  printResult(result: FileOperationResult): void {
    if (result.success) {
      Renderer.printStatus(
        `✓ ${result.action.toUpperCase()} ${result.path}` +
          (result.diff ? ` (${result.diff})` : ''),
        'success',
      );
      if (result.backupPath) {
        const relBackup = path.relative(this.projectRoot, result.backupPath);
        Renderer.printStatus(`  Backup: ${relBackup}`, 'info');
      }
    } else {
      Renderer.printStatus(`✗ ${result.error ?? 'Operasi gagal'}`, 'error');
    }
  }
}
