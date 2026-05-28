/**
 * stepRunner.ts
 *
 * Eksekutor untuk setiap AgentAction.
 * Menghubungkan ToolRouter output ke layer eksekusi yang tepat.
 */

import path from 'path';
import { AgentAction, AgentStepResult, AgentLoopOptions } from './agentTypes';
import { FileOperationManager } from '../file/fileOperationManager';
import { PatchApplicator } from '../file/patchApplicator';
import { PolicyEngine } from '../security/policyEngine';
import { CommandExecutor } from '../terminal/commandExecutor';
import { ShellDetector } from '../terminal/shellDetector';
import { safeReadTextFile } from '../files/safeFileReader';
import { Renderer } from '../ui/render';

export class StepRunner {
  private fileManager: FileOperationManager;
  private patchApplicator: PatchApplicator;
  private policyEngine: PolicyEngine;
  private commandExecutor: CommandExecutor;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd(), options?: AgentLoopOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.fileManager = new FileOperationManager(projectRoot);
    this.patchApplicator = new PatchApplicator();
    this.policyEngine = new PolicyEngine(projectRoot);
    this.commandExecutor = new CommandExecutor(projectRoot);
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
        return this.runFileWrite(action.path, action.content, action.mode, action.reason);

      case 'file.patch':
        return this.runFilePatch(action.path, action.patch, action.reason);

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
        return {
          success: false,
          output: `Ditolak: permission 'readonly' tidak mengizinkan ${action.type}. Hanya file.read yang diizinkan di mode ini.`,
          skipped: true,
          skipReason: `readonly permission blocks ${action.type}`,
        };
      }
    }

    // workspace dan full: tidak ada pre-rejection di sini.
    // Perbedaan hanya pada cwd boundary yang di-enforce di runTerminal.
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
        return {
          success: false,
          output: `Ditolak: cwd "${effectiveCwd}" berada di luar workspace "${this.projectRoot}". Gunakan permission 'full' jika perlu menjalankan command di luar project root.`,
          skipped: true,
          skipReason: 'workspace boundary violation',
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
    });

    if (!policyResult.approval.approved) {
      const result: AgentStepResult = {
        success: false,
        output: `Command ditolak: ${policyResult.approval.reason ?? 'user menolak'}`,
        skipped: true,
      };
      if (policyResult.approval.reason) result.skipReason = policyResult.approval.reason;
      return result;
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
      return {
        success: false,
        output: `Exit ${result.exitCode ?? 'null'}: ${output.slice(0, 2000)}`,
      };
    }

    return { success: true, output: output.slice(0, 2000) };
  }

  // ─── File Write ───────────────────────────────────────────────────────────

  private async runFileWrite(
    filePath: string,
    content: string,
    mode: 'create' | 'overwrite' | 'append',
    reason: string,
  ): Promise<AgentStepResult> {
    Renderer.printStatus(`File write: ${filePath} (${mode})`, 'info');

    const result = await this.fileManager.write(filePath, content, mode, {
      requireApproval: true,
      reason,
      showDiff: mode !== 'create',
    });

    this.fileManager.printResult(result);

    return {
      success: result.success,
      output: result.success
        ? `File ${mode === 'create' ? 'dibuat' : 'diupdate'}: ${result.path}${result.diff ? ` (${result.diff})` : ''}`
        : result.error ?? 'Gagal',
    };
  }

  // ─── File Patch ───────────────────────────────────────────────────────────

  private async runFilePatch(
    filePath: string,
    patchStr: string,
    reason: string,
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
      return { success: false, output: `Tidak bisa membaca file: ${err.message}` };
    }

    const extracted = this.patchApplicator.extract(
      `\`\`\`diff\n${patchStr}\n\`\`\``,
      this.patchApplicator.getExtension(filePath),
    );
    if (!extracted) {
      return { success: false, output: 'Tidak bisa mengekstrak patch dari respons AI' };
    }

    const newContent = this.patchApplicator.apply(originalContent, extracted);
    if (!newContent) {
      return { success: false, output: 'Patch gagal diapply (format tidak cocok)' };
    }

    const writeResult = await this.fileManager.write(filePath, newContent, 'overwrite', {
      requireApproval: true,
      reason,
      showDiff: true,
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
      return { success: false, output: `Tidak bisa membaca file: ${err.message}` };
    }
  }
}
