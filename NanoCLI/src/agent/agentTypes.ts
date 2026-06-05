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
  /** Structured feedback untuk agent recovery (P2-05) */
  feedback?: ActionFeedback;
}

/**
 * Structured feedback untuk agent recovery.
 *
 * Ketika action gagal, feedback ini dikirim ke agent sebagai konteks terstruktur
 * agar agent dapat melakukan recovery yang tepat, bukan hanya menerima error string.
 *
 * P2-05: https://github.com/NanoKyuuun/Nano-CLI/issues/P2-05
 */
export interface ActionFeedback {
  actionType: string;
  status: 'success' | 'failed' | 'skipped';
  /** Error code yang dapat dipahami agent: PERMISSION_DENIED, FILE_NOT_FOUND, dll. */
  errorCode?: ActionErrorCode;
  message: string;
  /** Output stdout dari command (jika ada) */
  stdout?: string;
  /** Output stderr dari command (jika ada) */
  stderr?: string;
  /** Saran langkah berikutnya untuk recovery */
  suggestedNextStep?: string;
}

/**
 * Kode error standar yang dapat dipahami agent untuk recovery.
 * Agent prompt mendokumentasikan setiap kode dan recovery yang disarankan.
 */
export type ActionErrorCode =
  | 'PERMISSION_DENIED'      // Action ditolak oleh permission policy
  | 'WORKSPACE_BOUNDARY'     // cwd di luar project root
  | 'USER_REJECTED'          // User menolak approval
  | 'COMMAND_NOT_FOUND'      // Binary tidak tersedia di PATH
  | 'FILE_NOT_FOUND'         // File yang dibaca/di-patch tidak ada
  | 'FILE_WRITE_FAILED'      // Gagal tulis file (permission OS, disk penuh, dll.)
  | 'PATCH_PARSE_FAILED'     // Patch tidak valid sebagai unified diff
  | 'PATCH_APPLY_FAILED'     // Patch tidak cocok dengan isi file saat ini
  | 'TIMEOUT'                // Command melebihi timeout
  | 'COMMAND_FAILED'         // Command exit non-zero
  | 'UNKNOWN';               // Error tidak terklasifikasi


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
  /**
   * P2-01: Batch approval mode.
   *
   * Ketika true, agent mengumpulkan semua planned actions dari LLM
   * dan menampilkan plan preview lengkap SEBELUM mengeksekusi apapun.
   * User hanya perlu menyetujui satu kali untuk seluruh batch.
   *
   * Trade-off:
   * - Pro: tidak ada interrupt per-action, cocok untuk task yang sudah jelas
   * - Kontra: tidak bisa pause di tengah jika ada action yang bermasalah
   *
   * Default: false (per-action approval, lebih aman)
   */
  batchApprove?: boolean;
}

// ─── Tool Router Result ───────────────────────────────────────────────────────

export interface ParsedToolCall {
  valid: boolean;
  action?: AgentAction;
  rawJson?: string;
  error?: string;
}
