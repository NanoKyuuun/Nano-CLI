/**
 * approvalGate.ts
 *
 * Menampilkan UI approval ke user sebelum command dijalankan.
 * Menampilkan: command, CWD, shell, risk level, alasan risiko.
 *
 * Blocked command → otomatis reject tanpa tanya.
 * High risk → pilihan: allow_once / edit / reject.
 * Medium/Low → pilihan: allow / edit / reject.
 */

const { Select, Input } = require('enquirer');
import chalk from 'chalk';
import { CommandRiskResult } from '../terminal/terminalTypes';

export interface ApprovalResult {
  approved: boolean;
  editedCommand?: string;
  reason?: string;
}

const RISK_COLORS: Record<string, (text: string) => string> = {
  low:     chalk.green,
  medium:  chalk.yellow,
  high:    chalk.red,
  blocked: chalk.bgRed.white,
};

export class ApprovalGate {
  /**
   * Tampilkan prompt approval untuk command yang akan dijalankan.
   * Return ApprovalResult yang menentukan apakah command diizinkan.
   */
  async ask(options: {
    command: string;
    cwd: string;
    shellName?: string;
    risk: CommandRiskResult;
    reason?: string;
  }): Promise<ApprovalResult> {
    const colorFn = RISK_COLORS[options.risk.level] ?? chalk.white;

    console.log('\n' + chalk.bold.yellow('┌─ NanoCLI Terminal Bridge ─────────────────────────┐'));
    console.log(chalk.bold.yellow('│') + ' Command yang akan dijalankan:');
    console.log(chalk.bold.yellow('│'));
    console.log(chalk.bold.yellow('│') + chalk.cyan(`   $ ${options.command}`));
    console.log(chalk.bold.yellow('│'));
    console.log(chalk.bold.yellow('│') + chalk.gray(` CWD   : ${options.cwd}`));
    if (options.shellName) {
      console.log(chalk.bold.yellow('│') + chalk.gray(` Shell : ${options.shellName}`));
    }
    console.log(chalk.bold.yellow('│') + ` Risk  : ${colorFn(options.risk.level.toUpperCase())}`);

    if (options.reason) {
      console.log(chalk.bold.yellow('│') + chalk.gray(` Alasan: ${options.reason}`));
    }

    if (options.risk.reasons.length > 0) {
      console.log(chalk.bold.yellow('│'));
      console.log(chalk.bold.yellow('│') + chalk.dim(' Alasan risiko:'));
      for (const r of options.risk.reasons) {
        console.log(chalk.bold.yellow('│') + chalk.dim(`   • ${r}`));
      }
    }

    console.log(chalk.bold.yellow('└──────────────────────────────────────────────────┘'));

    // ── Blocked → otomatis reject ──────────────────────────
    if (options.risk.blocked) {
      console.log(chalk.bgRed.white.bold('\n  ✗ BLOCKED ') + chalk.red(' Command ini diblokir oleh security policy.\n'));
      return { approved: false, reason: 'blocked_by_policy' };
    }

    // ── Build choices berdasarkan risk level ────────────────
    const choices = options.risk.level === 'high'
      ? [
          { name: 'allow_once', message: chalk.yellow('⚠ Allow once — saya paham risikonya') },
          { name: 'edit',       message: 'Edit command terlebih dahulu' },
          { name: 'reject',     message: chalk.red('Reject') },
        ]
      : [
          { name: 'allow',  message: chalk.green('✓ Allow') },
          { name: 'edit',   message: 'Edit command' },
          { name: 'reject', message: chalk.red('✗ Reject') },
        ];

    let action: string;
    try {
      action = await new Select({
        name: 'action',
        message: 'Pilih aksi',
        choices,
      }).run();
    } catch {
      // User tekan Escape / Ctrl+C
      return { approved: false, reason: 'cancelled' };
    }

    if (action === 'reject') {
      return { approved: false, reason: 'user_rejected' };
    }

    if (action === 'edit') {
      let edited: string;
      try {
        edited = await new Input({
          name: 'command',
          message: 'Edit command',
          initial: options.command,
        }).run();
      } catch {
        return { approved: false, reason: 'cancelled' };
      }

      if (!edited?.trim()) {
        return { approved: false, reason: 'empty_command' };
      }

      return {
        approved: true,
        editedCommand: edited.trim(),
      };
    }

    // allow / allow_once
    return { approved: true };
  }
}
