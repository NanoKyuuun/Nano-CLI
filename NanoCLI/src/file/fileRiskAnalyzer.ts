/**
 * fileRiskAnalyzer.ts
 *
 * Mengklasifikasikan risiko operasi file sebelum dieksekusi.
 * Prinsip: semakin besar dampak yang tidak bisa di-undo, semakin tinggi risikonya.
 *
 * Level:
 * - low    : buat file baru, tambah direktori
 * - medium : overwrite file non-kritis
 * - high   : overwrite file kode utama, config penting
 * - blocked: operasi yang selalu ditolak (delete, chmod)
 */

import path from 'path';
import { FileRiskLevel, FileRiskResult, FileWriteMode } from './fileTypes';

/** Extension file kode sumber yang punya risiko lebih tinggi saat di-overwrite */
const HIGH_RISK_CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.cs',
  '.vue', '.svelte', '.astro',
]);

/** File konfigurasi penting yang berisiko jika diubah */
const HIGH_RISK_CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json',
  'vite.config.ts', 'vite.config.js',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'nuxt.config.ts', 'svelte.config.js',
  'webpack.config.js', 'rollup.config.js',
  'jest.config.ts', 'jest.config.js',
  'vitest.config.ts', 'vitest.config.js',
  'eslint.config.js', '.eslintrc.js', '.eslintrc.json',
  'prettier.config.js', '.prettierrc',
  'tailwind.config.ts', 'tailwind.config.js',
  'drizzle.config.ts', 'prisma.schema',
  'Dockerfile', 'docker-compose.yml',
  '.gitignore', '.gitattributes',
]);

export class FileRiskAnalyzer {
  /**
   * Analisis risiko operasi write/overwrite.
   */
  analyze(options: {
    relativePath: string;
    mode: FileWriteMode;
    fileExists: boolean;
    sizeBytes?: number;
  }): FileRiskResult {
    const { relativePath, mode, fileExists } = options;
    const reasons: string[] = [];
    let level: FileRiskLevel = 'low';

    const basename = path.basename(relativePath).toLowerCase();
    const ext = path.extname(relativePath).toLowerCase();

    // CREATE — file baru, risiko rendah
    if (mode === 'create' && !fileExists) {
      return { level: 'low', reasons: ['Membuat file baru'], blocked: false };
    }

    // OVERWRITE atau CREATE pada file yang sudah ada
    if (mode === 'overwrite' || (mode === 'create' && fileExists)) {
      reasons.push('Menimpa file yang sudah ada');
      level = 'medium';

      // File kode sumber → high
      if (HIGH_RISK_CODE_EXTENSIONS.has(ext)) {
        reasons.push(`File kode sumber (${ext})`);
        level = 'high';
      }

      // File konfigurasi kritis → high
      if (HIGH_RISK_CONFIG_NAMES.has(basename)) {
        reasons.push(`File konfigurasi kritis (${basename})`);
        level = 'high';
      }

      // File besar → tambah warning
      if (options.sizeBytes && options.sizeBytes > 50_000) {
        reasons.push(`File besar (${(options.sizeBytes / 1024).toFixed(1)} KB)`);
      }
    }

    // APPEND — risiko medium
    if (mode === 'append') {
      reasons.push('Menambahkan konten ke file yang ada');
      level = 'medium';
    }

    return { level, reasons, blocked: false };
  }

  /**
   * Analisis risiko operasi delete — selalu high/blocked.
   */
  analyzeDelete(relativePath: string): FileRiskResult {
    const ext = path.extname(relativePath).toLowerCase();
    const reasons = ['Menghapus file permanen — tidak bisa di-undo tanpa backup'];

    if (HIGH_RISK_CODE_EXTENSIONS.has(ext)) {
      reasons.push('File kode sumber');
      return { level: 'blocked', reasons, blocked: true };
    }

    return { level: 'high', reasons, blocked: false };
  }

  /** Human-readable label untuk risk level */
  label(level: FileRiskLevel): string {
    const labels: Record<FileRiskLevel, string> = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      blocked: 'Blocked',
    };
    return labels[level];
  }
}
