/**
 * outputLimiter.ts
 *
 * Membatasi output terminal agar tidak membanjiri context window LLM.
 * Strategy: head + tail — pertahankan awal dan akhir output,
 * potong bagian tengah yang biasanya repetitif.
 *
 * Default limits:
 * - 12.000 chars (≈3.000 tokens)
 * - 300 lines
 */

export class OutputLimiter {
  /**
   * Batasi output berdasarkan jumlah baris dan karakter.
   * Jika output melebihi batas, ambil head + tail dan sisipkan marker truncation.
   */
  limit(text: string, options?: {
    maxChars?: number;
    maxLines?: number;
  }): string {
    const maxChars = options?.maxChars ?? 12_000;
    const maxLines = options?.maxLines ?? 300;

    // 1. Limit by lines
    const lines = text.split(/\r?\n/);
    let result: string;

    if (lines.length > maxLines) {
      const headCount = Math.floor(maxLines / 2);
      const tailCount = maxLines - headCount;
      const truncated = lines.length - maxLines;
      result = [
        ...lines.slice(0, headCount),
        `\n... [${truncated} lines truncated] ...\n`,
        ...lines.slice(-tailCount),
      ].join('\n');
    } else {
      result = text;
    }

    // 2. Limit by chars
    if (result.length > maxChars) {
      const headSize = Math.floor(maxChars / 2);
      const tailSize = maxChars - headSize;
      const omitted = result.length - maxChars;
      result = [
        result.slice(0, headSize),
        `\n... [output truncated: ${omitted} chars omitted] ...\n`,
        result.slice(-tailSize),
      ].join('');
    }

    return result;
  }
}
