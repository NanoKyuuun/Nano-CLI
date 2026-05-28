/** Shared types untuk komunikasi NanoCLI ↔ Home Server RAG API. */

export type RemoteMemoryEntryType =
  | 'bug'
  | 'decision'
  | 'solution'
  | 'todo'
  | 'style'
  | 'dependency'
  | 'preference'
  | 'web';

/** Request body untuk POST /ingest/memory-entry */
export interface RemoteMemoryEntryPayload {
  type: RemoteMemoryEntryType;
  content: string;
  source_file?: string;
  project_name?: string;
  metadata?: Record<string, unknown>;
}

/** Request body untuk POST /ingest/conversation-turn */
export interface RemoteConversationTurnPayload {
  session_id: string;
  project_name?: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}

/** Request body untuk POST /search */
export interface RemoteSearchPayload {
  query: string;
  project_name?: string;
  limit?: number;
  include_conversations?: boolean;
  include_memory?: boolean;
  /** Minimum cosine similarity threshold (0–1). Default di server: 0.3 */
  min_similarity?: number;
}

/** Satu item hasil search dari home server */
export interface RemoteSearchResultItem {
  id: number;
  source: 'memory' | 'conversation';
  type?: string;
  content: string;
  source_file?: string;
  project_name?: string;
  similarity: number;
  created_at: string;
}

/** Response dari POST /search */
export interface RemoteSearchResponse {
  query: string;
  results: RemoteSearchResultItem[];
  total: number;
  used_embedding: boolean;
}

/** Response dari POST /ingest/* */
export interface RemoteIngestResponse {
  id: number;
  embedded: boolean;
}

/** Response dari GET /health */
export interface RemoteHealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  ollama: boolean;
  embed_model: string;
}

/** Request body untuk POST /ingest/feedback */
export interface RemoteFeedbackPayload {
  session_id: string;
  response_preview: string;  // 200 char pertama dari response AI
  rating: 1 | -1 | 0;       // 1=good, -1=bad, 0=skip
  prompt_preview?: string;   // 100 char pertama dari prompt user
  model_id?: string;         // model yang menghasilkan response
  project_name?: string;
}

/**
 * Telemetry event untuk Share mode.
 * TIDAK mengandung konten apapun — hanya metadata statistik.
 * Digunakan untuk mengembangkan NanoCLI, bukan untuk RAG.
 */
export interface TelemetryEvent {
  /** Jenis event yang terjadi */
  event: 'chat_response' | 'feedback' | 'command' | 'error' | 'session_start' | 'session_end';
  /** Model yang dipakai (hanya ID, bukan konten) */
  model_id?: string;
  /** Mode NanoCLI yang aktif (normal, high, extra-high, dll) */
  nano_mode?: string;
  /** Rentang token (bukan jumlah pasti — hanya range) */
  token_range?: '0-4k' | '4k-8k' | '8k-32k' | '32k+';
  /** Estimasi durasi response dalam ms */
  response_time_ms?: number;
  /** Rating feedback: 1=good, -1=bad, 0=skip */
  rating?: 1 | -1 | 0;
  /** Nama command yang dijalankan (ask, review, debug, dll) */
  command?: string;
  /** Kategori error (bukan stack trace) */
  error_type?: string;
  /** Versi NanoCLI CLI */
  cli_version?: string;
}

/** Feedback per model dari v_feedback_summary view */
export interface FeedbackModelStats {
  model_id: string;
  total: number;
  good: number;
  bad: number;
  neutral: number;
  good_pct: number;
}

/** Command usage dari v_command_usage view */
export interface CommandUsageStats {
  command: string;
  total: number;
  pct: number;
}

/** Response dari GET /stats */
export interface RemoteStatsResponse {
  total_events: number;
  total_feedback: number;
  feedback_good: number;
  feedback_bad: number;
  feedback_neutral: number;
  avg_response_ms: number | null;
  total_memory_entries: number;
  total_conversation_turns: number;
  total_sessions: number;
  feedback_by_model: FeedbackModelStats[];
  top_commands: CommandUsageStats[];
  data_since: string | null;
}
