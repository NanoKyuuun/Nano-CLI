/**
 * commandRiskAnalyzer.ts
 *
 * Mengklasifikasi risiko command terminal menjadi 4 level:
 * - blocked: terlalu berbahaya, ditolak otomatis
 * - high: bisa merusak data/service, perlu explicit approval
 * - medium: mengubah project/deps, perlu confirm
 * - low: read-only / risiko rendah
 *
 * Rules diurutkan dari paling berbahaya ke paling aman.
 * Evaluasi berhenti pada match pertama (early return).
 */

import { CommandRiskResult } from '../terminal/terminalTypes';

// ─── Pattern Definitions ─────────────────────────────────────────────────────

const BLOCKED_PATTERNS: Array<[RegExp, string]> = [
  [/\b(cat|type|get-content|less|more|head|tail)\s+.*\.env\b/i, 'Mencoba membaca file .env'],
  [/\b(cat|type|get-content|less|more)\s+.*(\.ssh\/id_|id_rsa|id_ed25519)/i, 'Mencoba membaca SSH private key'],
  [/\b(printenv|env|set)\b(?!\s+\S+=)/i, 'Mencoba menampilkan semua environment variable'],
  [/\bget-childitem\s+env:/i, 'Mencoba menampilkan environment variable (PowerShell)'],
  [/\b(curl|wget|irm|iwr|fetch).*(\||;)\s*(sh|bash|iex|python)\b/i, 'Remote script piping — risiko tinggi'],
  [/\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/i, 'Menghapus root filesystem'],
  [/\bmkfs\b/i, 'Format filesystem — operasi destruktif'],
  [/\bdd\s+if=/i, 'Operasi disk-level langsung'],
  [/:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/i, 'Fork bomb detected'],
  [/\bchmod\s+777\s+\//i, 'Mengubah permission root directory'],
];

const HIGH_PATTERNS: Array<[RegExp, string]> = [
  [/\bsudo\b/i, 'Menggunakan privilege escalation (sudo)'],
  [/\bsu\s/i, 'Switch user — privilege escalation'],
  [/\brm\s+-[a-zA-Z]*r/i, 'Penghapusan rekursif'],
  [/\bchmod\b/i, 'Mengubah file permission'],
  [/\bchown\b/i, 'Mengubah file owner'],
  [/\bsystemctl\s+(restart|stop|start|enable|disable)\b/i, 'Mengubah system service'],
  [/\bservice\s+\S+\s+(restart|stop|start)\b/i, 'Mengubah system service'],
  [/\bgit\s+reset\s+--hard\b/i, 'Reset Git destruktif — data bisa hilang'],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/i, 'Menghapus untracked files Git'],
  [/\bgit\s+push\s+.*--force/i, 'Force push Git — bisa timpa history remote'],
  [/\bdocker\s+(compose\s+)?down\b/i, 'Menghentikan container'],
  [/\bdocker\s+rm\b/i, 'Menghapus container'],
  [/\bdocker\s+rmi\b/i, 'Menghapus image'],
  [/\bkubectl\s+(apply|delete|replace|scale)\b/i, 'Mengubah resource Kubernetes'],
  [/\bterraform\s+(apply|destroy)\b/i, 'Mengubah infrastructure'],
  [/\bscp\b/i, 'Transfer file via SSH'],
  [/\brsync\s+.*--delete\b/i, 'Rsync dengan delete — bisa hapus file remote'],
  [/\bdrop\s+(table|database|schema)\b/i, 'SQL DROP — operasi destruktif'],
  [/\btruncate\s+table\b/i, 'SQL TRUNCATE — hapus semua data'],
];

const MEDIUM_PATTERNS: Array<[RegExp, string]> = [
  [/\b(npm|pnpm|yarn|bun)\s+install\b/i, 'Mengubah dependency project'],
  [/\b(npm|pnpm|yarn|bun)\s+add\b/i, 'Menambah dependency baru'],
  [/\b(npm|pnpm|yarn|bun)\s+(run|exec)\b/i, 'Menjalankan script project'],
  [/\bgit\s+pull\b/i, 'Mengubah working tree dari remote'],
  [/\bgit\s+fetch\b/i, 'Fetch data dari remote'],
  [/\bgit\s+merge\b/i, 'Merge branch — bisa conflict'],
  [/\bgit\s+rebase\b/i, 'Rebase — mengubah history lokal'],
  [/\bgit\s+checkout\b/i, 'Checkout — mengubah working tree'],
  [/\bgit\s+switch\b/i, 'Switch branch'],
  [/\bdocker\s+(compose\s+)?up\b/i, 'Menjalankan container'],
  [/\bdocker\s+build\b/i, 'Build Docker image'],
  [/\bnpx\b/i, 'Menjalankan package tanpa install eksplisit'],
  [/\bmkdir\b/i, 'Membuat directory baru'],
  [/\btouch\b/i, 'Membuat file baru'],
  [/\bcp\b/i, 'Menyalin file/directory'],
  [/\bmv\b/i, 'Memindahkan/rename file'],
];

// ─── Analyzer Class ──────────────────────────────────────────────────────────

export class CommandRiskAnalyzer {
  /**
   * Analisis command dan kembalikan risk result.
   * Evaluasi dari paling berbahaya → paling aman.
   */
  analyze(command: string): CommandRiskResult {
    const reasons: string[] = [];
    const matchedRules: string[] = [];

    // ── Check BLOCKED ──────────────────────────────────────
    for (const [regex, reason] of BLOCKED_PATTERNS) {
      if (regex.test(command)) {
        reasons.push(reason);
        matchedRules.push(regex.source);
      }
    }

    if (reasons.length > 0) {
      return {
        level: 'blocked',
        reasons,
        matchedRules,
        requiresExplicitApproval: true,
        blocked: true
      };
    }

    // ── Check HIGH ─────────────────────────────────────────
    for (const [regex, reason] of HIGH_PATTERNS) {
      if (regex.test(command)) {
        reasons.push(reason);
        matchedRules.push(regex.source);
      }
    }

    if (reasons.length > 0) {
      return {
        level: 'high',
        reasons,
        matchedRules,
        requiresExplicitApproval: true,
        blocked: false
      };
    }

    // ── Check MEDIUM ───────────────────────────────────────
    for (const [regex, reason] of MEDIUM_PATTERNS) {
      if (regex.test(command)) {
        reasons.push(reason);
        matchedRules.push(regex.source);
      }
    }

    if (reasons.length > 0) {
      return {
        level: 'medium',
        reasons,
        matchedRules,
        requiresExplicitApproval: false,
        blocked: false
      };
    }

    // ── LOW ─────────────────────────────────────────────────
    return {
      level: 'low',
      reasons: ['Command tampak read-only atau risiko rendah'],
      matchedRules: [],
      requiresExplicitApproval: false,
      blocked: false
    };
  }
}
