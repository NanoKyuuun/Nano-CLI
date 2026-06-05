/**
 * toolRouter.ts
 *
 * Membaca respons model dan mengekstrak tool call.
 *
 * Format yang dikenali (dua strategi, dijalankan berurutan):
 *
 * Strategi A — Split format (DIUTAMAKAN, lebih reliable):
 *   JSON header tanpa "content", lalu code block berikutnya sebagai isi file:
 *
 *   ```json
 *   {"type": "file.write", "path": "src/auth.ts", "mode": "create", "reason": "..."}
 *   ```
 *   ```ts
 *   // isi file lengkap di sini
 *   export class AuthService { ... }
 *   ```
 *
 * Strategi B — Inline format (fallback, untuk action sederhana):
 *   JSON lengkap dalam satu block (cocok untuk terminal.run, file.read, final):
 *
 *   ```json
 *   {"type": "terminal.run", "command": "npm test", "reason": "Run tests"}
 *   ```
 */

import { z } from 'zod';
import JSON5 from 'json5';
import { AgentAction, ParsedToolCall } from './agentTypes';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const TerminalRunSchema = z.object({
  type: z.literal('terminal.run'),
  command: z.string().min(1),
  cwd: z.string().optional(),
  reason: z.string(),
});

// file.write: content adalah optional di schema-level karena bisa datang dari code block
const FileWriteSchema = z.object({
  type: z.literal('file.write'),
  path: z.string().min(1),
  content: z.string().optional().default(''),
  mode: z.enum(['create', 'overwrite', 'append']).default('create'),
  reason: z.string(),
});

const FilePatchSchema = z.object({
  type: z.literal('file.patch'),
  path: z.string().min(1),
  patch: z.string().optional().default(''),
  reason: z.string(),
});

const FileReadSchema = z.object({
  type: z.literal('file.read'),
  path: z.string().min(1),
  reason: z.string().optional(),
});

const FinalAnswerSchema = z.object({
  type: z.literal('final'),
  summary: z.string(),
  filesChanged: z.array(z.string()).optional(),
  commandsRun: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
});

const AgentActionSchema = z.discriminatedUnion('type', [
  TerminalRunSchema,
  FileWriteSchema,
  FilePatchSchema,
  FileReadSchema,
  FinalAnswerSchema,
]);

// ─── ToolRouter ───────────────────────────────────────────────────────────────

export class ToolRouter {
  /**
   * Parse respons model menjadi AgentAction.
   *
   * Mencoba beberapa strategi secara berurutan:
   * 1. Split format: JSON header + code block berikutnya sebagai content
   * 2. Inline format: JSON lengkap dalam satu ```json block
   * 3. Fallback: deteksi code block dengan marker file (misal: // File: path)
   */
  parse(response: string, fullResponse?: string): ParsedToolCall {
    const text = fullResponse ?? response;

    // ─── Strategi 1: Cari semua ```json blocks ──────────────────────────────
    // Ambil SEMUA code blocks (termasuk non-JSON) untuk keperluan split format
    const allCodeBlocks = this.extractAllCodeBlocks(text);

    for (let i = 0; i < allCodeBlocks.length; i++) {
      const block = allCodeBlocks[i]!;
      if (block.lang !== 'json') continue;

      // Coba parse JSON dari block ini
      // P2-06: Gunakan JSON.parse dulu (strict), lalu fallback ke JSON5 (toleran).
      // JSON5 lebih tahan terhadap output LLM yang memiliki:
      // - trailing comma  : {"key": "val",}
      // - komentar inline : {/* type */ "type": "file.write"}
      // - single-quote    : {'type': 'terminal.run'}
      let parsed: unknown;
      try {
        parsed = JSON.parse(block.content);
      } catch {
        try {
          parsed = JSON5.parse(block.content);
        } catch {
          continue; // bukan JSON/JSON5 valid, lanjut ke block berikutnya
        }
      }

      // Validasi schema
      const result = AgentActionSchema.safeParse(parsed);
      if (!result.success) continue;

      const action = result.data as AgentAction;

      // ─── Split Format: jika file.write atau file.patch tanpa content ──────
      if (action.type === 'file.write' && !action.content) {
        // Ambil code block berikutnya sebagai isi file
        const nextBlock = allCodeBlocks[i + 1];
        if (nextBlock) {
          action.content = nextBlock.content;
          return { valid: true, action };
        }
        // Tidak ada code block berikutnya — coba ambil apapun yang ada
        // Mungkin AI lupa format, coba cari code block non-json pertama
        const nonJsonBlock = allCodeBlocks.find(b => b.lang !== 'json');
        if (nonJsonBlock) {
          action.content = nonJsonBlock.content;
          return { valid: true, action };
        }
        // Benar-benar tidak ada content → invalid
        return {
          valid: false,
          rawJson: block.content,
          error: 'file.write_without_content: tidak ada code block setelah JSON header',
        };
      }

      if (action.type === 'file.patch' && !action.patch) {
        const nextBlock = allCodeBlocks[i + 1];
        if (nextBlock) {
          action.patch = nextBlock.content;
          return { valid: true, action };
        }
        return {
          valid: false,
          rawJson: block.content,
          error: 'file.patch_without_content',
        };
      }

      // Action lain (terminal.run, file.read, final) — langsung return
      return { valid: true, action };
    }

    // ─── Strategi 2: Inline JSON object di luar code block ──────────────────
    // Hanya untuk action sederhana — file.write biasanya terlalu panjang
    const inlineMatch = text.match(/\{"type"\s*:\s*"(terminal\.run|file\.read|final)"[\s\S]*?\}/);
    if (inlineMatch) {
      try {
        const parsed = JSON.parse(inlineMatch[0]);
        const result = AgentActionSchema.safeParse(parsed);
        if (result.success) {
          return { valid: true, action: result.data as AgentAction };
        }
      } catch {
        // bukan JSON valid
      }
    }

    // ─── Strategi 3: Fallback — deteksi markdown code block dengan komentar file ─
    // AI mungkin menulis: `// File: src/auth.ts` lalu code block
    // Ini fallback terakhir sebelum menyerah
    const fileMarkerMatch = text.match(
      /(?:\/\/\s*File:\s*|#\s*File:\s*|<!--\s*File:\s*)([\w./\-]+)[^\n]*\n[\s\S]*?```(\w*)\s*\n([\s\S]*?)\n```/
    );
    if (fileMarkerMatch && fileMarkerMatch[1] && fileMarkerMatch[3]) {
      return {
        valid: true,
        action: {
          type: 'file.write',
          path: fileMarkerMatch[1],
          content: fileMarkerMatch[3],
          mode: 'create',
          reason: 'Auto-extracted from AI response (file marker)',
        },
      };
    }

    // Tidak ada tool call valid ditemukan
    return { valid: false, error: 'no_tool_call' };
  }

  /**
   * Cek apakah respons mengandung tanda "task selesai" secara eksplisit.
   * Sengaja ketat — hindari false positive dari kata umum.
   */
  isFinalResponse(response: string): boolean {
    // Harus ada frase yang eksplisit dan spesifik — bukan sekedar kata umum
    const explicitFinal = [
      'task completed',
      'task selesai',
      'tugas selesai',
      'semua file telah dibuat',
      'semua perubahan telah selesai',
      'implementasi selesai',
      'all files have been created',
      'all done',
    ];
    const lower = response.toLowerCase();
    return explicitFinal.some(phrase => lower.includes(phrase));
  }

  /**
   * Ekstrak semua code block dari teks markdown.
   * Returns array of { lang, content } dalam urutan kemunculan.
   */
  extractAllCodeBlocks(text: string): Array<{ lang: string; content: string }> {
    const results: Array<{ lang: string; content: string }> = [];
    // Regex: ```lang\n content \n``` — non-greedy, multiline
    const regex = /```(\w*)\s*\n([\s\S]*?)\n```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        lang: (match[1] ?? '').toLowerCase(),
        content: (match[2] ?? '').trim(),
      });
    }
    return results;
  }
}
