import { getEncoding, encodingForModel, TiktokenModel } from 'js-tiktoken';
import { Message } from '../llm/openrouterClient';

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  budget: number;
  remaining: number;
  percentUsed: number;
}

export class TokenBudgetManager {
  private encoding;

  constructor() {
    // Gunakan cl100k_base sebagai standar universal untuk estimasi
    this.encoding = getEncoding('cl100k_base');
  }

  /**
   * Menghitung jumlah token dari sebuah string teks.
   */
  countTextTokens(text: string): number {
    return this.encoding.encode(text).length;
  }

  /**
   * Menghitung jumlah token dari daftar pesan (Chat format).
   * Menambahkan overhead token sesuai standar OpenAI (3-4 token per pesan).
   */
  countMessageTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // Overhead per pesan
      total += this.countTextTokens(msg.content);
      total += this.countTextTokens(msg.role);
    }
    total += 3; // Overhead akhir untuk respon assistant
    return total;
  }

  /**
   * Mengestimasi biaya request dalam USD.
   *
   * Harga dari OpenRouter adalah per-million-token (bukan per-token).
   * Return null jika pricing tidak diketahui atau tidak valid:
   *   - Sentinel "-1" = routed/variable pricing (biaya tidak fix)
   *   - NaN, Infinity, nilai negatif = data pricing cacat
   *
   * Caller wajib handle null — jangan tampilkan angka jika biaya tidak diketahui.
   */
  estimateCost(
    inputTokens: number,
    pricing: { prompt: string; completion: string },
    expectedOutputTokens: number = 1000,
  ): number | null {
    // Sentinel -1 = model ini memakai variable/routed pricing
    if (pricing.prompt === '-1' || pricing.completion === '-1') return null;

    const promptPerMillion     = Number.parseFloat(pricing.prompt);
    const completionPerMillion = Number.parseFloat(pricing.completion);

    // Guard: NaN, Infinity, nilai negatif
    if (!Number.isFinite(promptPerMillion) || !Number.isFinite(completionPerMillion)) return null;
    if (promptPerMillion < 0 || completionPerMillion < 0) return null;

    // Harga adalah per-million-token — bagi dulu sebelum kalikan
    const promptCost     = (inputTokens / 1_000_000) * promptPerMillion;
    const completionCost = (expectedOutputTokens / 1_000_000) * completionPerMillion;

    return promptCost + completionCost;
  }

  /**
   * Mendapatkan budget token berdasarkan mode (sesuai PRD Bagian 12.5).
   * Digunakan sebagai fallback ketika context_length model tidak diketahui.
   */
  getBudgetForMode(mode: string): number {
    const budgets: Record<string, number> = {
      'fast': 4_000,
      'normal': 8_000,
      'high': 16_000,
      'extra-high': 32_000
    };
    return budgets[mode] ?? 8_000;
  }

  /**
   * Mendapatkan budget token yang mempertimbangkan context_length model aktual.
   *
   * Strategi:
   * - Gunakan 80% dari context window model sebagai budget maksimum.
   * - Mode berperan sebagai cap atas (tidak melebihi batasan mode).
   * - Selalu sediakan minimal 20% untuk output model.
   *
   * Contoh:
   * - gemini-1.5-pro (1M ctx) + mode normal (8K cap) → 8K
   * - claude-3-sonnet (200K ctx) + mode extra-high (32K cap) → 32K
   * - llama-3-8b (8K ctx) + mode normal (8K cap) → 6.4K (80% dari 8K)
   */
  getBudgetForModel(contextLength: number, mode: string): number {
    const modeCap = this.getBudgetForMode(mode);
    // 80% dari context window untuk input, sisakan 20% untuk output
    const modelSafeBudget = Math.floor(contextLength * 0.8);
    return Math.min(modeCap, modelSafeBudget);
  }

  /**
   * Mendapatkan statistik penggunaan token saat ini.
   */
  getStats(messages: Message[], mode: string): TokenStats {
    const inputTokens = this.countMessageTokens(messages);
    const budget = this.getBudgetForMode(mode);
    const remaining = Math.max(0, budget - inputTokens);
    const percentUsed = (inputTokens / budget) * 100;

    return {
      inputTokens,
      outputTokens: 0, // Akan diisi setelah respon diterima
      budget,
      remaining,
      percentUsed
    };
  }

  /**
   * Mengecek apakah jumlah token melebihi budget.
   */
  isOverBudget(messages: Message[], mode: string): boolean {
    return this.countMessageTokens(messages) > this.getBudgetForMode(mode);
  }

  /**
   * Menghitung persentase penghematan (Token Saving).
   * Formula: ((baseline - actual) / baseline) * 100
   */
  calculateSaving(baseline: number, actual: number): number {
    if (baseline === 0) return 0;
    return ((baseline - actual) / baseline) * 100;
  }
}
