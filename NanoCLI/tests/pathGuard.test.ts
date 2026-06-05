/**
 * pathGuard.test.ts
 *
 * Unit tests untuk PathGuard — security layer yang memvalidasi
 * apakah path aman sebelum operasi file diizinkan.
 *
 * Coverage:
 *   - Path traversal (..)
 *   - Protected directories (node_modules, .git, dist, dll.)
 *   - Sensitive files (.env, credentials, dll.)
 *   - Valid paths
 *   - Absolute path handling
 *   - validateDir() untuk mkdir
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { PathGuard } from '../src/file/pathGuard';

// Gunakan path yang konsisten antar OS
const PROJECT_ROOT = path.resolve('/tmp/test-project');

describe('PathGuard.validate()', () => {
  const guard = new PathGuard(PROJECT_ROOT);

  // ── Valid paths ──────────────────────────────────────────────────────────

  it('mengizinkan file di root project', () => {
    const result = guard.validate('src/index.ts');
    expect(result.safe).toBe(true);
    // Windows menggunakan backslash — normalize untuk assert
    expect(result.relativePath.replace(/\\/g, '/')).toBe('src/index.ts');
  });

  it('mengizinkan file dengan path absolut di dalam project', () => {
    const result = guard.validate(path.join(PROJECT_ROOT, 'src', 'app.ts'));
    expect(result.safe).toBe(true);
  });

  it('mengizinkan file .nanocli/ (config dan database)', () => {
    const result = guard.validate('.nanocli/config.json');
    expect(result.safe).toBe(true);
  });

  it('mengembalikan absolutePath yang benar', () => {
    const result = guard.validate('src/utils.ts');
    expect(result.absolutePath).toBe(path.resolve(PROJECT_ROOT, 'src/utils.ts'));
  });

  // ── Path traversal ───────────────────────────────────────────────────────

  it('memblokir path traversal (../)', () => {
    const result = guard.validate('../outside/file.ts');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/di luar project root/i);
  });

  it('memblokir path traversal yang dalam (../../etc/passwd)', () => {
    const result = guard.validate('../../etc/passwd');
    expect(result.safe).toBe(false);
    expect(result.safe).toBe(false);
  });

  it('memblokir path absolut di luar project root', () => {
    const result = guard.validate('/etc/hosts');
    expect(result.safe).toBe(false);
  });

  // ── Protected directories ────────────────────────────────────────────────

  it('memblokir penulisan ke node_modules/', () => {
    const result = guard.validate('node_modules/lodash/index.js');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/node_modules/);
  });

  it('memblokir penulisan ke .git/', () => {
    const result = guard.validate('.git/config');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/\.git/);
  });

  it('memblokir penulisan ke dist/', () => {
    const result = guard.validate('dist/bundle.js');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/dist/);
  });

  it('memblokir penulisan ke build/', () => {
    const result = guard.validate('build/output.js');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/build/);
  });

  it('memblokir penulisan ke .next/', () => {
    const result = guard.validate('.next/server/app.js');
    expect(result.safe).toBe(false);
  });

  it('memblokir node_modules/ di subdirektori', () => {
    // node_modules nested juga harus diblokir
    const result = guard.validate('packages/app/node_modules/react/index.js');
    expect(result.safe).toBe(false);
  });

  // ── Sensitive files ──────────────────────────────────────────────────────

  it('memblokir .env file', () => {
    const result = guard.validate('.env');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/sensitif/i);
  });

  it('memblokir .env.production', () => {
    const result = guard.validate('.env.production');
    expect(result.safe).toBe(false);
  });

  it('.env.example diblokir — sensitiveFileBlocker konservatif terhadap semua .env.*', () => {
    // sensitiveFileBlocker memblokir semua file .env.* sebagai tindakan pencegahan.
    // Ini adalah keputusan desain yang sengaja — agent tidak boleh memodifikasi file .env apapun.
    const result = guard.validate('.env.example');
    expect(result.safe).toBe(false);
  });
});

describe('PathGuard.validateDir()', () => {
  const guard = new PathGuard(PROJECT_ROOT);

  it('mengizinkan pembuatan direktori valid', () => {
    const result = guard.validateDir('src/components');
    expect(result.safe).toBe(true);
  });

  it('memblokir direktori di luar project root', () => {
    const result = guard.validateDir('../outside');
    expect(result.safe).toBe(false);
  });

  it('memblokir pembuatan direktori di root protected dir', () => {
    const result = guard.validateDir('node_modules');
    expect(result.safe).toBe(false);
  });

  it('mengizinkan subdirektori dari non-protected dir', () => {
    // build/ di nested tidak diblokir validateDir (hanya level pertama)
    // karena parts[0] check berbeda dari validate()
    const result = guard.validateDir('src/build/output');
    expect(result.safe).toBe(true);
  });
});
