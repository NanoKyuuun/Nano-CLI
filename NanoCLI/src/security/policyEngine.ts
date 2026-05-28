/**
 * policyEngine.ts
 *
 * Orchestrator keamanan — menggabungkan:
 * 1. CommandRiskAnalyzer → klasifikasi risiko
 * 2. ApprovalGate → minta izin user
 * 3. AuditLogger → catat keputusan
 *
 * Semua command (dari user CLI atau dari model proposal)
 * harus melewati PolicyEngine sebelum dieksekusi.
 */

import { CommandRiskAnalyzer } from './commandRiskAnalyzer';
import { ApprovalGate, ApprovalResult } from './approvalGate';
import { AuditLogger } from './auditLogger';
import { CommandRiskResult } from '../terminal/terminalTypes';

export interface PolicyResult {
  risk: CommandRiskResult;
  approval: ApprovalResult;
  finalCommand: string;
}

export class PolicyEngine {
  private analyzer: CommandRiskAnalyzer;
  private approvalGate: ApprovalGate;
  private auditLogger: AuditLogger;

  constructor(projectRoot: string = process.cwd()) {
    this.analyzer = new CommandRiskAnalyzer();
    this.approvalGate = new ApprovalGate();
    this.auditLogger = new AuditLogger(projectRoot);
  }

  /**
   * Validasi command, minta approval user, dan catat keputusan.
   *
   * @param options.command - Command yang akan dijalankan
   * @param options.cwd - Working directory
   * @param options.shellName - Nama shell (opsional, untuk display)
   * @param options.reason - Alasan AI mengusulkan command (opsional)
   * @param options.skipApprovalForLowRisk - Jika true, low-risk command
   *   langsung diizinkan tanpa prompt. TETAP menjalankan risk analyzer.
   */
  async validateAndApprove(options: {
    command: string;
    cwd: string;
    shellName?: string;
    reason?: string;
    skipApprovalForLowRisk?: boolean;
  }): Promise<PolicyResult> {
    // 1. Analisis risiko — SELALU dijalankan, tidak bisa di-skip
    const risk = this.analyzer.analyze(options.command);

    // 2. Tentukan apakah perlu approval
    let approval: ApprovalResult;

    if (options.skipApprovalForLowRisk && risk.level === 'low') {
      // --yes flag hanya berlaku untuk low-risk
      approval = { approved: true, reason: 'auto_approved_low_risk' };
    } else {
      // Semua level lain (termasuk low tanpa --yes) harus melalui gate
      approval = await this.approvalGate.ask({
        command: options.command,
        cwd: options.cwd,
        ...(options.shellName !== undefined && { shellName: options.shellName }),
        risk,
        ...(options.reason !== undefined && { reason: options.reason }),
      });
    }

    const finalCommand = approval.editedCommand ?? options.command;

    // 3. Jika command diedit, analisis ulang command baru
    //    (user bisa saja mengedit command menjadi lebih berbahaya)
    if (approval.editedCommand) {
      const editedRisk = this.analyzer.analyze(approval.editedCommand);
      if (editedRisk.blocked) {
        // Command yang diedit ternyata blocked → tolak
        approval = { approved: false, reason: 'edited_command_blocked' };

        await this.auditLogger.log({
          type: 'terminal.command',
          command: finalCommand,
          cwd: options.cwd,
          shell: options.shellName ?? 'unknown',
          risk: editedRisk.level,
          approved: false,
          reason: 'Edited command blocked by policy',
        });

        return { risk: editedRisk, approval, finalCommand };
      }
    }

    // 4. Tentukan risk final — gunakan risk dari command yang benar-benar dijalankan
    // BUG-06 fix: jika command diedit, re-analyze untuk mendapat risk yang akurat.
    // Tanpa ini, return value & audit log mencatat level risk yang salah.
    const finalRisk = approval.editedCommand
      ? this.analyzer.analyze(approval.editedCommand)
      : risk;

    // 5. Audit log keputusan
    await this.auditLogger.log({
      type: 'terminal.policy_decision',
      command: finalCommand,
      cwd: options.cwd,
      shell: options.shellName ?? 'unknown',
      risk: finalRisk.level,
      approved: approval.approved,
      reason: approval.reason,
    });

    return { risk: finalRisk, approval, finalCommand };
  }
}
