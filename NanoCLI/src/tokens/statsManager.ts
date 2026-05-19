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
      return await fs.readJson(this.statsPath);
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
    stats.totalCostUsd += record.costUsd;
    
    // Simpan history (batasi 100 terakhir untuk performa)
    stats.history.push(record);
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
