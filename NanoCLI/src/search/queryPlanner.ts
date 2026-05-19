import { QueryPlan, QueryPlannerInput } from './types';

const FRAMEWORK_DOMAIN_MAP: Record<string, string[]> = {
  'react':      ['react.dev', 'github.com/facebook/react'],
  'next':       ['nextjs.org', 'github.com/vercel/next.js'],
  'svelte':     ['svelte.dev', 'github.com/sveltejs/svelte'],
  'vite':       ['vite.dev', 'github.com/vitejs/vite'],
  'tailwind':   ['tailwindcss.com'],
  'prisma':     ['prisma.io', 'github.com/prisma/prisma'],
  'drizzle':    ['orm.drizzle.team', 'github.com/drizzle-team/drizzle-orm'],
  'typescript': ['typescriptlang.org'],
  'node':       ['nodejs.org'],
  'vue':        ['vuejs.org'],
  'nuxt':       ['nuxt.com'],
  'astro':      ['astro.build'],
  'hono':       ['hono.dev'],
};

const BASE_DOMAINS = ['github.com', 'stackoverflow.com', 'developer.mozilla.org'];

/**
 * Merencanakan query pencarian berdasarkan prompt dan konteks.
 * Menghasilkan query yang lebih terarah daripada mengirim prompt mentah.
 */
export function planSearchQuery(input: QueryPlannerInput): QueryPlan {
  const queries: string[] = [];
  const preferredDomains: string[] = [...BASE_DOMAINS];
  const promptLower = input.prompt.toLowerCase();

  // Deteksi framework dari prompt
  let detectedFramework: string | null = null;
  for (const [fw, domains] of Object.entries(FRAMEWORK_DOMAIN_MAP)) {
    if (promptLower.includes(fw)) {
      detectedFramework = fw;
      preferredDomains.unshift(...domains);
      break;
    }
  }

  if (input.errorMessage) {
    const cleanError = input.errorMessage.trim().slice(0, 100);
    if (detectedFramework) {
      queries.push(`${detectedFramework} "${cleanError}"`);
      queries.push(`${detectedFramework} ${cleanError} fix github issue`);
    } else {
      queries.push(`"${cleanError}" solution fix`);
      queries.push(`${cleanError} how to fix`);
    }
  } else {
    queries.push(input.prompt.slice(0, 120));
    if (detectedFramework) {
      queries.push(`${detectedFramework} ${input.prompt.slice(0, 80)} official docs`);
    }
  }

  return {
    queries: queries.slice(0, 3),
    preferredDomains: [...new Set(preferredDomains)].slice(0, 5),
    reason: detectedFramework
      ? `framework ${detectedFramework} terdeteksi`
      : 'query umum',
  };
}
