/**
 * patchApplicator.ts
 *
 * Mengekstrak kode dari respons AI (markdown code block),
 * membandingkan dengan file asli, dan menerapkan perubahan.
 *
 * Strategi:
 * 1. Coba parse sebagai unified diff dan apply secara bertahap
 * 2. Fallback: gunakan konten code block terbesar sebagai full replacement
 */

import { applyPatch } from 'diff';
import path from 'path';

export interface ExtractedPatch {
  /** Konten yang diekstrak dari code block */
  content: string;
  /** Apakah ini berbentuk unified diff */
  isUnifiedDiff: boolean;
  /** Language hint dari code block (ts, js, dll) */
  language?: string;
}

export class PatchApplicator {
  /**
   * Ekstrak kode dari respons AI.
   * Prioritas: unified diff > code block terbesar.
   */
  extract(aiResponse: string, targetExtension?: string): ExtractedPatch | null {
    // Cari semua code block dalam respons
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const blocks: Array<{ lang: string; content: string }> = [];

    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
      blocks.push({
        lang: (match[1] ?? '').toLowerCase(),
        content: match[2] ?? '',
      });
    }

    if (blocks.length === 0) return null;

    // Cari unified diff (dimulai dengan --- atau @@)
    for (const block of blocks) {
      if (block.lang === 'diff' || block.lang === 'patch') {
        return { content: block.content, isUnifiedDiff: true, language: 'diff' };
      }
      if (block.content.startsWith('---') && block.content.includes('@@')) {
        return { content: block.content, isUnifiedDiff: true, language: 'diff' };
      }
    }

    // Cari code block yang cocok dengan extension file target
    if (targetExtension) {
      const extWithoutDot = targetExtension.replace(/^\./, '');
      const langAliases: Record<string, string[]> = {
        ts: ['ts', 'typescript'],
        tsx: ['tsx', 'typescript'],
        js: ['js', 'javascript'],
        jsx: ['jsx', 'javascript'],
        py: ['py', 'python'],
        go: ['go'],
        rs: ['rs', 'rust'],
        java: ['java'],
        rb: ['rb', 'ruby'],
        php: ['php'],
        cs: ['cs', 'csharp'],
        html: ['html'],
        css: ['css'],
        md: ['md', 'markdown'],
        json: ['json'],
        yml: ['yml', 'yaml'],
        yaml: ['yml', 'yaml'],
      };
      const acceptedLangs = langAliases[extWithoutDot] ?? [extWithoutDot];
      for (const block of blocks) {
        if (acceptedLangs.includes(block.lang)) {
          return { content: block.content, isUnifiedDiff: false, language: block.lang };
        }
      }
    }

    // Fallback: code block terbesar
    const largest = blocks.reduce((a, b) => (a.content.length >= b.content.length ? a : b));
    const result: ExtractedPatch = { content: largest.content, isUnifiedDiff: false };
    if (largest.lang) result.language = largest.lang;
    return result;
  }

  /**
   * Terapkan patch ke konten lama.
   * Jika unified diff: gunakan applyPatch dari library diff.
   * Jika full replacement: kembalikan konten baru langsung.
   */
  apply(originalContent: string, patch: ExtractedPatch): string | null {
    if (patch.isUnifiedDiff) {
      const result = applyPatch(originalContent, patch.content);
      // applyPatch mengembalikan false jika gagal
      if (result === false) return null;
      return result;
    }

    // Full replacement
    return patch.content;
  }

  /**
   * Helper: ambil extension file dari path.
   */
  getExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }
}
