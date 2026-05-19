/**
 * Single source of truth untuk definisi mode NanoCLI.
 * Semua modul harus mengimport dari sini untuk menghindari mismatch.
 */

export const VALID_MODES = ['fast', 'normal', 'high', 'extra-high'] as const;
export type NanoMode = typeof VALID_MODES[number];

export interface ModelConfig {
  id: string;
  fallback: string[];
}

/**
 * Type guard untuk memvalidasi string sebagai NanoMode yang valid.
 */
export function isValidMode(mode: string): mode is NanoMode {
  return (VALID_MODES as readonly string[]).includes(mode);
}

/**
 * Normalisasi mode string ke NanoMode.
 * Mengembalikan 'normal' jika mode tidak valid.
 */
export function normalizeMode(mode: string): NanoMode {
  return isValidMode(mode) ? mode : 'normal';
}
