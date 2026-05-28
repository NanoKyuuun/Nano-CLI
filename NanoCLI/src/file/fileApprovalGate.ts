/**
 * fileApprovalGate.ts
 *
 * Gate approval untuk operasi file — ditampilkan sebelum write/overwrite.
 * Mirip dengan approvalGate.ts untuk terminal, tapi khusus operasi file.
 *
 * Tampilan:
 * ╭─ File Write Proposal ──────────────────────────────────╮
 * │ Action  : CREATE                                        │
 * │ Path    : docs/PRD-login.md                             │
 * │ Risk    : Low                                           │
 * │ Reason  : User meminta PRD fitur login                  │
 * ╰────────────────────────────────────────────────────────╯
 * ? Proceed? Write / Preview / Edit Path / Cancel
 */

import chalk from 'chalk';
import enquirer from 'enquirer';
import { FileWriteMode, FileRiskLevel, FileApprovalResult } from './fileTypes';

export class FileApprovalGate {
  /**
   * Tampilkan proposal dan minta approval dari user.
   */
  async ask(options: {
    path: string;
    mode: FileWriteMode;
    risk: FileRiskLevel;
    reason?: string;
    sizeChars?: number;
    showDiff?: () => void;
  }): Promise<FileApprovalResult> {
    const riskColors: Record<FileRiskLevel, chalk.Chalk> = {
      low: chalk.green,
      medium: chalk.yellow,
      high: chalk.red,
      blocked: chalk.bgRed.white,
    };
    const riskColor = riskColors[options.risk] ?? chalk.white;

    const modeLabel = options.mode.toUpperCase();
    const sizeLabel = options.sizeChars
      ? `  ${chalk.gray('Size')}    : ${chalk.white((options.sizeChars / 1000).toFixed(1) + ' KB')}\n`
      : '';

    console.log();
    console.log(chalk.bold.cyan('  ╭─ File Proposal ') + chalk.cyan('─'.repeat(44) + '╮'));
    console.log(`  │ ${chalk.gray('Action')}  : ${chalk.bold.white(modeLabel)}`);
    console.log(`  │ ${chalk.gray('Path')}    : ${chalk.bold.white(options.path)}`);
    console.log(`  │ ${chalk.gray('Risk')}    : ${riskColor(options.risk.toUpperCase())}`);
    if (options.reason) {
      const reason = options.reason.length > 52 ? options.reason.slice(0, 49) + '...' : options.reason;
      console.log(`  │ ${chalk.gray('Reason')}  : ${chalk.white(reason)}`);
    }
    if (sizeLabel) process.stdout.write('  │ ' + sizeLabel);
    console.log(chalk.cyan('  ╰' + '─'.repeat(62) + '╯'));
    console.log();

    if (options.risk === 'blocked') {
      console.log(chalk.red('  ✗ Operasi ini diblokir oleh policy.'));
      return { approved: false, reason: 'blocked_by_policy' };
    }

    // Bangun pilihan berdasarkan mode
    const choices: string[] = ['Write file'];
    if (options.showDiff) choices.push('Preview diff terlebih dahulu');
    choices.push('Batalkan');

    try {
      const { action } = await (enquirer as any).prompt({
        type: 'select',
        name: 'action',
        message: 'Lanjutkan operasi file?',
        choices,
      });

      if (action === 'Write file') {
        return { approved: true, reason: 'user_approved' };
      }

      if (action === 'Preview diff terlebih dahulu' && options.showDiff) {
        options.showDiff();
        // Tanya lagi setelah preview
        const { confirm } = await (enquirer as any).prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'Apply perubahan?',
          initial: true,
        });
        return {
          approved: confirm,
          reason: confirm ? 'user_approved_after_preview' : 'user_rejected',
        };
      }

      return { approved: false, reason: 'user_cancelled' };
    } catch {
      // Ctrl+C
      return { approved: false, reason: 'user_cancelled' };
    }
  }

  /**
   * Auto-approve untuk low-risk create (non-interactive mode).
   */
  autoApprove(): FileApprovalResult {
    return { approved: true, reason: 'auto_approved' };
  }
}
