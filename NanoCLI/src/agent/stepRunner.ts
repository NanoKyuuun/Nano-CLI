/**
 * stepRunner.ts
 *
 * Eksekutor untuk setiap AgentAction.
 * Menghubungkan ToolRouter output ke layer eksekusi yang tepat.
 */

import path from 'path';
import { AgentAction, AgentStepResult, AgentLoopOptions, ActionFeedback } from './agentTypes';
import { FileOperationManager } from '../file/fileOperationManager';
import { PatchApplicator } from '../file/patchApplicator';
import { PolicyEngine } from '../security/policyEngine';
import { CommandExecutor } from '../terminal/commandExecutor';
import { ShellDetector } from '../terminal/shellDetector';
import { safeReadTextFile } from '../files/safeFileReader';
import { Renderer } from '../ui/render';
import { WriteValidator } from '../file/writeValidator';

/**
 * Normalisasi input patch dari AI.
 *
 * AI terkadang menghasilkan patch yang sudah dibungkus dalam fenced code block:
 *   ```diff
 *   --- a/file.ts
 *   +++ b/file.ts
 *   @@ ... @@
 *   ```
 *
 * StepRunner kemudian membungkusnya lagi dengan fence, menyebabkan double-wrap.
 * Fungsi ini menghapus fence luar jika ada, sehingga hasil selalu berupa raw diff.
 */
function normalizePatchInput(input: string): string {
  const trimmed = input.trim();
  const fenced  = trimmed.match(/^```(?:diff|patch)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1]!.trim() : trimmed;
}

export class StepRunner {
  private fileManager: FileOperationManager;
  private patchApplicator: PatchApplicator;
  private policyEngine: PolicyEngine;
  private commandExecutor: CommandExecutor;
  private writeValidator: WriteValidator;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd(), options?: AgentLoopOptions) {
    this.projectRoot   = path.resolve(projectRoot);
    this.fileManager   = new FileOperationManager(projectRoot);
    this.patchApplicator = new PatchApplicator();
    this.policyEngine  = new PolicyEngine(projectRoot);
    this.commandExecutor = new CommandExecutor(projectRoot);
    this.writeValidator  = new WriteValidator();
  }

  async run(action: AgentAction, options?: AgentLoopOptions): Promise<AgentStepResult> {
    // ── Permission Check ─────────────────────────────────────────────────────
    // Wajib dijalankan sebelum switch case — menghentikan action yang tidak
    // diizinkan berdasarkan permission mode tanpa menyentuh eksekusi apapun.
    const denied = this.checkPermission(action, options);
    if (denied) return denied;

    switch (action.type) {
      case 'terminal.run':
        return this.runTerminal(action.command, action.cwd, action.reason, options);

      case 'file.write':
        return this.runFileWrite(action.path, action.content, action.mode, action.reason, options);

      case 'file.patch':
        return this.runFilePatch(action.path, action.patch, action.reason, options);

      case 'file.read':
        return this.runFileRead(action.path);

      case 'final':
        // Final tidak dieksekusi — ditangani oleh AgentLoop langsung
        return { success: true, output: action.summary };

      default:
        return { success: false, output: 'Unknown action type' };
    }
  }

  // ─── Permission Policy ─────────────────────────────────────────────────────

  /**
   * Periksa apakah action diizinkan berdasarkan permission mode.
   *
   * Policy:
   *   readonly  → hanya file.read. Menolak semua write, patch, dan terminal.run.
   *               Untuk MVP, semua terminal.run ditolak karena klasifikasi
   *               command read-only vs destructive belum sempurna.
   *               Versi lanjutan dapat menambahkan allowlist: ls, pwd, cat, git status.
   *   workspace → write/patch/terminal diizinkan dengan approval,
   *               cwd wajib di dalam projectRoot (di-enforce di runTerminal).
   *   full      → write/patch/terminal diizinkan dengan approval,
   *               cwd boleh keluar projectRoot.
   *               PENTING: blocked command (rm -rf /, credential dump, dll.)
   *               tetap diblokir CommandRiskAnalyzer di semua mode.
   *
   * @returns AgentStepResult jika ditolak, null jika diizinkan
   */
  private checkPermission(action: AgentAction, options?: AgentLoopOptions): AgentStepResult | null {
    const permission = options?.permission ?? 'workspace';

    if (permission === 'readonly') {
      const blocked = new Set<string>(['terminal.run', 'file.write', 'file.patch']);
      if (blocked.has(action.type)) {
        const fb: ActionFeedback = {
          actionType: action.type,
          status: 'skipped',
          errorCode: 'PERMISSION_DENIED',
          message: `Permission 'readonly' tidak mengizinkan ${action.type}.`,
          suggestedNextStep: `Hanya file.read yang diizinkan di mode readonly. Gunakan permission 'workspace' jika perlu write.`,
        };
        return {
          success: false,
          output: fb.message + ' ' + fb.suggestedNextStep!,
          skipped: true,
          skipReason: `readonly permission blocks ${action.type}`,
          feedback: fb,
        };
      }
    }

    return null;
  }

  // ─── Terminal ─────────────────────────────────────────────────────────────

  private async runTerminal(
    command: string,
    cwd: string | undefined,
    reason: string,
    options?: AgentLoopOptions,
  ): Promise<AgentStepResult> {
    const effectiveCwd = cwd
      ? path.resolve(this.projectRoot, cwd)
      : this.projectRoot;

    // ── Workspace Boundary Validation ──────────────────────────────────────
    // workspace: cwd WAJIB di dalam projectRoot.
    // full:      cwd boleh keluar projectRoot.
    // Blocked command tetap diblokir CommandRiskAnalyzer di semua mode.
    const permission = options?.permission ?? 'workspace';

    if (permission !== 'full') {
      const safeRoot = this.projectRoot.endsWith(path.sep)
        ? this.projectRoot
        : this.projectRoot + path.sep;

      if (effectiveCwd !== this.projectRoot && !effectiveCwd.startsWith(safeRoot)) {
        const fb: ActionFeedback = {
          actionType: 'terminal.run',
          status: 'skipped',
          errorCode: 'WORKSPACE_BOUNDARY',
          message: `cwd "${effectiveCwd}" berada di luar workspace "${this.projectRoot}".`,
          suggestedNextStep: `Gunakan cwd yang berada di dalam project root, atau minta permission 'full' untuk akses di luar workspace.`,
        };
        return {
          success: false,
          output: fb.message + ' ' + fb.suggestedNextStep!,
          skipped: true,
          skipReason: 'workspace boundary violation',
          feedback: fb,
        };
      }
    }

    Renderer.printStatus(`Menganalisis command: ${command}`, 'info');

    const detector = new ShellDetector();
    const shell = await detector.getDefaultShell();

    // Policy check + approval (CommandRiskAnalyzer tetap berjalan di semua mode)
    const policyResult = await this.policyEngine.validateAndApprove({
      command,
      cwd: effectiveCwd,
      shellName: shell.name,
      reason,
      skipApprovalForLowRisk: false,
      // P2-01: Jika batchApprove aktif, bypass approval gate individual
      forceApprove: options?.batchApprove === true,
    });

    if (!policyResult.approval.approved) {
      const reason = policyResult.approval.reason ?? 'user menolak';
      const fb: ActionFeedback = {
        actionType: 'terminal.run',
        status: 'skipped',
        errorCode: 'USER_REJECTED',
        message: `Command ditolak: ${reason}`,
        suggestedNextStep: 'Coba command yang lebih spesifik atau jelaskan tujuannya ke user.',
      };
      return {
        success: false,
        output: fb.message,
        skipped: true,
        skipReason: reason,
        feedback: fb,
      };
    }

    const finalCommand = policyResult.approval.editedCommand ?? command;

    Renderer.printStatus(`Menjalankan: ${finalCommand}`, 'info');

    const result = await this.commandExecutor.run({
      command: finalCommand,
      cwd: effectiveCwd,
      shell,
      timeoutMs: 120_000,
    });

    const output = result.output || result.stderr || '(no output)';

    if (result.exitCode !== 0 && !result.timedOut) {
      // Deteksi command not found dari exit code 127 (bash) atau pesan error
      const isNotFound = result.exitCode === 127 ||
        (result.stderr ?? '').toLowerCase().includes('command not found') ||
        (result.stderr ?? '').toLowerCase().includes('is not recognized');

      const fb: ActionFeedback = {
        actionType: 'terminal.run',
        status: 'failed',
        errorCode: isNotFound ? 'COMMAND_NOT_FOUND' : 'COMMAND_FAILED',
        message: `Exit ${result.exitCode ?? 'null'}: ${output.slice(0, 500)}`,
        stderr: result.stderr?.slice(0, 500),
        suggestedNextStep: isNotFound
          ? 'Pastikan binary tersedia di PATH. Coba jalankan perintah yang valid.'
          : 'Periksa stderr untuk detail error. Coba perbaiki command atau jalankan dependency yang dibutuhkan.',
      };
      return {
        success: false,
        output: `Exit ${result.exitCode ?? 'null'}: ${output.slice(0, 2000)}`,
        feedback: fb,
      };
    }

    if (result.timedOut) {
      const fb: ActionFeedback = {
        actionType: 'terminal.run',
        status: 'failed',
        errorCode: 'TIMEOUT',
        message: 'Command melebihi timeout (120s).',
        suggestedNextStep: 'Pecah command menjadi lebih kecil atau tingkatkan timeout.',
      };
      return { success: false, output: 'Command timeout (120s)', feedback: fb };
    }

    return { success: true, output: output.slice(0, 2000) };
  }

  // ─── File Write ───────────────────────────────────────────────────────────

  private async runFileWrite(
    filePath: string,
    content: string,
    mode: 'create' | 'overwrite' | 'append',
    reason: string,
    options?: AgentLoopOptions,
  ): Promise<AgentStepResult> {
    Renderer.printStatus(`File write: ${filePath} (${mode})`, 'info');

    const result = await this.fileManager.write(filePath, content, mode, {
      requireApproval: true,
      reason,
      showDiff: mode !== 'create',
      // P2-01: Jika batchApprove aktif, lewati approval gate per-file
      autoApprove: options?.batchApprove === true,
    });

    this.fileManager.printResult(result);

    if (!result.success) {
      return {
        success: false,
        output: result.error ?? 'Gagal',
        ...({
          feedback: {
            actionType: 'file.write',
            status: 'failed' as const,
            errorCode: 'FILE_WRITE_FAILED' as const,
            message: result.error ?? 'Gagal menulis file.',
            suggestedNextStep: 'Periksa apakah path valid dan ada izin tulis ke direktori tersebut.',
          },
        }),
      };
    }

    // P2-02: Post-write validation
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const validation = this.writeValidator.validate(absolutePath, content);
    if (validation && !validation.valid) {
      const warning = `\n⚠ [POST-WRITE] ${validation.message}${validation.suggestion ? ' ' + validation.suggestion : ''}`;
      Renderer.printStatus(`Post-write validation: ${validation.message}`, 'warn');
      return {
        success: true, // file tetap tersimpan — ini hanya warning
        output: `File ${mode === 'create' ? 'dibuat' : 'diupdate'}: ${result.path}${warning}`,
      };
    }

    return {
      success: true,
      output: `File ${mode === 'create' ? 'dibuat' : 'diupdate'}: ${result.path}${result.diff ? ` (${result.diff})` : ''}`,
    };
  }

  // ─── File Patch ───────────────────────────────────────────────────────────

  private async runFilePatch(
    filePath: string,
    patchStr: string,
    reason: string,
    options?: AgentLoopOptions,
  ): Promise<AgentStepResult> {
    Renderer.printStatus(`File patch: ${filePath}`, 'info');

    let originalContent: string;
    try {
      const readResult = await safeReadTextFile(filePath, {
        projectRoot: this.projectRoot,
        maxBytes: 200_000,
      });
      originalContent = readResult.content;
    } catch (err: any) {
      return {
        success: false,
        output: `Tidak bisa membaca file: ${err.message}`,
        feedback: {
          actionType: 'file.patch',
          status: 'failed',
          errorCode: 'FILE_NOT_FOUND',
          message: `File tidak ditemukan atau tidak bisa dibaca: ${filePath}`,
          suggestedNextStep: 'Gunakan file.read untuk cek keberadaan file, atau file.write untuk membuat file baru.',
        },
      };
    }

    // Normalisasi patch: jika AI sudah menghasilkan fenced block (```diff...```),
    // strip fence-nya dulu agar tidak terjadi double-wrap saat kita tambahkan fence baru.
    const normalizedPatch = normalizePatchInput(patchStr);

    const extracted = this.patchApplicator.extract(
      `\`\`\`diff\n${normalizedPatch}\n\`\`\``,
      this.patchApplicator.getExtension(filePath),
    );
    if (!extracted) {
      return {
        success: false,
        output: [
          'Tidak bisa mengekstrak patch dari respons AI.',
          'Format yang diharapkan:',
          '--- a/file.ts',
          '+++ b/file.ts',
          '@@ ... @@',
          '-baris lama',
          '+baris baru',
        ].join('\n'),
        feedback: {
          actionType: 'file.patch',
          status: 'failed',
          errorCode: 'PATCH_PARSE_FAILED',
          message: 'Patch tidak valid sebagai unified diff.',
          suggestedNextStep: 'Hasilkan patch dalam format unified diff standar (--- a/file \n+++ b/file \n@@ ... @@).',
        },
      };
    }

    const newContent = this.patchApplicator.apply(originalContent, extracted);
    if (!newContent) {
      return {
        success: false,
        output: 'Patch gagal diapply — patch mungkin tidak cocok dengan isi file saat ini',
        feedback: {
          actionType: 'file.patch',
          status: 'failed',
          errorCode: 'PATCH_APPLY_FAILED',
          message: 'Patch tidak cocok dengan isi file saat ini.',
          suggestedNextStep: 'Baca ulang isi file dengan file.read, lalu buat patch baru yang sesuai dengan versi terkini.',
        },
      };
    }

    const writeResult = await this.fileManager.write(filePath, newContent, 'overwrite', {
      requireApproval: true,
      reason,
      showDiff: true,
      // P2-01: Batch approval bypass
      autoApprove: options?.batchApprove === true,
    });

    this.fileManager.printResult(writeResult);

    return {
      success: writeResult.success,
      output: writeResult.success
        ? `Patch applied: ${writeResult.path}`
        : writeResult.error ?? 'Gagal apply patch',
    };
  }

  // ─── File Read ────────────────────────────────────────────────────────────

  private async runFileRead(filePath: string): Promise<AgentStepResult> {
    try {
      const result = await safeReadTextFile(filePath, {
        projectRoot: this.projectRoot,
        maxBytes: 100_000,
      });
      return {
        success: true,
        output: `[File: ${result.relativePath}]\n${result.content.slice(0, 8000)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Tidak bisa membaca file: ${err.message}`,
        feedback: {
          actionType: 'file.read',
          status: 'failed',
          errorCode: 'FILE_NOT_FOUND',
          message: `File tidak ditemukan: ${filePath}`,
          suggestedNextStep: 'Pastikan path benar dan file ada. Cek dengan terminal.run "ls" atau "dir" untuk melihat struktur direktori.',
        },
      };
    }
  }
}
