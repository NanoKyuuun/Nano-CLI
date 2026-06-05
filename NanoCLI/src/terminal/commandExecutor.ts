/**
 * commandExecutor.ts
 *
 * Menjalankan command lokal secara non-interaktif via child_process.spawn.
 *
 * Pipeline:
 * 1. Spawn child process dengan shell yang dipilih
 * 2. Stream stdout + stderr ke terminal secara real-time (live output)
 *    — Line-buffered: chunk diakumulasi sampai newline sebelum di-redact & dicetak
 *    — MAX_LINE_BUFFER guard: flush parsial jika baris terlalu panjang (>8192 chars)
 *    — Ini mencegah: (a) secret terpotong antar chunk dan (b) memory explode
 * 3. Capture output untuk return value
 * 4. Timeout enforcement (default 300s untuk long-running commands)
 * 5. Redact secrets dari output (return value dan audit)
 * 6. Limit output size
 * 7. Return structured result
 *
 * TIDAK pernah menjalankan command tanpa melalui PolicyEngine terlebih dahulu.
 */

import { spawn } from 'child_process';
import { CommandExecutionResult, ShellProfile } from './terminalTypes';
import { SecretRedactor } from '../security/secretRedactor';
import { OutputLimiter } from './outputLimiter';
import { AuditLogger } from '../security/auditLogger';

/** Batas maksimal buffer per baris sebelum flush parsial (8 KB). */
const MAX_LINE_BUFFER = 8_192;

/**
 * Allowlist environment variables yang aman diwariskan ke subprocess.
 *
 * TIDAK termasuk:
 * - OPENROUTER_API_KEY dan secret lain
 * - DATABASE_URL, JWT_SECRET, dll.
 * - Semua key yang tidak ada di list ini
 *
 * Jika command butuh env tertentu (misal: NPM_TOKEN untuk publish),
 * user harus set env tersebut di shell mereka sendiri atau gunakan
 * opsi --allow-env di masa depan.
 */
const SAFE_ENV_KEYS = new Set([
  // Shell essentials
  'PATH', 'HOME', 'SHELL', 'TERM', 'USER', 'USERNAME', 'LOGNAME',
  // Windows-specific
  'SystemRoot', 'ComSpec', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMDATA', 'WINDIR',
  // Temp directories
  'TMPDIR', 'TEMP', 'TMP',
  // Locale
  'LANG', 'LC_ALL', 'LC_CTYPE',
  // Node/npm (safe — tidak mengandung secret)
  'NODE_ENV', 'npm_config_cache', 'npm_config_prefix',
]);

/**
 * Buat environment object yang aman untuk subprocess.
 * Hanya mengandung key dari SAFE_ENV_KEYS.
 */
function buildSafeEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (source[key] !== undefined) safe[key] = source[key];
  }
  return safe;
}

export class CommandExecutor {
  private redactor: SecretRedactor;
  private outputLimiter: OutputLimiter;
  private auditLogger: AuditLogger;

  constructor(projectRoot: string = process.cwd()) {
    this.redactor = new SecretRedactor();
    this.outputLimiter = new OutputLimiter();
    this.auditLogger = new AuditLogger(projectRoot);
  }

  /**
   * Jalankan command lokal dan kembalikan hasil yang sudah disanitasi.
   *
   * @param options.command    - Command string yang akan dijalankan
   * @param options.cwd        - Working directory
   * @param options.shell      - Shell profile yang digunakan
   * @param options.timeoutMs  - Timeout dalam ms (default 300s)
   * @param options.liveOutput - Stream output ke terminal secara real-time (default: true)
   * @param options.pipeStdin  - Forward stdin dari terminal ke child process (default: true)
   */
  async run(options: {
    command: string;
    cwd: string;
    shell: ShellProfile;
    timeoutMs?: number;
    liveOutput?: boolean;
    pipeStdin?: boolean;
  }): Promise<CommandExecutionResult> {
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 300_000;
    const liveOutput = options.liveOutput ?? true;
    const pipeStdin  = options.pipeStdin  ?? true;

    return new Promise((resolve) => {
      let stdout   = '';
      let stderr   = '';
      let timedOut = false;

      const stdinMode = pipeStdin ? 'inherit' : 'ignore';

      const child = spawn(options.shell.command, [...options.shell.args, options.command], {
        cwd:   options.cwd,
        env:   buildSafeEnv(process.env),   // Hanya env aman — jangan wariskan secret
        stdio: [stdinMode, 'pipe', 'pipe'],
      });

      // Timeout enforcement
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 3_000);
      }, timeoutMs);

      // ── Line-buffered live redaction ────────────────────────────────────
      // Masalah lama: process.stdout.write(text) mencetak chunk mentah.
      // Secret bisa terpotong antar chunk sehingga regex tidak mendeteksi.
      // Solusi: buffer hingga '\n', redact baris utuh, baru cetak.
      // Guard: jika buffer > MAX_LINE_BUFFER, flush parsial untuk cegah OOM.
      //
      // Pola yang sama dipakai untuk stdout dan stderr.

      let stdoutLineBuf = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdout += text;

        if (liveOutput) {
          stdoutLineBuf += text;
          // Flush per baris
          const lines = stdoutLineBuf.split('\n');
          stdoutLineBuf = lines.pop()!; // sisa belum ada '\n'-nya
          for (const line of lines) {
            process.stdout.write(this.redactor.redact(line) + '\n');
          }
          // Guard: flush parsial jika buffer terlalu panjang
          if (stdoutLineBuf.length > MAX_LINE_BUFFER) {
            process.stdout.write(this.redactor.redact(stdoutLineBuf));
            stdoutLineBuf = '';
          }
        }
      });

      let stderrLineBuf = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;

        if (liveOutput) {
          stderrLineBuf += text;
          const lines = stderrLineBuf.split('\n');
          stderrLineBuf = lines.pop()!;
          for (const line of lines) {
            process.stderr.write(this.redactor.redact(line) + '\n');
          }
          if (stderrLineBuf.length > MAX_LINE_BUFFER) {
            process.stderr.write(this.redactor.redact(stderrLineBuf));
            stderrLineBuf = '';
          }
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;

        // Flush sisa buffer yang belum ada newline-nya
        if (liveOutput) {
          if (stdoutLineBuf.length > 0) {
            process.stdout.write(this.redactor.redact(stdoutLineBuf));
          }
          if (stderrLineBuf.length > 0) {
            process.stderr.write(this.redactor.redact(stderrLineBuf));
          }
          process.stdout.write('\n');
        }

        // Sanitize output untuk return value dan audit log
        // (bukan untuk live display — live display sudah di-redact di atas)
        const rawOutput      = [stdout, stderr].filter(Boolean).join('\n');
        const redactedOutput = this.redactor.redact(rawOutput);
        const limitedOutput  = this.outputLimiter.limit(redactedOutput);

        const result: CommandExecutionResult = {
          command:   options.command,
          exitCode:  code,
          stdout:    this.outputLimiter.limit(this.redactor.redact(stdout)),
          stderr:    this.outputLimiter.limit(this.redactor.redact(stderr)),
          output:    limitedOutput,
          durationMs,
          timedOut,
          redacted:  rawOutput !== redactedOutput,
        };

        // Audit log (fire-and-forget)
        this.auditLogger.logExecution({
          command:   options.command,
          shell:     options.shell.id,
          cwd:       options.cwd,
          risk:      'executed',
          exitCode:  code,
          durationMs,
          timedOut,
          redacted:  result.redacted,
        }).catch(() => { /* best-effort */ });

        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs   = Date.now() - started;
        const safeMessage  = this.redactor.redact(err.message);

        resolve({
          command:   options.command,
          exitCode:  null,
          stdout:    '',
          stderr:    safeMessage,
          output:    safeMessage,
          durationMs,
          timedOut:  false,
          redacted:  false,
        });
      });
    });
  }
}
