/**
 * diffPreview.ts
 *
 * Generate dan render unified diff antara konten lama dan baru.
 * Digunakan sebelum file write/patch untuk menampilkan perubahan.
 */

import { createPatch, diffLines } from 'diff';
import chalk from 'chalk';

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export class DiffPreview {
  /**
   * Generate unified diff string (format standar).
   */
  generateUnifiedDiff(
    oldContent: string,
    newContent: string,
    filename: string,
    context: number = 3,
  ): string {
    return createPatch(filename, oldContent, newContent, 'Original', 'Modified', { context });
  }

  /**
   * Render diff ke terminal dengan warna chalk.
   * Kembalikan string yang sudah siap di-print.
   */
  renderDiff(oldContent: string, newContent: string, filename: string): string {
    const changes = diffLines(oldContent, newContent);
    const lines: string[] = [];
    let lineNum = 0;

    for (const part of changes) {
      const partLines = part.value.split('\n');
      // Hilangkan baris kosong terakhir (artifact dari split)
      if (partLines[partLines.length - 1] === '') partLines.pop();

      for (const line of partLines) {
        lineNum++;
        if (part.added) {
          lines.push(chalk.green(`+ ${line}`));
        } else if (part.removed) {
          lines.push(chalk.red(`- ${line}`));
        } else {
          lines.push(chalk.gray(`  ${line}`));
        }
      }
    }

    const header = chalk.bold.cyan(`\n  Diff: ${filename}`);
    const separator = chalk.gray('  ' + '─'.repeat(60));
    const body = lines.map(l => '  ' + l).join('\n');
    return `${header}\n${separator}\n${body}\n${separator}`;
  }

  /**
   * Hitung statistik diff (berapa baris ditambah/dihapus).
   */
  getStats(oldContent: string, newContent: string): DiffStats {
    const changes = diffLines(oldContent, newContent);
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const part of changes) {
      const count = part.value.split('\n').filter(l => l !== '').length;
      if (part.added) added += count;
      else if (part.removed) removed += count;
      else unchanged += count;
    }

    return { added, removed, unchanged };
  }

  /**
   * Render stats diff dalam satu baris.
   * Contoh: "+12 / -3 lines"
   */
  renderStats(stats: DiffStats): string {
    const parts: string[] = [];
    if (stats.added > 0) parts.push(chalk.green(`+${stats.added}`));
    if (stats.removed > 0) parts.push(chalk.red(`-${stats.removed}`));
    if (parts.length === 0) parts.push(chalk.gray('no changes'));
    return parts.join(' / ') + chalk.gray(' lines');
  }
}
