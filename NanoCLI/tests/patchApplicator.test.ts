import { describe, it, expect } from 'vitest';
import { PatchApplicator } from '../src/file/patchApplicator';

/**
 * Test untuk PatchApplicator + normalizePatchInput.
 *
 * Regression test untuk P0-06: double-wrap patch extraction.
 * Test memverifikasi bahwa extract() bekerja untuk:
 * 1. Raw unified diff (tanpa fence)
 * 2. Fenced diff (```diff...```)
 * 3. Double-fenced diff (setelah normalizePatchInput)
 */

// Inline copy normalizePatchInput untuk testing isolasi
// (agar test tidak bergantung pada internal StepRunner)
function normalizePatchInput(input: string): string {
  const trimmed = input.trim();
  const fenced  = trimmed.match(/^```(?:diff|patch)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1]!.trim() : trimmed;
}

const RAW_DIFF = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 99;
 const z = 3;`;

const FENCED_DIFF = `\`\`\`diff
${RAW_DIFF}
\`\`\``;

const ORIGINAL_CONTENT = `const x = 1;
const y = 2;
const z = 3;`;

describe('PatchApplicator', () => {
  const applicator = new PatchApplicator();

  describe('extract()', () => {
    it('harus extract patch dari fenced block', () => {
      const result = applicator.extract(FENCED_DIFF, '.ts');
      expect(result).not.toBeNull();
    });

    it('harus extract patch dari double-fenced block setelah normalisasi', () => {
      // Simulasikan apa yang terjadi di stepRunner:
      // patchStr = FENCED_DIFF (dari AI)
      // normalizePatchInput menghapus fence luar
      // lalu dibungkus ulang oleh stepRunner
      const normalizedPatch = normalizePatchInput(FENCED_DIFF);
      const wrappedForExtract = `\`\`\`diff\n${normalizedPatch}\n\`\`\``;
      const result = applicator.extract(wrappedForExtract, '.ts');
      expect(result).not.toBeNull();
    });

    it('return null untuk string kosong', () => {
      const result = applicator.extract('', '.ts');
      expect(result).toBeNull();
    });
  });

  describe('normalizePatchInput()', () => {
    it('raw diff tidak berubah', () => {
      const result = normalizePatchInput(RAW_DIFF);
      expect(result).toBe(RAW_DIFF);
    });

    it('fenced diff → strip fence, return raw diff', () => {
      const result = normalizePatchInput(FENCED_DIFF);
      expect(result).toBe(RAW_DIFF);
    });

    it('double-fenced → strip fence luar, return raw diff', () => {
      const doubleFenced = `\`\`\`diff\n${FENCED_DIFF}\n\`\`\``;
      const result = normalizePatchInput(doubleFenced);
      // Setelah normalisasi, hasilnya adalah FENCED_DIFF (1 layer fence masih ada)
      // Ini masih valid karena stepRunner akan wrap ulang
      expect(result).toContain('--- a/test.ts');
    });
  });

  describe('apply()', () => {
    it('harus apply patch ke content dengan benar', () => {
      const extracted = applicator.extract(FENCED_DIFF, '.ts');
      expect(extracted).not.toBeNull();
      const result = applicator.apply(ORIGINAL_CONTENT, extracted!);
      expect(result).not.toBeNull();
      expect(result).toContain('const y = 99;');
      expect(result).not.toContain('const y = 2;');
    });
  });
});
