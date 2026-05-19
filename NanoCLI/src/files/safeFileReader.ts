import fs from 'fs-extra';
import path from 'path';
import { isSensitiveFile } from './sensitiveFileBlocker';

export interface SafeReadOptions {
  projectRoot: string;
  maxBytes?: number;
  allowOutsideProject?: boolean;
}

export interface SafeReadResult {
  absolutePath: string;
  relativePath: string;
  content: string;
  size: number;
  extension: string;
}

export async function safeReadTextFile(filePath: string, options: SafeReadOptions): Promise<SafeReadResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectRoot, filePath);

  const relativePath = path.relative(projectRoot, absolutePath);

  if (!options.allowOutsideProject && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
    throw new Error(`Akses file di luar project ditolak: ${filePath}`);
  }

  if (isSensitiveFile(absolutePath)) {
    throw new Error(`File sensitif ditolak: ${relativePath}`);
  }

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Path bukan file: ${filePath}`);
  }

  const maxBytes = options.maxBytes ?? 100_000;
  if (stat.size > maxBytes) {
    throw new Error(`File terlalu besar: ${(stat.size / 1024).toFixed(1)} KB. Maksimal ${(maxBytes / 1024).toFixed(1)} KB.`);
  }

  const buffer = await fs.readFile(absolutePath);
  if (buffer.includes(0)) {
    throw new Error(`File binary ditolak: ${relativePath}`);
  }

  return {
    absolutePath,
    relativePath,
    content: buffer.toString('utf-8'),
    size: stat.size,
    extension: path.extname(absolutePath).slice(1) || 'text'
  };
}
