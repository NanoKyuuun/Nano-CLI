import { SearchDecision, SearchDecisionInput } from './types';

const FRESHNESS_KEYWORDS = [
  'latest', 'terbaru', 'versi terbaru', '2026', '2025',
  'breaking change', 'deprecated', 'release notes', 'changelog',
  'newest', 'current version', 'update terbaru',
];

const ERROR_SIGNALS = [
  'error', 'exception', 'failed', 'cannot find module',
  'typeerror', 'referenceerror', 'build failed', 'not found',
  'undefined is not', 'is not a function', 'cannot read',
  'enoent', 'eacces', 'crash', 'stack trace',
];

const FRAMEWORK_SIGNALS = [
  'next.js', 'nextjs', 'react', 'svelte', 'vite', 'tailwind',
  'drizzle', 'prisma', 'node', 'typescript', 'webpack', 'bun',
  'deno', 'hono', 'astro', 'nuxt', 'vue', 'angular', 'rollup',
];

/**
 * Menentukan apakah web search diperlukan berdasarkan prompt dan mode.
 * Ini adalah komponen kunci dari search auto mode.
 */
export function shouldSearch(input: SearchDecisionInput): SearchDecision {
  const text = input.prompt.toLowerCase();

  if (input.mode === 'off') return { search: false, reason: 'search dinonaktifkan' };
  if (input.mode === 'on')  return { search: true,  reason: 'search dipaksakan aktif' };
  if (input.mode === 'deep') return { search: true,  reason: 'deep search mode' };

  // Auto mode — analisis konten prompt
  const needsFreshness   = FRESHNESS_KEYWORDS.some(k => text.includes(k));
  const likelyError      = ERROR_SIGNALS.some(k => text.includes(k));
  const mentionsFramework = FRAMEWORK_SIGNALS.some(k => text.includes(k));
  const hasErrorMessage  = input.hasErrorMessage ?? false;

  if (needsFreshness) {
    return { search: true, reason: 'pertanyaan membutuhkan informasi terbaru' };
  }

  if ((likelyError || hasErrorMessage) && mentionsFramework) {
    return { search: true, reason: 'error teknis framework — butuh referensi dokumentasi terbaru' };
  }

  if (likelyError && hasErrorMessage) {
    return { search: true, reason: 'pesan error membutuhkan referensi web' };
  }

  return { search: false, reason: 'pengetahuan model sudah cukup' };
}
