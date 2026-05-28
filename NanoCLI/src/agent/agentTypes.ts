/**
 * agentTypes.ts
 *
 * Type definitions untuk semua komponen AgentLoop.
 * Semua file di src/agent/ mengacu ke file ini.
 */

// ─── Action Types ─────────────────────────────────────────────────────────────

export interface TerminalRunAction {
  type: 'terminal.run';
  command: string;
  cwd?: string;
  reason: string;
}

export interface FileWriteAgentAction {
  type: 'file.write';
  path: string;
  content: string;
  mode: 'create' | 'overwrite' | 'append';
  reason: string;
}

export interface FilePatchAgentAction {
  type: 'file.patch';
  path: string;
  patch: string;
  reason: string;
}

export interface FileReadAgentAction {
  type: 'file.read';
  path: string;
  reason?: string;
}

export interface FinalAnswerAction {
  type: 'final';
  summary: string;
  filesChanged?: string[];
  commandsRun?: string[];
  nextSteps?: string[];
}

export type AgentAction =
  | TerminalRunAction
  | FileWriteAgentAction
  | FilePatchAgentAction
  | FileReadAgentAction
  | FinalAnswerAction;

// ─── Message Types ────────────────────────────────────────────────────────────

/**
 * Role internal agent — mencakup 'tool' untuk menyimpan hasil eksekusi tool.
 * JANGAN kirim type ini langsung ke OpenRouter API.
 * Gunakan normalizeMessagesForLLM() di agentLoop.ts untuk mengkonversi terlebih dahulu.
 */
export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Pesan internal agent — dipakai untuk AgentState.messages.
 * Dapat berisi role 'tool' yang HARUS dinormalisasi sebelum dikirim ke LLM.
 */
export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface AgentStep {
  stepIndex: number;
  action: AgentAction;
  result: AgentStepResult;
  timestamp: number;
}

export interface AgentStepResult {
  success: boolean;
  output: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface AgentState {
  task: string;
  /** Pesan internal — gunakan normalizeMessagesForLLM() sebelum dikirim ke model */
  messages: AgentMessage[];
  steps: AgentStep[];
  filesChanged: string[];
  commandsRun: string[];
  startedAt: number;
  status: 'running' | 'completed' | 'max_step_reached' | 'error';
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  maxSteps: number;
  mode: string;
  modelId?: string;
  /**
   * Izin agent:
   * - 'readonly'  → hanya read, search, inspect. Tidak boleh write/run command.
   * - 'workspace' → write dan run command hanya di project root (default).
   * - 'full'      → akses luar workspace, wajib approval eksplisit per action.
   */
  permission: 'readonly' | 'workspace' | 'full';
  /** Dry run: tampilkan proposal tapi tidak eksekusi */
  dryRun: boolean;
  /** Tampilkan output verbose setiap step */
  verbose: boolean;
}

// ─── Tool Router Result ───────────────────────────────────────────────────────

export interface ParsedToolCall {
  valid: boolean;
  action?: AgentAction;
  rawJson?: string;
  error?: string;
}
