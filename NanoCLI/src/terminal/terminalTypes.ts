/**
 * terminalTypes.ts
 *
 * TypeScript interfaces dan types untuk fitur Secure Terminal Bridge.
 * Semua komponen terminal dan security mengacu ke file ini.
 */

// ─── Shell Types ─────────────────────────────────────────────────────────────

export type ShellKind =
  | 'cmd'
  | 'powershell'
  | 'pwsh'
  | 'git-bash'
  | 'wsl'
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'sh'
  | 'unknown';

export type TerminalOS = 'windows' | 'linux' | 'darwin';

export type TerminalSessionStatus = 'running' | 'exited' | 'error';

export type PermissionLevel = 'read-only' | 'normal' | 'elevated';

// ─── Risk Types ──────────────────────────────────────────────────────────────

export type CommandRiskLevel = 'low' | 'medium' | 'high' | 'blocked';

// ─── Shell Profile ───────────────────────────────────────────────────────────

export interface ShellProfile {
  id: string;
  kind: ShellKind;
  name: string;
  command: string;
  args: string[];
  available: boolean;
  priority: number;
}

// ─── Terminal Session ────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string;
  name: string;
  shell: ShellProfile;
  cwd: string;
  os: TerminalOS;
  status: TerminalSessionStatus;
  permissionLevel: PermissionLevel;
  createdAt: number;
  lastActiveAt: number;
}

// ─── Command Proposals (dari model AI) ───────────────────────────────────────

export interface CommandProposal {
  type: 'terminal.propose';
  command: string;
  cwd?: string;
  session?: string;
  reason?: string;
  expectedImpact?: string;
  timeoutMs?: number;
}

export interface SSHCommandProposal {
  type: 'ssh.propose';
  profile: string;
  command: string;
  reason?: string;
  expectedImpact?: string;
  requireSudo?: boolean;
  timeoutMs?: number;
}

// ─── Risk Analysis Result ────────────────────────────────────────────────────

export interface CommandRiskResult {
  level: CommandRiskLevel;
  reasons: string[];
  matchedRules: string[];
  requiresExplicitApproval: boolean;
  blocked: boolean;
}

// ─── Execution Result ────────────────────────────────────────────────────────

export interface CommandExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Combined stdout + stderr, redacted and limited */
  output: string;
  durationMs: number;
  timedOut: boolean;
  /** true jika output mengandung secret yang sudah disamarkan */
  redacted: boolean;
}

// ─── Terminal Config ─────────────────────────────────────────────────────────

export interface TerminalConfig {
  enabled: boolean;
  defaultShell: string;
  requireApproval: boolean;
  allowLongRunning: boolean;
  maxOutputChars: number;
  maxOutputLines: number;
  redactSecrets: boolean;
  auditLog: boolean;
  riskPolicy: {
    low: 'confirm' | 'auto';
    medium: 'confirm';
    high: 'explicit-confirm';
    blocked: 'deny';
  };
}
