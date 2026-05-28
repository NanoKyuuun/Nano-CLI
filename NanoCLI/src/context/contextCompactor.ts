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
   *
   * @param messages - Daftar pesan yang akan dikompaksi.
   * @param mode - Mode aktif (fast, normal, high, extra-high) untuk menentukan budget cap.
   * @param modelContextLength - Context window model aktual (opsional). Jika diisi,
   *   budget dihitung secara model-aware menggunakan getBudgetForModel().
   */
  compactMessages(messages: Message[], mode: string, modelContextLength?: number): Message[] {
    return this.compactAndDiscard(messages, mode, modelContextLength).compacted;
  }

  compactAndDiscard(
    messages: Message[],
    mode: string,
    modelContextLength?: number
  ): { compacted: Message[]; discarded: Message[] } {
    const budget = modelContextLength
      ? this.tokenManager.getBudgetForModel(modelContextLength, mode)
      : this.tokenManager.getBudgetForMode(mode);

    let currentTokens = this.tokenManager.countMessageTokens(messages);

    if (currentTokens <= budget) {
      return { compacted: this.deduplicateMessages(messages), discarded: [] };
    }

    if (messages.length <= 2) {
      return { compacted: messages, discarded: [] };
    }

    // 1. Pisahkan system prompt utama (indeks 0) jika ada
    const systemPrompt = messages[0]?.role === 'system' ? messages[0] : null;
    const chatMsgs = systemPrompt ? messages.slice(1) : messages;

    // 2. Tentukan budget untuk chat messages
    const systemTokens = systemPrompt ? this.tokenManager.countMessageTokens([systemPrompt]) : 0;
    // Sisakan ruang untuk pesan baru (misal 20% dari budget)
    const chatBudget = (budget - systemTokens) * 0.8;

    // 3. Ambil pesan terbaru dari kanan ke kiri
    const keepList: Message[] = [];
    const discardList: Message[] = [];
    let tempTokens = 0;

    // Pastikan kita mempertahankan minimal 2 pesan chat terakhir (user + assistant terakhir) jika ada
    const minKeepCount = Math.min(chatMsgs.length, 2);

    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const msg = chatMsgs[i]!;
      const msgTokens = this.tokenManager.countTextTokens(msg.content) + 4;

      if (keepList.length < minKeepCount || tempTokens + msgTokens < chatBudget) {
        keepList.unshift(msg);
        tempTokens += msgTokens;
      } else {
        discardList.unshift(msg);
      }
    }

    const compacted = systemPrompt ? [systemPrompt, ...keepList] : keepList;

    return {
      compacted: this.deduplicateMessages(compacted),
      discarded: discardList
    };
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
