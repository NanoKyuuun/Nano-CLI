import path from 'path';

/**
 * Exact filename blocklist — case-insensitive match against the file's basename.
 */
const SENSITIVE_EXACT_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
  '.env.test',
  '.credentials.json',
  'credentials.json',
  'id_rsa',
  'id_rsa.pub',
  'id_ed25519',
  'id_ed25519.pub',
  'id_ecdsa',
  'id_ecdsa.pub',
  '.npmrc',
  '.netrc',
  'secrets.json',
  'secret.json',
  'private.key',
  'private.pem',
  'service-account.json',
]);

/**
 * Regex patterns matched against the file's basename.
 */
const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /secret/i,
  /credential/i,
  /password/i,
  /passwd/i,
  /private/i,
  /token/i,
  /apikey/i,
  /api_key/i,
];

/**
 * File extensions that are inherently sensitive.
 */
const SENSITIVE_EXTENSIONS = new Set([
  '.pem',
  '.key',
  '.crt',
  '.p12',
  '.pfx',
  '.sqlite',
  '.db',
  '.sql',
  '.dump',
  '.bak',
]);

/**
 * Path segments (normalized to forward slash, lowercase) that indicate
 * sensitive directories.
 */
const SENSITIVE_PATH_SEGMENTS = [
  '/.ssh/',
  '/.aws/',
  '/.config/gcloud/',
  '/secrets/',
];

/**
 * Unified file sensitivity check — single source of truth for NanoCLI.
 *
 * Returns true if the file should be considered sensitive/secret and
 * must NEVER be read or forwarded to an AI model.
 *
 * This replaces the old dual-system (sensitiveFileBlocker + fsSafe.isSecretFile).
 * All future additions should be made here only.
 */
export function isSensitiveFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(filePath);
  const baseLower = base.toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // 1. Exact filename match (case-insensitive)
  if (SENSITIVE_EXACT_NAMES.has(baseLower)) return true;

  // 2. Extension match
  if (SENSITIVE_EXTENSIONS.has(ext)) return true;

  // 3. Basename pattern match
  if (SENSITIVE_BASENAME_PATTERNS.some(p => p.test(base))) return true;

  // 4. Sensitive directory path segment match
  if (SENSITIVE_PATH_SEGMENTS.some(seg => normalized.includes(seg))) return true;

  return false;
}
