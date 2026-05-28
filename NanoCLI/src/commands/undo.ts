/**
 * undo.ts
 *
 * Command: nanocli undo [last|--list]
 *
 * Restore file dari backup yang dibuat sebelum operasi write/patch.
 *   nanocli undo          — undo operasi terakhir
 *   nanocli undo last     — sama dengan di atas
 *   nanocli undo --list   — tampilkan daftar backup yang tersedia
 */

import chalk from 'chalk';
import path from 'path';
import enquirer from 'enquirer';
import { BackupManager } from '../file/backupManager';
import { BackupEntry } from '../file/fileTypes';
import { Renderer } from '../ui/render';

export class UndoCommand {
  private backupManager: BackupManager;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.backupManager = new BackupManager(projectRoot);
  }

  async execute(options: any) {
    const listMode: boolean = options.list ?? false;

    if (listMode) {
      await this.showList();
      return;
    }

    await this.undoLast();
  }

  private async undoLast(): Promise<void> {
    const last = await this.backupManager.getLastBackup();

    if (!last) {
      Renderer.printStatus('Tidak ada backup yang tersedia untuk di-undo.', 'warn');
      return;
    }

    const relPath = path.relative(this.projectRoot, last.originalPath);
    const backupDate = new Date(last.timestamp).toLocaleString();

    console.log();
    console.log(chalk.bold.cyan('  ╭─ Undo Operation ') + chalk.cyan('─'.repeat(43) + '╮'));
    console.log(`  │ ${chalk.gray('File')}    : ${chalk.white(relPath)}`);
    console.log(`  │ ${chalk.gray('Backup')}  : ${chalk.white(backupDate)}`);
    console.log(`  │ ${chalk.gray('Size')}    : ${chalk.white((last.sizeBytes / 1024).toFixed(1) + ' KB')}`);
    console.log(chalk.cyan('  ╰' + '─'.repeat(62) + '╯'));
    console.log();

    try {
      const { confirm } = await (enquirer as any).prompt({
        type: 'confirm',
        name: 'confirm',
        message: `Restore ${relPath} ke versi backup?`,
        initial: true,
      });

      if (!confirm) {
        Renderer.printStatus('Undo dibatalkan.', 'info');
        return;
      }
    } catch {
      Renderer.printStatus('Undo dibatalkan.', 'info');
      return;
    }

    try {
      await this.backupManager.restore(last);
      await this.backupManager.deleteBackup(last);
      Renderer.printStatus(`✓ File di-restore: ${relPath}`, 'success');
    } catch (err: any) {
      Renderer.printStatus(`Gagal restore: ${err.message}`, 'error');
    }
  }

  private async showList(): Promise<void> {
    const backups = await this.backupManager.getAllBackups();

    if (backups.length === 0) {
      Renderer.printStatus('Tidak ada backup yang tersedia.', 'info');
      return;
    }

    console.log();
    console.log(chalk.bold.cyan(`  Backup History (${backups.length} entries)`));
    console.log(chalk.gray('  ' + '─'.repeat(60)));

    // Tampilkan dari terbaru ke terlama
    const sorted = [...backups].reverse();
    sorted.forEach((entry: BackupEntry, i: number) => {
      const relPath = path.relative(this.projectRoot, entry.originalPath);
      const date = new Date(entry.timestamp).toLocaleString();
      const size = (entry.sizeBytes / 1024).toFixed(1) + ' KB';
      const num = chalk.gray(`  [${i + 1}]`);
      console.log(`${num} ${chalk.white(relPath)} ${chalk.gray(`— ${date} — ${size}`)}`);
    });
    console.log();
    console.log(chalk.gray('  Jalankan `nanocli undo` untuk restore operasi terakhir.'));
    console.log();
  }
}
