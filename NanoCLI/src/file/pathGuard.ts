/**
 * pathGuard.ts
 *
 * Memvalidasi bahwa path target aman untuk operasi file.
 * Melindungi:
 * - keluar dari project root (path traversal)
 * - direktori sistem (node_modules, .git, dist, build)
 * - file sensitif (via sensitiveFileBlocker)
 *
 * Single source of truth untuk path validation di FileOperationManager.
 */

import path from 'path';
import { isSensitiveFile } from '../files/sensitiveFileBlocker';

/** Direktori yang tidak boleh ditulis oleh agent. */
const PROTECTED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'out',
  '.turbo',
  '.cache',
];

export interface PathGuardResult {
  safe: boolean;
  reason?: string;
  /** Absolute path yang sudah dinormalisasi */
  absolutePath: string;
  /** Relative path dari project root */
  relativePath: string;
}

export class PathGuard {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Validasi path sebelum operasi file.
   * Mengembalikan { safe: false, reason } jika tidak aman.
   */
  validate(filePath: string): PathGuardResult {
    const absolutePath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.projectRoot, filePath);

    const relativePath = path.relative(this.projectRoot, absolutePath);

    // 1. Cek path traversal (keluar dari project root)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return {
        safe: false,
        reason: `Path di luar project root tidak diizinkan: ${filePath}`,
        absolutePath,
        relativePath,
      };
    }

    // 2. Cek protected directories
    const parts = relativePath.replace(/\\/g, '/').split('/');
    for (const protectedDir of PROTECTED_DIRS) {
      if (parts.includes(protectedDir)) {
        return {
          safe: false,
          reason: `Menulis ke direktori '${protectedDir}' tidak diizinkan.`,
          absolutePath,
          relativePath,
        };
      }
    }

    // 3. Cek sensitive files (dari sensitiveFileBlocker yang sudah ada)
    if (isSensitiveFile(absolutePath)) {
      return {
        safe: false,
        reason: `File sensitif tidak boleh dimodifikasi oleh agent: ${relativePath}`,
        absolutePath,
        relativePath,
      };
    }

    return { safe: true, absolutePath, relativePath };
  }

  /**
   * Validasi direktori — digunakan untuk mkdir.
   * Lebih permissive: tidak cek sensitive file.
   */
  validateDir(dirPath: string): PathGuardResult {
    const absolutePath = path.isAbsolute(dirPath)
      ? path.resolve(dirPath)
      : path.resolve(this.projectRoot, dirPath);

    const relativePath = path.relative(this.projectRoot, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return {
        safe: false,
        reason: `Direktori di luar project root tidak diizinkan: ${dirPath}`,
        absolutePath,
        relativePath,
      };
    }

    const parts = relativePath.replace(/\\/g, '/').split('/');
    for (const protectedDir of PROTECTED_DIRS) {
      if (parts[0] === protectedDir) {
        return {
          safe: false,
          reason: `Membuat direktori di dalam '${protectedDir}' tidak diizinkan.`,
          absolutePath,
          relativePath,
        };
      }
    }

    return { safe: true, absolutePath, relativePath };
  }
}
