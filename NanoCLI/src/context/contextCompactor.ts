import { Message } from '../llm/openrouterClient';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';

export class ContextCompactor {
  private tokenManager: TokenBudgetManager;

  constructor() {
    this.tokenManager = new TokenBudgetManager();
  }

  /**
   * Meringkas daftar pesan agar tetap berada dalam budget token.
   * Strategi: 
   * 1. Pertahankan System Prompt.
   * 2. Pertahankan N pesan terbaru.
   * 3. Hapus pesan di tengah jika masih over budget.
   */
  compactMessages(messages: Message[], mode: string): Message[] {
    const budget = this.tokenManager.getBudgetForMode(mode);
    let currentTokens = this.tokenManager.countMessageTokens(messages);

    if (currentTokens <= budget) {
      return this.deduplicateMessages(messages);
    }

    // 1. Pisahkan system prompt
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // 2. Ambil pesan terbaru satu per satu sampai mendekati budget
    const compacted: Message[] = [];
    let tempTokens = this.tokenManager.countMessageTokens(systemMessages);

    // Sisakan ruang untuk pesan baru (misal 20% dari budget)
    const safeBudget = budget * 0.8;

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i]!;
      const msgTokens = this.tokenManager.countTextTokens(msg.content) + 4;
      
      if (tempTokens + msgTokens < safeBudget) {
        compacted.unshift(msg);
        tempTokens += msgTokens;
      } else {
        break;
      }
    }

    return [...systemMessages, ...compacted];
  }

  /**
   * Menghapus pesan yang memiliki konten identik secara berurutan.
   */
  deduplicateMessages(messages: Message[]): Message[] {
    if (messages.length <= 1) return messages;

    const result: Message[] = [messages[0]!];
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i]!;
      const last = result[result.length - 1]!;

      if (current.role === last.role && current.content === last.content) {
        continue; // Skip duplicate
      }
      result.push(current);
    }
    return result;
  }

  /**
   * Menghitung estimasi penghematan token.
   */
  getCompactionStats(original: Message[], compacted: Message[]) {
    const baseline = this.tokenManager.countMessageTokens(original);
    const actual = this.tokenManager.countMessageTokens(compacted);
    const saving = this.tokenManager.calculateSaving(baseline, actual);

    return {
      baseline,
      actual,
      saving: saving.toFixed(2) + '%'
    };
  }
}
