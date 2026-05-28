/**
 * terminal.ts (command)
 *
 * CLI command untuk Secure Terminal Bridge.
 * Sub-commands:
 *   nanocli terminal detect    — deteksi shell yang tersedia
 *   nanocli terminal run <cmd> — jalankan command dengan approval + redaction
 *
 * Semua command melewati PolicyEngine sebelum dieksekusi.
 */

import chalk from 'chalk';
import { ShellDetector } from '../terminal/shellDetector';
import { CommandExecutor } from '../terminal/commandExecutor';
import { PolicyEngine } from '../security/policyEngine';
import { Renderer } from '../ui/render';

export class TerminalCommand {
  private shellDetector: ShellDetector;
  private executor: CommandExecutor;
  private policy: PolicyEngine;

  constructor(projectRoot: string = process.cwd()) {
    this.shellDetector = new ShellDetector();
    this.executor = new CommandExecutor(projectRoot);
    this.policy = new PolicyEngine(projectRoot);
  }

  /**
   * Deteksi dan tampilkan shell yang tersedia di sistem.
   */
  async detect(): Promise<void> {
    const os = this.shellDetector.detectOS();
    const shells = await this.shellDetector.detectShells();

    console.log('\n' + chalk.bold.cyan('┌─ Shell Detection ───────────────────────────────────┐'));
    console.log(chalk.bold.cyan('│') + chalk.gray(` OS: ${os}`));
    console.log(chalk.bold.cyan('└─────────────────────────────────────────────────────┘'));

    if (shells.length === 0) {
      Renderer.printStatus('Tidak ada shell yang terdeteksi.', 'error');
      return;
    }

    const rows = shells.map((s, i) => [
      i === 0 ? chalk.green('★') : ' ',
      s.id,
      s.name,
      s.command,
      String(s.priority),
    ]);

    Renderer.renderTable(['', 'ID', 'Nama', 'Command', 'Priority'], rows);
    console.log(chalk.dim(`\n  ${chalk.green('★')} = default shell\n`));
  }

  /**
   * Jalankan command lokal dengan approval dan redaction.
   *
   * @param command - Command string
   * @param options.cwd - Working directory (default: process.cwd())
   * @param options.yes - Skip approval untuk low-risk (TETAP jalankan risk analyzer)
   */
  async run(command: string, options: { cwd?: string; yes?: boolean; timeout?: string } = {}): Promise<any> {
    const cwd = options.cwd ?? process.cwd();
    const timeoutMs = options.timeout ? parseInt(options.timeout, 10) * 1000 : 300_000;

    // 1. Deteksi shell
    let shell;
    try {
      shell = await this.shellDetector.getDefaultShell();
    } catch (err: any) {
      Renderer.printStatus(err.message, 'error');
      return;
    }

    // 2. Policy check + approval
    const { risk, approval, finalCommand } = await this.policy.validateAndApprove({
      command,
      cwd,
      shellName: shell.name,
      reason: 'User menjalankan command melalui nanocli terminal run',
      skipApprovalForLowRisk: options.yes === true,
    });

    if (!approval.approved) {
      if (risk.blocked) {
        Renderer.printStatus('Command diblokir oleh security policy.', 'error');
      } else {
        Renderer.printStatus('Command dibatalkan.', 'warn');
      }
      return;
    }

    // 3. Jika command diedit, tampilkan info
    if (approval.editedCommand) {
      console.log(chalk.dim(`  Command diedit: ${approval.editedCommand}`));
    }

    // 4. Execute
    console.log(chalk.dim(`\n  Menjalankan: ${finalCommand}`));
    console.log(chalk.dim(`  Shell: ${shell.name} | CWD: ${cwd}\n`));

    const result = await this.executor.run({
      command: finalCommand,
      cwd,
      shell,
      timeoutMs,
      liveOutput: true,
      pipeStdin: true,
    });

    // 5. Display result summary
    if (result.timedOut) {
      Renderer.printStatus(`Command timeout (${timeoutMs / 1000}s).`, 'warn');
    }

    if (result.redacted) {
      console.log(chalk.yellow('  ⚠ Output mengandung data sensitif yang telah disamarkan.\n'));
    }

    // Output sudah di-stream live ke terminal, tidak perlu print ulang
    // Hanya tampilkan exit code dan duration
    // Exit code
    const exitColor = result.exitCode === 0 ? chalk.green : chalk.red;
    console.log(chalk.dim(`\n  Exit code: `) + exitColor(String(result.exitCode ?? 'N/A')));
    console.log(chalk.dim(`  Duration: ${result.durationMs}ms\n`));

    return result;
  }
}
