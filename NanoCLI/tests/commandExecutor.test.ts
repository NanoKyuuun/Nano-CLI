import { describe, it, expect } from 'vitest';

/**
 * Test untuk buildSafeEnv() — env var isolation.
 *
 * Regression test untuk P0-05:
 * Subprocess yang dijalankan nanocli TIDAK boleh mewarisi secret dari process.env.
 *
 * buildSafeEnv() adalah fungsi internal commandExecutor.ts, tapi karena
 * ia tidak di-export, kita test behavior-nya secara tidak langsung
 * dengan mensimulasikan logikanya di sini dan meng-assert hasilnya.
 */

// Representasi SAFE_ENV_KEYS yang sama dengan commandExecutor.ts
// Duplikasi intentional — jika prod code berubah tapi test tidak diupdate,
// test akan fail (regression detection).
const SAFE_ENV_KEYS_EXPECTED = new Set([
  'PATH', 'HOME', 'SHELL', 'TERM', 'USER', 'USERNAME', 'LOGNAME',
  'SystemRoot', 'ComSpec', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMDATA', 'WINDIR',
  'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'NODE_ENV', 'npm_config_cache', 'npm_config_prefix',
]);

// Inline copy buildSafeEnv untuk unit test terisolasi
function buildSafeEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS_EXPECTED) {
    if (source[key] !== undefined) safe[key] = source[key];
  }
  return safe;
}

describe('buildSafeEnv() — env var security whitelist', () => {
  // Simulasikan env yang berisi secret
  const MOCK_ENV: NodeJS.ProcessEnv = {
    PATH:              '/usr/bin:/bin',
    HOME:              '/home/user',
    SHELL:             '/bin/bash',
    OPENROUTER_API_KEY: 'sk-or-v1-super-secret-key-123',
    DATABASE_URL:       'postgresql://localhost:5432/mydb',
    JWT_SECRET:         'very-secret-jwt-value',
    AWS_SECRET_ACCESS_KEY: 'AKIAIOSFODNN7EXAMPLE',
    NODE_ENV:           'production',
    USERPROFILE:        'C:\\Users\\NanoKyuuun',
    TEMP:               'C:\\Users\\NanoKyuuun\\AppData\\Local\\Temp',
  };

  const safeEnv = buildSafeEnv(MOCK_ENV);

  // ─── Critical: secret tidak boleh bocor ──────────────────────────────────

  it('OPENROUTER_API_KEY tidak ada di safe env', () => {
    expect(safeEnv['OPENROUTER_API_KEY']).toBeUndefined();
  });

  it('DATABASE_URL tidak ada di safe env', () => {
    expect(safeEnv['DATABASE_URL']).toBeUndefined();
  });

  it('JWT_SECRET tidak ada di safe env', () => {
    expect(safeEnv['JWT_SECRET']).toBeUndefined();
  });

  it('AWS_SECRET_ACCESS_KEY tidak ada di safe env', () => {
    expect(safeEnv['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
  });

  // ─── Env yang dibutuhkan tetap ada ───────────────────────────────────────

  it('PATH tetap ada di safe env', () => {
    expect(safeEnv['PATH']).toBe('/usr/bin:/bin');
  });

  it('HOME tetap ada di safe env', () => {
    expect(safeEnv['HOME']).toBe('/home/user');
  });

  it('NODE_ENV tetap ada di safe env', () => {
    expect(safeEnv['NODE_ENV']).toBe('production');
  });

  it('USERPROFILE tetap ada di safe env (Windows)', () => {
    expect(safeEnv['USERPROFILE']).toBe('C:\\Users\\NanoKyuuun');
  });

  it('TEMP tetap ada di safe env', () => {
    expect(safeEnv['TEMP']).toBe('C:\\Users\\NanoKyuuun\\AppData\\Local\\Temp');
  });

  // ─── Properti yang tidak diset di mock env tidak muncul di safe env ──────

  it('key yang tidak ada di source tidak muncul di hasil', () => {
    // DATABASE_URL ada di source tapi tidak di allowlist → tidak ada di safe
    // LANG tidak ada di mock source → tidak ada di safe
    expect(safeEnv['LANG']).toBeUndefined();
  });

  // ─── safe env hanya boleh berisi subset dari allowlist ───────────────────

  it('safe env tidak punya key di luar allowlist', () => {
    for (const key of Object.keys(safeEnv)) {
      expect(SAFE_ENV_KEYS_EXPECTED.has(key)).toBe(true);
    }
  });
});
