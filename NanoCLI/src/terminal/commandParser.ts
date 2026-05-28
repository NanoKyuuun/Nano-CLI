/**
 * commandParser.ts
 *
 * Validasi dan parsing action proposal dari model AI.
 * Model mengusulkan command dalam format JSON, NanoCLI memvalidasi
 * strukturnya sebelum meneruskan ke PolicyEngine.
 *
 * Format yang didukung:
 * - terminal.propose: command lokal
 * - ssh.propose: command SSH via profile alias (future — Phase 5)
 *
 * Menggunakan Zod untuk validasi schema yang ketat.
 */

import { z } from 'zod';
import { CommandProposal, SSHCommandProposal } from './terminalTypes';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const TerminalProposalSchema = z.object({
  type: z.literal('terminal.propose'),
  command: z.string().min(1, 'Command tidak boleh kosong'),
  cwd: z.string().optional(),
  session: z.string().optional(),
  reason: z.string().optional(),
  expectedImpact: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
});

export const SSHProposalSchema = z.object({
  type: z.literal('ssh.propose'),
  profile: z.string().min(1, 'Profile tidak boleh kosong'),
  command: z.string().min(1, 'Command tidak boleh kosong'),
  reason: z.string().optional(),
  expectedImpact: z.string().optional(),
  requireSudo: z.boolean().optional(),
  timeoutMs: z.number().positive().optional(),
});

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Coba extract JSON action block dari text response model.
 * Model bisa menyisipkan JSON di dalam markdown code block atau inline.
 *
 * Return:
 * - CommandProposal jika terminal.propose terdeteksi
 * - SSHCommandProposal jika ssh.propose terdeteksi
 * - null jika tidak ada proposal valid
 */
export function parseProposal(text: string): CommandProposal | SSHCommandProposal | null {
  // Cari JSON blocks dalam text (bisa dalam code fence atau standalone)
  const jsonCandidates = extractJsonBlocks(text);

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate);

      // Cek apakah ini terminal.propose
      if (parsed?.type === 'terminal.propose') {
        const result = TerminalProposalSchema.safeParse(parsed);
        if (result.success) return result.data as CommandProposal;
      }

      // Cek apakah ini ssh.propose
      if (parsed?.type === 'ssh.propose') {
        const result = SSHProposalSchema.safeParse(parsed);
        if (result.success) return result.data as SSHCommandProposal;
      }
    } catch {
      // Bukan valid JSON — skip
    }
  }

  return null;
}

/**
 * Extract semua kemungkinan JSON block dari text.
 * Mendukung:
 * 1. ```json ... ``` code fences
 * 2. { ... } standalone blocks
 */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];

  // 1. Code fences: ```json ... ```
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const content = match[1]?.trim();
    if (content) blocks.push(content);
  }

  // 2. Standalone JSON objects: { "type": ... }
  //    Hanya cari yang dimulai dengan { "type" untuk menghindari false positive
  const standaloneRegex = /\{[^{}]*"type"\s*:\s*"(?:terminal|ssh)\.propose"[^{}]*\}/g;
  while ((match = standaloneRegex.exec(text)) !== null) {
    blocks.push(match[0]);
  }

  return blocks;
}
