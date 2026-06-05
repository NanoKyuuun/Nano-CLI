/**
 * doctor.ts — P3-02
 *
 * Command: nanocli doctor
 *
 * Self-diagnostic tool untuk NanoCLI.
 * Memeriksa semua komponen dan melaporkan status secara visual.
 *
 * Checks yang dilakukan:
 *   1. API Key (OPENROUTER_API_KEY)
 *   2. Node.js version (minimum 18)
 *   3. Git availability
 *   4. Project config (.nanocli/config.json)
 *   5. SQLite index (memory database)
 *   6. NanoCLI mode (local | share | self-host)
 *   7. Backend server connectivity (self-host saja)
 *   8. .gitignore entry untuk .nanocli/
 *   9. Disk space (warn jika < 100MB tersedia)
 *  10. Write permission ke project root
 */

import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import chalk from 'chalk';
import { ConfigManager } from '../files/configManager';
import { HomeServerClient } from '../remote/homeServerClient';
import { GitManager } from '../git/gitManager';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

interface CheckResult {
  name:    string;
  status:  CheckStatus;
  message: string;
  detail?: string;
  fix?:    string;
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function icon(status: CheckStatus): string {
  switch (status) {
    case 'pass': return chalk.green('✓');
    case 'warn': return chalk.yellow('⚠');
    case 'fail': return chalk.red('✗');
    case 'skip': return chalk.dim('─');
  }
}

function label(status: CheckStatus, text: string): string {
  switch (status) {
    case 'pass': return chalk.green(text);
    case 'warn': return chalk.yellow(text);
    case 'fail': return chalk.red(text);
    case 'skip': return chalk.dim(text);
  }
}

// ── Individual Checks ─────────────────────────────────────────────────────────

async function checkApiKey(config: ConfigManager): Promise<CheckResult> {
  const key = await config.getApiKey();
  const source = await config.getApiKeySource();

  if (!key) {
    return {
      name:    'OpenRouter API Key',
      status:  'fail',
      message: 'API key tidak ditemukan.',
      fix:     'Jalankan `nanocli setup` atau set env var OPENROUTER_API_KEY.',
    };
  }

  const masked = key.slice(0, 8) + '...' + key.slice(-4);
  return {
    name:    'OpenRouter API Key',
    status:  'pass',
    message: `Ditemukan via ${source === 'env' ? 'environment variable' : 'credentials file'}.`,
    detail:  masked,
  };
}

async function checkNodeVersion(): Promise<CheckResult> {
  const raw = process.version; // e.g. "v20.11.0"
  const major = parseInt(raw.slice(1).split('.')[0] ?? '0', 10);

  if (major < 18) {
    return {
      name:    'Node.js Version',
      status:  'fail',
      message: `Node.js ${raw} tidak memenuhi minimum v18.`,
      fix:     'Update Node.js ke v18 atau lebih baru: https://nodejs.org',
    };
  }

  if (major < 20) {
    return {
      name:    'Node.js Version',
      status:  'warn',
      message: `Node.js ${raw} — didukung tapi v20+ direkomendasikan.`,
    };
  }

  return {
    name:    'Node.js Version',
    status:  'pass',
    message: `Node.js ${raw}`,
  };
}

async function checkGit(): Promise<CheckResult> {
  try {
    const version = execSync('git --version', {
      encoding: 'utf-8',
      timeout:  5_000,
      stdio:    ['ignore', 'pipe', 'ignore'],
    }).trim();

    const git = new GitManager();
    const isRepo = git.isRepo();

    return {
      name:    'Git',
      status:  'pass',
      message: version + (isRepo ? ' (dalam git repo)' : ' (bukan git repo — nanocli git tidak akan berfungsi)'),
    };
  } catch {
    return {
      name:    'Git',
      status:  'warn',
      message: 'git tidak ditemukan di PATH.',
      fix:     'Install git: https://git-scm.com/downloads',
    };
  }
}

async function checkProjectConfig(projectRoot: string): Promise<CheckResult> {
  const configPath = path.join(projectRoot, '.nanocli', 'config.json');
  const exists = await fs.pathExists(configPath);

  if (!exists) {
    return {
      name:    'Project Config',
      status:  'warn',
      message: '.nanocli/config.json tidak ada — menggunakan default.',
      fix:     'Jalankan `nanocli init` untuk membuat config project lokal.',
    };
  }

  try {
    await fs.readJson(configPath);
    return {
      name:    'Project Config',
      status:  'pass',
      message: '.nanocli/config.json ditemukan dan valid.',
    };
  } catch {
    return {
      name:    'Project Config',
      status:  'fail',
      message: '.nanocli/config.json tidak valid (JSON corrupt).',
      fix:     'Hapus file dan jalankan `nanocli init` ulang.',
    };
  }
}

async function checkSqliteIndex(projectRoot: string): Promise<CheckResult> {
  const dbPath = path.join(projectRoot, '.nanocli', 'index', 'memory.sqlite');
  const exists = await fs.pathExists(dbPath);

  if (!exists) {
    return {
      name:    'SQLite Memory Index',
      status:  'warn',
      message: 'Database belum ada — akan dibuat otomatis saat pertama kali indexing.',
      fix:     'Jalankan `nanocli memory update` untuk membangun index.',
    };
  }

  try {
    const stat = await fs.stat(dbPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    return {
      name:    'SQLite Memory Index',
      status:  'pass',
      message: `Database ditemukan (${sizeKb} KB).`,
    };
  } catch {
    return {
      name:    'SQLite Memory Index',
      status:  'fail',
      message: 'Database tidak bisa dibaca.',
    };
  }
}

async function checkNanoMode(config: ConfigManager): Promise<CheckResult> {
  const mode = await config.getMode();
  const labels: Record<string, string> = {
    local:      'Local (offline, SQLite FTS5 saja)',
    share:      'Share (lokal + anonymous telemetry)',
    'self-host': 'Self-host (lokal + RAG server sendiri)',
  };
  return {
    name:    'NanoCLI Mode',
    status:  'pass',
    message: labels[mode] ?? mode,
  };
}

async function checkBackend(config: ConfigManager): Promise<CheckResult> {
  const mode = await config.getMode();

  if (mode !== 'self-host') {
    return {
      name:    'Backend Server',
      status:  'skip',
      message: 'Tidak dicek (hanya relevan untuk mode self-host).',
    };
  }

  const remote = await config.getRemoteConfig();
  if (!remote) {
    return {
      name:    'Backend Server',
      status:  'warn',
      message: 'Mode self-host aktif tapi remote config belum diset.',
      fix:     'Jalankan `nanocli remote setup`.',
    };
  }

  const client = new HomeServerClient(remote.url, remote.apiKey);
  const available = await client.isAvailable();

  if (!available) {
    return {
      name:    'Backend Server',
      status:  'fail',
      message: `Server ${remote.url} tidak bisa dijangkau.`,
      fix:     'Pastikan nanocli-server berjalan dan API_KEY sudah diset.',
      detail:  `URL: ${remote.url}`,
    };
  }

  const health = await client.getHealth();
  const dbStatus = health?.database ? '✓ DB' : '✗ DB';
  const ollamaStatus = health?.ollama ? '✓ Ollama' : '✗ Ollama';

  return {
    name:    'Backend Server',
    status:  health?.status === 'ok' ? 'pass' : 'warn',
    message: `Terhubung. Status: ${health?.status ?? 'unknown'} (${dbStatus}, ${ollamaStatus})`,
    ...(health?.embed_model ? { detail: `Embed model: ${health.embed_model}` } : {}),
  };
}

async function checkGitignore(projectRoot: string): Promise<CheckResult> {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  if (!(await fs.pathExists(gitignorePath))) {
    return {
      name:    '.gitignore',
      status:  'warn',
      message: '.gitignore tidak ditemukan.',
      fix:     'Buat .gitignore dan tambahkan .nanocli/ agar credentials tidak masuk git.',
    };
  }

  const content = await fs.readFile(gitignorePath, 'utf-8');
  if (!content.includes('.nanocli/') && !content.includes('.nanocli')) {
    return {
      name:    '.gitignore',
      status:  'warn',
      message: '.nanocli/ belum ada di .gitignore.',
      fix:     'Jalankan `nanocli setup` atau tambahkan .nanocli/ secara manual.',
    };
  }

  return {
    name:    '.gitignore',
    status:  'pass',
    message: '.nanocli/ sudah terdaftar di .gitignore.',
  };
}

async function checkDiskSpace(projectRoot: string): Promise<CheckResult> {
  // df tidak tersedia di Windows — gunakan fs.statfs jika ada (Node 19+)
  // Fallback: cek ukuran .nanocli/ saja
  try {
    // Node 19+ punya fs.statfs
    const fsStatfs = (fs as any).statfs;
    if (typeof fsStatfs === 'function') {
      const stat = await new Promise<any>((resolve, reject) => {
        fsStatfs(projectRoot, (err: any, s: any) => err ? reject(err) : resolve(s));
      });
      const freeMb = Math.round((stat.bfree * stat.bsize) / (1024 * 1024));
      if (freeMb < 100) {
        return {
          name:    'Disk Space',
          status:  'warn',
          message: `Disk hampir penuh — hanya ${freeMb} MB tersedia.`,
          fix:     'Bebaskan disk space agar indexing bisa berjalan.',
        };
      }
      return {
        name:    'Disk Space',
        status:  'pass',
        message: `${freeMb} MB tersedia.`,
      };
    }
  } catch { /* ignore */ }

  // Fallback jika statfs tidak tersedia
  return {
    name:    'Disk Space',
    status:  'skip',
    message: 'Tidak bisa dicek di platform ini (Node < 19 atau Windows).',
  };
}

async function checkWritePermission(projectRoot: string): Promise<CheckResult> {
  const testPath = path.join(projectRoot, '.nanocli', '.doctor_write_test');
  try {
    await fs.ensureDir(path.dirname(testPath));
    await fs.writeFile(testPath, 'ok', 'utf-8');
    await fs.remove(testPath);
    return {
      name:    'Write Permission',
      status:  'pass',
      message: 'Project root dapat ditulis.',
    };
  } catch (err: any) {
    return {
      name:    'Write Permission',
      status:  'fail',
      message: 'Tidak bisa menulis ke project root.',
      detail:  err.message,
      fix:     'Periksa permission folder project.',
    };
  }
}

// ── DoctorCommand ─────────────────────────────────────────────────────────────

export class DoctorCommand {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async run(): Promise<void> {
    const config = new ConfigManager(this.projectRoot);

    console.log('');
    console.log(chalk.bold.cyan('  nanocli doctor'));
    console.log(chalk.cyan('  ' + '─'.repeat(50)));
    console.log('');

    // Jalankan semua checks
    const checks: Array<() => Promise<CheckResult>> = [
      () => checkApiKey(config),
      () => checkNodeVersion(),
      () => checkGit(),
      () => checkProjectConfig(this.projectRoot),
      () => checkSqliteIndex(this.projectRoot),
      () => checkNanoMode(config),
      () => checkBackend(config),
      () => checkGitignore(this.projectRoot),
      () => checkDiskSpace(this.projectRoot),
      () => checkWritePermission(this.projectRoot),
    ];

    const results: CheckResult[] = [];

    for (const check of checks) {
      const result = await check();
      results.push(result);
      this.printResult(result);
    }

    // Summary
    const pass   = results.filter(r => r.status === 'pass').length;
    const warn   = results.filter(r => r.status === 'warn').length;
    const fail   = results.filter(r => r.status === 'fail').length;
    const skip   = results.filter(r => r.status === 'skip').length;
    const total  = results.length - skip;

    console.log('');
    console.log(chalk.cyan('  ' + '─'.repeat(50)));

    if (fail > 0) {
      console.log(`  ${chalk.red.bold(`${fail} check gagal`)}  ${chalk.yellow(`${warn} peringatan`)}  ${chalk.green(`${pass} OK`)}`);
      console.log('');
      console.log(`  ${chalk.red('→ Ada masalah kritis yang perlu diperbaiki sebelum NanoCLI bisa berjalan optimal.')}`);

      // Tampilkan semua fix yang ada
      const fixes = results.filter(r => r.status === 'fail' && r.fix);
      if (fixes.length > 0) {
        console.log('');
        console.log(chalk.bold('  Langkah perbaikan:'));
        fixes.forEach((r, i) => {
          console.log(`  ${i + 1}. ${chalk.white(r.name)}: ${chalk.yellow(r.fix!)}`);
        });
      }
    } else if (warn > 0) {
      console.log(`  ${chalk.yellow.bold(`${warn} peringatan`)}  ${chalk.green(`${pass} OK`)}`);
      console.log('');
      console.log(`  ${chalk.yellow('→ NanoCLI bisa berjalan tapi ada hal yang sebaiknya diperbaiki.')}`);
    } else {
      console.log(`  ${chalk.green.bold(`Semua ${total} check passed!`)}`);
      console.log('');
      console.log(`  ${chalk.green('→ NanoCLI siap digunakan.')}`);
    }

    console.log('');
  }

  private printResult(result: CheckResult): void {
    const statusIcon = icon(result.status);
    const nameStr    = result.name.padEnd(26);

    let line = `  ${statusIcon} ${label(result.status, nameStr)} ${result.message}`;
    if (result.detail) {
      line += chalk.dim(` (${result.detail})`);
    }
    console.log(line);

    if (result.fix && (result.status === 'fail' || result.status === 'warn')) {
      console.log(`      ${chalk.dim('↳')} ${chalk.dim(result.fix)}`);
    }
  }
}
