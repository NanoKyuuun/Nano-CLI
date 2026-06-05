import fs from 'fs-extra';
import path from 'path';

export interface TokenUsageRecord {
  timestamp: number;
  modelId: string;
  mode: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GlobalStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  history: TokenUsageRecord[];
}

export class StatsManager {
  private statsPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.statsPath = path.join(projectRoot, '.nanocli', 'memory', 'token_stats.json');
  }

  async getStats(): Promise<GlobalStats> {
    if (await fs.pathExists(this.statsPath)) {
      const raw = await fs.readJson(this.statsPath) as GlobalStats;
      // P0-09 / P1-09: Clamp akumulasi korup saat baca.
      // Data lama bisa mengandung totalCostUsd negatif atau NaN akibat
      // bug pricing sentinel openrouter/auto yang sudah diperbaiki di P0-02.
      // Jika nilai tidak valid, reset ke 0 agar UI tidak menampilkan angka mustahil.
      if (!isFinite(raw.totalCostUsd) || raw.totalCostUsd < 0) {
        raw.totalCostUsd = 0;
      }
      // Sanitasi juga per-history entry — buang entri yang korup
      if (Array.isArray(raw.history)) {
        raw.history = raw.history.filter(
          r => isFinite(r.costUsd) && r.costUsd >= 0
        );
      }
      return raw;
    }
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      history: []
    };
  }

  async logUsage(record: TokenUsageRecord): Promise<void> {
    const stats = await this.getStats();

    stats.totalRequests += 1;
    stats.totalInputTokens += record.inputTokens;
    stats.totalOutputTokens += record.outputTokens;

    // P1-09: Guard NaN / Infinity / negatif sebelum akumulasi.
    // openrouter/auto mengembalikan pricing sentinel -1 yang bisa menghasilkan
    // costUsd negatif jika tidak di-sanitasi lebih awal di tokenBudgetManager.
    // Double guard di sini agar data stats tetap bersih meski ada edge case.
    const safeCost = (isFinite(record.costUsd) && record.costUsd >= 0)
      ? record.costUsd
      : 0;
    stats.totalCostUsd += safeCost;

    // Simpan record dengan costUsd yang sudah di-sanitasi
    const safeRecord: TokenUsageRecord = { ...record, costUsd: safeCost };

    // Simpan history (batasi 100 terakhir untuk performa)
    stats.history.push(safeRecord);
    if (stats.history.length > 100) {
      stats.history.shift();
    }

    await fs.ensureDir(path.dirname(this.statsPath));
    await fs.writeJson(this.statsPath, stats, { spaces: 2 });
  }

  async resetStats(): Promise<void> {
    if (await fs.pathExists(this.statsPath)) {
      await fs.remove(this.statsPath);
    }
  }
}
