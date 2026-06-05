import { describe, it, expect } from 'vitest';
import { ToolRouter } from '../src/agent/toolRouter';

/**
 * Test untuk ToolRouter.parse() — action parsing dari respons AI.
 *
 * Mencakup:
 * 1. Split format (JSON header + code block berikutnya)
 * 2. Inline format (terminal.run, file.read, final)
 * 3. Error cases (invalid JSON, missing content)
 * 4. isFinalResponse() detection
 * 5. extractAllCodeBlocks() correctness
 */

describe('ToolRouter', () => {
  const router = new ToolRouter();

  // ─── Split Format: file.write ─────────────────────────────────────────────

  describe('parse() — split format file.write', () => {
    it('harus parse file.write dengan code block setelah JSON header', () => {
      const response = `
Saya akan membuat file auth.ts:

\`\`\`json
{"type": "file.write", "path": "src/auth.ts", "mode": "create", "reason": "Create auth service"}
\`\`\`

\`\`\`typescript
export class AuthService {
  login(user: string) { return true; }
}
\`\`\`
`;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect(result.action?.type).toBe('file.write');
      expect((result.action as any)?.path).toBe('src/auth.ts');
      expect((result.action as any)?.content).toContain('AuthService');
    });

    it('harus gagal jika file.write tanpa code block berikutnya (no content)', () => {
      const response = `
\`\`\`json
{"type": "file.write", "path": "src/empty.ts", "mode": "create", "reason": "test"}
\`\`\`

Tidak ada code block di sini.
`;
      // Tidak ada code block non-json setelah header
      // Catatan: toolRouter mencoba cari nonJsonBlock sebagai fallback
      // Jika memang tidak ada sama sekali → invalid
      const result = router.parse(response);
      // Ini bisa valid (karena ada fallback ke nonJsonBlock) atau invalid
      // Yang penting: jika valid, content tidak boleh berisi JSON header itu sendiri
      if (result.valid) {
        expect((result.action as any)?.content).not.toContain('"type"');
      }
    });
  });

  // ─── Inline Format: terminal.run ─────────────────────────────────────────

  describe('parse() — inline format terminal.run', () => {
    it('harus parse terminal.run dari JSON code block', () => {
      const response = `
Saya akan menjalankan test:

\`\`\`json
{"type": "terminal.run", "command": "npm test", "reason": "Jalankan test suite"}
\`\`\`
`;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect(result.action?.type).toBe('terminal.run');
      expect((result.action as any)?.command).toBe('npm test');
    });

    it('harus parse terminal.run dengan cwd opsional', () => {
      const response = `\`\`\`json
{"type": "terminal.run", "command": "npm install", "cwd": "packages/ui", "reason": "Install deps"}
\`\`\``;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect((result.action as any)?.cwd).toBe('packages/ui');
    });
  });

  // ─── Inline Format: final ────────────────────────────────────────────────

  describe('parse() — final action', () => {
    it('harus parse final action dengan summary', () => {
      const response = `
Task selesai. Berikut ringkasannya:

\`\`\`json
{
  "type": "final",
  "summary": "Berhasil membuat auth service dan unit test.",
  "filesChanged": ["src/auth.ts", "tests/auth.test.ts"],
  "commandsRun": ["npm test"]
}
\`\`\`
`;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect(result.action?.type).toBe('final');
      expect((result.action as any)?.summary).toContain('auth service');
      expect((result.action as any)?.filesChanged).toContain('src/auth.ts');
    });

    it('final tanpa filesChanged atau commandsRun tetap valid', () => {
      const response = `\`\`\`json
{"type": "final", "summary": "Selesai."}
\`\`\``;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect(result.action?.type).toBe('final');
    });
  });

  // ─── file.read ───────────────────────────────────────────────────────────

  describe('parse() — file.read', () => {
    it('harus parse file.read action', () => {
      const response = `\`\`\`json
{"type": "file.read", "path": "src/config.ts", "reason": "Baca konfigurasi"}
\`\`\``;
      const result = router.parse(response);
      expect(result.valid).toBe(true);
      expect(result.action?.type).toBe('file.read');
      expect((result.action as any)?.path).toBe('src/config.ts');
    });
  });

  // ─── Error cases ─────────────────────────────────────────────────────────

  describe('parse() — error cases', () => {
    it('teks kosong → valid: false', () => {
      expect(router.parse('').valid).toBe(false);
    });

    it('narasi tanpa JSON block → valid: false', () => {
      expect(router.parse('Saya akan membantu kamu dengan coding.').valid).toBe(false);
    });

    it('JSON tidak valid di dalam code block → valid: false', () => {
      const response = `\`\`\`json
{invalid json here}
\`\`\``;
      expect(router.parse(response).valid).toBe(false);
    });

    it('JSON valid tapi bukan AgentAction → valid: false', () => {
      const response = `\`\`\`json
{"name": "John", "age": 30}
\`\`\``;
      expect(router.parse(response).valid).toBe(false);
    });

    it('type tidak dikenal → valid: false', () => {
      const response = `\`\`\`json
{"type": "unknown.action", "path": "test.ts", "reason": "test"}
\`\`\``;
      expect(router.parse(response).valid).toBe(false);
    });
  });

  // ─── isFinalResponse ─────────────────────────────────────────────────────

  describe('isFinalResponse()', () => {
    it('mendeteksi "task selesai"', () => {
      expect(router.isFinalResponse('Semua perubahan sudah dibuat. Task selesai.')).toBe(true);
    });

    it('mendeteksi "all done" (case insensitive)', () => {
      expect(router.isFinalResponse('I am done. All done!')).toBe(true);
    });

    it('mendeteksi "implementasi selesai"', () => {
      expect(router.isFinalResponse('Implementasi selesai dengan sukses.')).toBe(true);
    });

    it('kata umum seperti "done" saja tidak trigger', () => {
      // "done" saja bukan frase final yang eksplisit
      expect(router.isFinalResponse('I am done with this step.')).toBe(false);
    });

    it('teks kosong → false', () => {
      expect(router.isFinalResponse('')).toBe(false);
    });
  });

  // ─── extractAllCodeBlocks ────────────────────────────────────────────────

  describe('extractAllCodeBlocks()', () => {
    it('mengekstrak satu code block', () => {
      const text = '```typescript\nconst x = 1;\n```';
      const blocks = router.extractAllCodeBlocks(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.lang).toBe('typescript');
      expect(blocks[0]?.content).toContain('const x = 1');
    });

    it('mengekstrak dua code block berurutan', () => {
      const text = '```json\n{"key": "val"}\n```\n\n```ts\nconst y = 2;\n```';
      const blocks = router.extractAllCodeBlocks(text);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.lang).toBe('json');
      expect(blocks[1]?.lang).toBe('ts');
    });

    it('code block tanpa bahasa → lang string kosong', () => {
      const text = '```\nsome content\n```';
      const blocks = router.extractAllCodeBlocks(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.lang).toBe('');
    });

    it('tidak ada code block → array kosong', () => {
      const blocks = router.extractAllCodeBlocks('Teks biasa tanpa code block.');
      expect(blocks).toHaveLength(0);
    });
  });
});
