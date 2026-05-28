import fs from 'fs-extra';
import path from 'path';

export class ChatHistoryManager {
  private historyPath: string;
  private history: string[] = [];

  constructor(projectRoot: string) {
    this.historyPath = path.join(projectRoot, '.nanocli', 'chat_history.json');
  }

  async loadHistory(): Promise<string[]> {
    try {
      if (await fs.pathExists(this.historyPath)) {
        const data = await fs.readJson(this.historyPath);
        if (Array.isArray(data)) {
          this.history = data;
          return this.history;
        }
      }
    } catch {
      // ignore
    }
    this.history = [];
    return this.history;
  }

  async saveHistory(history: string[]): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.historyPath));
      await fs.writeJson(this.historyPath, history, { spaces: 2 });
    } catch {
      // ignore
    }
  }

  async append(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || trimmed === '') return;
    
    // Jangan simpan perintah sensitif atau /exit / /quit ke history
    if (trimmed === '/exit' || trimmed === '/quit') return;

    await this.loadHistory();
    // Dedup: jika sama dengan entri terakhir, jangan tambahkan lagi
    if (this.history[this.history.length - 1] === trimmed) {
      return;
    }
    
    this.history.push(trimmed);
    if (this.history.length > 100) {
      this.history.shift();
    }
    await this.saveHistory(this.history);
  }
}
