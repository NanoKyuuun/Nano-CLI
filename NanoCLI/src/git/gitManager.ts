/**
 * gitManager.ts — P2-03
 *
 * Git integration minimal untuk NanoCLI.
 *
 * Commands yang diekspos:
 *   status()     — daftar file yang berubah, staged, dan untracked
 *   diff()       — git diff (unstaged) atau git diff --cached (staged)
 *   checkpoint() — commit semua perubahan dengan pesan otomatis
 *   log()        — N commit terakhir dalam format ringkas
 *   branch()     — nama branch saat ini
 *   isRepo()     — apakah directory adalah git repository
 *
 * Design principles:
 * - Semua operasi menggunakan execSync dengan timeout
 * - Tidak pernah throw ke caller — semua wrapped dalam GitResult
 * - stdout/stderr selalu di-truncate ke maxBytes agar tidak flood memory
 * - Tidak ada interactive rebase, merge conflict resolution, dll.
 *   (di luar scope P2-03)
 */

import { execSync, ExecSyncOptions } from 'child_process';
import path from 'path';

const MAX_OUTPUT_BYTES = 10_000;
const EXEC_TIMEOUT_MS  = 10_000;

export interface GitResult {
  success: boolean;
  output: string;
  /** Error message jika gagal */
  error?: string;
}

export interface GitStatus {
  staged:    string[];
  unstaged:  string[];
  untracked: string[];
  /** Branch saat ini */
  branch:    string;
  /** true jika working tree bersih */
  clean:     boolean;
}

export class GitManager {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
  }

  // ── Internal helper ──────────────────────────────────────────────────────

  private exec(command: string): GitResult {
    const opts: ExecSyncOptions = {
      cwd:      this.projectRoot,
      timeout:  EXEC_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio:    ['ignore', 'pipe', 'pipe'],
    };

    try {
      const stdout = execSync(command, opts) as unknown as string;
      return { success: true, output: stdout.slice(0, MAX_OUTPUT_BYTES) };
    } catch (err: any) {
      const stderr = (err.stderr ?? '').toString().slice(0, 1000);
      return {
        success: false,
        output:  '',
        error:   err.message + (stderr ? '\n' + stderr : ''),
      };
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Cek apakah directory adalah git repository.
   */
  isRepo(): boolean {
    const result = this.exec('git rev-parse --is-inside-work-tree');
    return result.success && result.output.trim() === 'true';
  }

  /**
   * Ambil nama branch saat ini.
   */
  branch(): string {
    const result = this.exec('git branch --show-current');
    return result.success ? result.output.trim() : 'unknown';
  }

  /**
   * Ambil status repository secara terstruktur.
   */
  status(): GitResult & { parsed?: GitStatus } {
    const result = this.exec('git status --porcelain=v1 -u');
    if (!result.success) return result;

    const staged:    string[] = [];
    const unstaged:  string[] = [];
    const untracked: string[] = [];

    for (const line of result.output.split('\n').filter(Boolean)) {
      const xy   = line.slice(0, 2);
      const file = line.slice(3).trim();
      const X = xy[0] ?? ' ';
      const Y = xy[1] ?? ' ';

      if (X === '?') {
        untracked.push(file);
      } else {
        if (X !== ' ') staged.push(file);
        if (Y !== ' ') unstaged.push(file);
      }
    }

    const branch = this.branch();
    const clean  = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

    const statusText = clean
      ? `Branch: ${branch}\nWorking tree bersih.`
      : [
          `Branch: ${branch}`,
          staged.length    > 0 ? `Staged (${staged.length}): ${staged.join(', ')}`       : '',
          unstaged.length  > 0 ? `Unstaged (${unstaged.length}): ${unstaged.join(', ')}` : '',
          untracked.length > 0 ? `Untracked (${untracked.length}): ${untracked.join(', ')}` : '',
        ].filter(Boolean).join('\n');

    return {
      success: true,
      output:  statusText,
      parsed:  { staged, unstaged, untracked, branch, clean },
    };
  }

  /**
   * Ambil diff untuk perubahan yang belum di-stage.
   * @param staged - jika true, tampilkan diff yang sudah di-stage (--cached)
   * @param filePath - batasi diff ke file tertentu (opsional)
   */
  diff(staged = false, filePath?: string): GitResult {
    const flag = staged ? '--cached' : '';
    const file = filePath ? `-- "${filePath}"` : '';
    return this.exec(`git diff ${flag} ${file}`.trim());
  }

  /**
   * Commit semua perubahan dengan pesan yang diberikan.
   * Secara otomatis melakukan `git add -A` sebelum commit.
   *
   * @param message - Pesan commit
   * @param addAll  - jika true (default), jalankan `git add -A` dulu
   */
  checkpoint(message: string, addAll = true): GitResult {
    if (addAll) {
      const addResult = this.exec('git add -A');
      if (!addResult.success) {
        return {
          success: false,
          output:  '',
          error:   `git add -A gagal: ${addResult.error}`,
        };
      }
    }

    // Escape message — hindari shell injection
    const safeMessage = message.replace(/"/g, '\\"').slice(0, 200);
    return this.exec(`git commit -m "${safeMessage}"`);
  }

  /**
   * Tampilkan N commit terakhir dalam format ringkas.
   * @param n - jumlah commit (default 10)
   */
  log(n = 10): GitResult {
    return this.exec(`git log --oneline -n ${n}`);
  }

  /**
   * Tampilkan nama file yang berubah antara dua ref.
   * @param from - ref awal (default: HEAD~1)
   * @param to   - ref akhir (default: HEAD)
   */
  changedFiles(from = 'HEAD~1', to = 'HEAD'): GitResult {
    return this.exec(`git diff --name-only ${from} ${to}`);
  }

  /**
   * Stash perubahan saat ini.
   * @param message - label stash (opsional)
   */
  stash(message?: string): GitResult {
    const msg = message ? ` -m "${message.replace(/"/g, '\\"').slice(0, 100)}"` : '';
    return this.exec(`git stash push${msg}`);
  }

  /**
   * Pop stash terbaru.
   */
  stashPop(): GitResult {
    return this.exec('git stash pop');
  }
}
