/**
 * Tipe-tipe inti untuk sistem Web Search NanoCLI.
 */

export type SearchMode = 'off' | 'auto' | 'on' | 'deep';

export type SearchProviderName = 'openrouter' | 'tavily' | 'brave' | 'none';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
}

export interface SearchDecisionInput {
  prompt: string;
  mode: SearchMode;
  hasErrorMessage?: boolean;
}

export interface SearchDecision {
  search: boolean;
  reason: string;
}

export interface QueryPlan {
  queries: string[];
  preferredDomains: string[];
  reason: string;
}

export interface QueryPlannerInput {
  prompt: string;
  errorMessage?: string;
  fileExtension?: string;
}
