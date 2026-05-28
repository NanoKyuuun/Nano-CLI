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
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
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
  /** Izin agent: workspace = hanya di project root, full = tidak ada batasan */
  permission: 'workspace' | 'full';
  /** Dry run: approve tampilkan proposal tapi tidak eksekusi */
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
