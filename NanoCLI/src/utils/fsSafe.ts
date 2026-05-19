import path from 'path';
import { isSensitiveFile as _isSensitiveFile } from '../files/sensitiveFileBlocker';

/**
 * Memeriksa apakah targetPath berada di dalam projectRoot.
 * Mencegah path traversal (../../ dll).
 */
export function isInsideProject(projectRoot: string, targetPath: string): boolean {
  const relative = path.relative(projectRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Memeriksa apakah file adalah file rahasia/credential yang tidak boleh dikirim ke AI.
 *
 * @deprecated Import isSensitiveFile dari '../files/sensitiveFileBlocker' secara langsung.
 * Fungsi ini tetap ada sebagai backwards-compatible wrapper agar tidak merusak import
 * yang sudah ada di chatUI.ts dan promptBuilder.ts.
 */
export function isSecretFile(filePath: string): boolean {
  return _isSensitiveFile(filePath);
}
