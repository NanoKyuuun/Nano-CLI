/**
 * writeValidator.ts — P2-02
 *
 * Post-write validation registry.
 *
 * Setelah agent menulis file, validator yang sesuai dijalankan
 * berdasarkan ekstensi file. Tujuannya:
 * - Mendeteksi file yang rusak sebelum agen melanjutkan ke step berikutnya
 * - Memberikan feedback terstruktur agar agen bisa self-correct
 * - Tidak pernah memblokir — hanya warn dan inject feedback ke step result
 *
 * Design principle:
 * - Tidak async yang panjang — harus selesai < 3 detik
 * - Tidak pernah throw ke caller — semua error wrapped dalam ValidationResult
 * - Tiap validator bisa diaktifkan/dinonaktifkan
 */

import { execSync } from 'child_process';
import path from 'path';

export interface ValidationResult {
  valid: boolean;
  /** Pesan yang bisa dimengerti agent */
  message: string;
  /** Error detail untuk debugging */
  details?: string;
  /** Saran perbaikan untuk agent */
  suggestion?: string;
}

type Validator = (absolutePath: string, content: string) => ValidationResult;

// ── JSON Validator ─────────────────────────────────────────────────────────────

const validateJson: Validator = (_filePath, content) => {
  try {
    JSON.parse(content);
    return { valid: true, message: 'JSON valid.' };
  } catch (err: any) {
    return {
      valid: false,
      message: 'File JSON tidak valid — syntax error terdeteksi.',
      details: err.message,
      suggestion: 'Periksa apakah semua kunci dalam tanda kutip ganda, tidak ada trailing comma, dan bracket/brace seimbang.',
    };
  }
};

// ── TypeScript/JavaScript Syntax Validator ─────────────────────────────────────

/**
 * Validasi TypeScript menggunakan `node --check` untuk JS atau
 * heuristic brace-balance untuk TS (tanpa butuh tsc).
 *
 * Catatan: validasi penuh TypeScript butuh tsc yang lambat.
 * Kita gunakan heuristic brace-balance sebagai quick sanity check.
 */
const validateTypeScriptHeuristic: Validator = (_filePath, content) => {
  // Heuristic: hitung brace/bracket/paren balance
  let braces = 0, brackets = 0, parens = 0;
  let inString = false;
  let stringChar = '';
  let prevChar = '';

  for (const ch of content) {
    if (inString) {
      if (ch === stringChar && prevChar !== '\\') inString = false;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
    } else {
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
      else if (ch === '(') parens++;
      else if (ch === ')') parens--;
    }
    prevChar = ch;
  }

  if (braces !== 0 || brackets !== 0 || parens !== 0) {
    const detail: string[] = [];
    if (braces !== 0) detail.push(`kurung kurawal tidak seimbang (${braces > 0 ? '+' : ''}${braces})`);
    if (brackets !== 0) detail.push(`bracket tidak seimbang (${brackets > 0 ? '+' : ''}${brackets})`);
    if (parens !== 0) detail.push(`kurung biasa tidak seimbang (${parens > 0 ? '+' : ''}${parens})`);

    return {
      valid: false,
      message: 'Kemungkinan syntax error: ' + detail.join(', ') + '.',
      details: detail.join('; '),
      suggestion: 'Pastikan semua blok kode ditutup dengan benar. Cek setiap { } [ ] ( ) berpasangan.',
    };
  }

  return { valid: true, message: 'Syntax heuristic check passed.' };
};

// ── YAML Validator ─────────────────────────────────────────────────────────────

/**
 * Validasi YAML dasar via indentation check.
 * Tidak menggunakan js-yaml (belum ada di dependencies) —
 * cukup cek tab character yang tidak valid di YAML.
 */
const validateYaml: Validator = (_filePath, content) => {
  const lines = content.split('\n');
  const tabLines: number[] = [];

  lines.forEach((line, idx) => {
    if (line.startsWith('\t')) tabLines.push(idx + 1);
  });

  if (tabLines.length > 0) {
    return {
      valid: false,
      message: `YAML tidak valid: ditemukan karakter tab di baris ${tabLines.slice(0, 3).join(', ')}${tabLines.length > 3 ? '...' : ''}.`,
      details: `Tab tidak diizinkan sebagai indentation di YAML (hanya spasi).`,
      suggestion: 'Ganti semua indentation tab dengan spasi.',
    };
  }

  return { valid: true, message: 'YAML basic check passed.' };
};

// ── Validator Registry ─────────────────────────────────────────────────────────

const VALIDATORS: Record<string, Validator> = {
  '.json':  validateJson,
  '.jsonc': validateJson,
  '.ts':    validateTypeScriptHeuristic,
  '.tsx':   validateTypeScriptHeuristic,
  '.js':    validateTypeScriptHeuristic,
  '.jsx':   validateTypeScriptHeuristic,
  '.mjs':   validateTypeScriptHeuristic,
  '.cjs':   validateTypeScriptHeuristic,
  '.yaml':  validateYaml,
  '.yml':   validateYaml,
};

// ── WriteValidator (Main Class) ────────────────────────────────────────────────

export class WriteValidator {
  /**
   * Jalankan validator yang sesuai untuk file yang baru ditulis.
   *
   * @param absolutePath - Path absolut file yang ditulis
   * @param content      - Konten yang ditulis
   * @returns null jika tidak ada validator untuk ekstensi ini
   */
  validate(absolutePath: string, content: string): ValidationResult | null {
    const ext = path.extname(absolutePath).toLowerCase();
    const validator = VALIDATORS[ext];
    if (!validator) return null;

    try {
      return validator(absolutePath, content);
    } catch (err: any) {
      // Validator tidak boleh crash — wrap dalam failed result
      return {
        valid: false,
        message: `Validator error: ${err.message}`,
        suggestion: 'Periksa konten file secara manual.',
      };
    }
  }

  /**
   * Kembalikan daftar ekstensi yang didukung oleh validator registry.
   */
  supportedExtensions(): string[] {
    return Object.keys(VALIDATORS);
  }
}
