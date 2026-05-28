/**
 * secretRedactor.ts
 *
 * Mendeteksi dan menyamarkan secret dari text sebelum dikirim ke LLM,
 * disimpan ke memory/RAG, atau diupload ke remote server.
 *
 * Digunakan di:
 * - chatUI.ts (sebelum upload conversation)
 * - memoryManager.ts (sebelum save memory entry)
 * - promptBuilder.ts (sebelum inject file/memory ke system prompt)
 * - commandExecutor.ts (sebelum output terminal dikirim ke model)
 * - auditLogger.ts (sebelum log ditulis)
 */

export class SecretRedactor {
  private patterns: Array<{ name: string; regex: RegExp; replacement: string }> = [
    {
      name: 'OpenAI/OpenRouter-like API Key',
      regex: /\b(sk-or-v1-[A-Za-z0-9_\-]+|sk-[A-Za-z0-9_\-]{20,})\b/g,
      replacement: '[REDACTED_API_KEY]'
    },
    {
      name: 'Bearer Token',
      regex: /\bBearer\s+[A-Za-z0-9._\-+/=]{10,}\b/gi,
      replacement: 'Bearer [REDACTED]'
    },
    {
      name: 'Private Key Block',
      regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacement: '[REDACTED_PRIVATE_KEY]'
    },
    {
      name: 'Password Assignment',
      regex: /\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*["']?[^"'\s\n]+["']?/gi,
      replacement: '$1=[REDACTED]'
    },
    {
      name: 'Database URL',
      regex: /\b(postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^\s]+/gi,
      replacement: '[REDACTED_DATABASE_URL]'
    },
    {
      name: 'AWS Access Key',
      regex: /\bAKIA[0-9A-Z]{16}\b/g,
      replacement: '[REDACTED_AWS_ACCESS_KEY]'
    },
    {
      name: 'JWT',
      regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      replacement: '[REDACTED_JWT]'
    },
    {
      name: 'Basic Auth URL',
      regex: /(https?:\/\/)[^:\s\/]+:[^@\s\/]+@/gi,
      replacement: '$1[REDACTED_AUTH]@'
    },
    {
      // BUG-09 fix: threshold dinaikkan ke 48 chars agar tidak meredact
      // Git SHA (40 chars), UUID tanpa dash (32 chars), MD5 hash (32 chars).
      // 48 chars ke atas sangat jarang muncul di kode biasa — lebih likely token/secret.
      name: 'Generic Hex Token (48+ chars)',
      regex: /\b[0-9a-f]{48,}\b/gi,
      replacement: '[REDACTED_HEX_TOKEN]'
    },
  ];

  /**
   * Tambahkan pattern custom (misalnya SSH host/user dari profile).
   * Pattern tambahan ini bersifat runtime — tidak persist.
   */
  addPattern(name: string, regex: RegExp, replacement: string): void {
    this.patterns.push({ name, regex, replacement });
  }

  /**
   * Samarkan semua secret yang terdeteksi dalam text.
   * Mengembalikan text yang sudah aman untuk dikirim ke LLM / disimpan.
   */
  redact(input: string): string {
    let output = input;
    for (const pattern of this.patterns) {
      // Reset lastIndex untuk regex global agar tidak skip match
      pattern.regex.lastIndex = 0;
      output = output.replace(pattern.regex, pattern.replacement);
    }
    return output;
  }

  /**
   * Cek apakah text mengandung secret.
   * Berguna untuk menampilkan warning ke user.
   */
  containsSecret(input: string): boolean {
    for (const pattern of this.patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(input)) return true;
    }
    return false;
  }
}
