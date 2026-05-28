/**
 * commandExecutor.ts
 *
 * Menjalankan command lokal secara non-interaktif via child_process.spawn.
 *
 * Pipeline:
 * 1. Spawn child process dengan shell yang dipilih
 * 2. Stream stdout + stderr ke terminal secara real-time (live output)
 * 3. Capture output untuk return value
 * 4. Timeout enforcement (default 300s untuk long-running commands)
 * 5. Redact secrets dari output
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
    // Default timeout 300s — cukup untuk composer, npm install, dll.
    const timeoutMs = options.timeoutMs ?? 300_000;
    // Live output aktif secara default agar user tidak merasa stuck
    const liveOutput = options.liveOutput ?? true;
    // Pipe stdin agar command semi-interaktif bisa berjalan
    const pipeStdin = options.pipeStdin ?? true;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // stdin: inherit jika pipeStdin, ignore jika tidak
      const stdinMode = pipeStdin ? 'inherit' : 'ignore';

      // Spawn menggunakan shell yang dipilih
      const child = spawn(options.shell.command, [...options.shell.args, options.command], {
        cwd: options.cwd,
        env: process.env,
        stdio: [stdinMode, 'pipe', 'pipe'],
      });

      // Timeout enforcement
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Fallback kill jika SIGTERM diabaikan
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 3_000);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdout += text;
        // Stream ke terminal secara real-time
        if (liveOutput) process.stdout.write(text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        // Stream stderr ke terminal secara real-time
        if (liveOutput) process.stderr.write(text);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;

        // Jika live output aktif, cetak newline pemisah agar output rapi
        if (liveOutput) process.stdout.write('\n');

        // Sanitize output (untuk return value dan audit — bukan untuk live display)
        const rawOutput = [stdout, stderr].filter(Boolean).join('\n');
        const redactedOutput = this.redactor.redact(rawOutput);
        const limitedOutput = this.outputLimiter.limit(redactedOutput);

        const result: CommandExecutionResult = {
          command: options.command,
          exitCode: code,
          stdout: this.outputLimiter.limit(this.redactor.redact(stdout)),
          stderr: this.outputLimiter.limit(this.redactor.redact(stderr)),
          output: limitedOutput,
          durationMs,
          timedOut,
          redacted: rawOutput !== redactedOutput,
        };

        // Audit log (fire-and-forget)
        this.auditLogger.logExecution({
          command: options.command,
          shell: options.shell.id,
          cwd: options.cwd,
          risk: 'executed', // risk sudah dievaluasi sebelum sampai sini
          exitCode: code,
          durationMs,
          timedOut,
          redacted: result.redacted,
        }).catch(() => { /* best-effort */ });

        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;

        const safeMessage = this.redactor.redact(err.message);

        resolve({
          command: options.command,
          exitCode: null,
          stdout: '',
          stderr: safeMessage,
          output: safeMessage,
          durationMs,
          timedOut: false,
          redacted: false,
        });
      });
    });
  }
}
