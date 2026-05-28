/**
 * shellDetector.ts
 *
 * Mendeteksi shell yang tersedia di sistem pengguna.
 * Mendukung Windows (pwsh, powershell, git-bash, cmd, wsl)
 * dan Unix (zsh, bash, fish, sh).
 *
 * Priority disesuaikan:
 * - Windows: git-bash > pwsh > powershell > wsl > cmd
 *   (karena user preference adalah Git Bash / Unix-style)
 * - Unix: zsh > bash > fish > sh
 */

import { execFileSync } from 'child_process';
import { ShellProfile, TerminalOS } from './terminalTypes';

/**
 * Cek apakah sebuah command tersedia di PATH.
 */
function commandExists(command: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export class ShellDetector {
  /**
   * Deteksi OS saat ini.
   */
  detectOS(): TerminalOS {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'darwin';
    return 'linux';
  }

  /**
   * Deteksi semua shell yang tersedia.
   * Return hanya shell yang benar-benar ada di sistem.
   * Diurutkan berdasarkan priority (tertinggi di awal).
   */
  async detectShells(): Promise<ShellProfile[]> {
    const osName = this.detectOS();

    const shells: ShellProfile[] = osName === 'windows'
      ? [
          {
            id: 'git-bash',
            kind: 'git-bash',
            name: 'Git Bash',
            command: 'bash.exe',
            args: ['-c'],
            available: commandExists('bash.exe'),
            priority: 100, // Prioritas tertinggi — Unix-style, user preference
          },
          {
            id: 'pwsh',
            kind: 'pwsh',
            name: 'PowerShell 7',
            command: 'pwsh.exe',
            args: ['-NoProfile', '-Command'],
            available: commandExists('pwsh.exe'),
            priority: 90,
          },
          {
            id: 'powershell',
            kind: 'powershell',
            name: 'Windows PowerShell',
            command: 'powershell.exe',
            args: ['-NoProfile', '-Command'],
            available: commandExists('powershell.exe'),
            priority: 80,
          },
          {
            id: 'wsl',
            kind: 'wsl',
            name: 'Windows Subsystem for Linux',
            command: 'wsl.exe',
            args: ['-e'],
            available: commandExists('wsl.exe'),
            priority: 70,
          },
          {
            id: 'cmd',
            kind: 'cmd',
            name: 'Command Prompt',
            command: 'cmd.exe',
            args: ['/c'],
            available: commandExists('cmd.exe'),
            priority: 50,
          },
        ]
      : [
          {
            id: 'zsh',
            kind: 'zsh',
            name: 'Zsh',
            command: 'zsh',
            args: ['-c'],
            available: commandExists('zsh'),
            priority: 100,
          },
          {
            id: 'bash',
            kind: 'bash',
            name: 'Bash',
            command: 'bash',
            args: ['-c'],
            available: commandExists('bash'),
            priority: 90,
          },
          {
            id: 'fish',
            kind: 'fish',
            name: 'Fish',
            command: 'fish',
            args: ['-c'],
            available: commandExists('fish'),
            priority: 70,
          },
          {
            id: 'sh',
            kind: 'sh',
            name: 'POSIX sh',
            command: 'sh',
            args: ['-c'],
            available: commandExists('sh'),
            priority: 50,
          },
        ];

    return shells
      .filter(s => s.available)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Ambil shell default (priority tertinggi yang tersedia).
   */
  async getDefaultShell(): Promise<ShellProfile> {
    const shells = await this.detectShells();
    if (shells.length === 0) {
      throw new Error('Tidak ada shell yang terdeteksi di sistem ini.');
    }
    return shells[0]!;
  }
}
