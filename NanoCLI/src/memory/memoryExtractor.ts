/**
 * memoryExtractor.ts
 *
 * Mengekstrak preferensi dan keputusan penting dari riwayat percakapan aktif
 * untuk disimpan sebagai persistent memory di SQLite lokal.
 *
 * Cara kerja:
 * 1. Filter messages: hanya 'user' dan 'assistant', 20 turn terakhir
 * 2. Redact secrets sebelum dikirim ke model
 * 3. Kirim ke fast model dengan prompt extractor khusus
 * 4. Parse JSON response → validasi candidates
 * 5. Terapkan confidence boost/penalty berdasarkan frasa eksplisit user
 * 6. Filter confidence >= 0.60
 * 7. Filter tipe: hanya MVP_AUTO_SAVE_TYPES yang boleh disimpan otomatis
 * 8. Kembalikan MemoryCandidate[]
 *
 * Timeout: 5 detik hard timeout via Promise.race.
 * Jika timeout → kembalikan [] secara silent (exit tetap normal).
 */

import { OpenRouterClient, Message } from '../llm/openrouterClient';
import { SecretRedactor } from '../security/secretRedactor';
import { MVP_AUTO_SAVE_TYPES } from './schema';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface MemoryCandidate {
  type: 'preference' | 'coding_style' | 'decision' | 'constraint' | 'bug' | 'solution' | 'fact';
  scope: 'user' | 'project' | 'session';
  content: string;
  /** Keyakinan relevansi 0.0–1.0 setelah boost/penalty diterapkan */
  confidence: number;
  /** Penjelasan singkat kenapa kandidat ini diekstrak */
  reason: string;
}

// ─── Extractor Prompt ─────────────────────────────────────────────────────────

const MEMORY_EXTRACTOR_PROMPT = `You are NanoCLI Memory Extractor.

Extract durable, project-useful memory from this coding assistant conversation.

SAVE the following types of information:
- User preferences for tools, commands, or libraries (IMPORTANT: even if mentioned once, it's a preference signal)
- Commands or tools actually used successfully during the session
- Coding style decisions (naming, format, conventions)
- Architecture or technology decisions
- Project constraints (what NOT to do)
- Package managers or CLI tools chosen for specific tasks

EXAMPLES of what to save:
- "User used 'laravel new' to create Laravel projects" → save as preference, confidence 0.75
- "User prefers 'laravel new' over composer create-project" → save as preference, confidence 0.90
- "User chose npm over yarn for this project" → save as preference, confidence 0.75
- "User prefers camelCase naming" → save as coding_style, confidence 0.85

DO NOT SAVE:
- Secrets, credentials, tokens, passwords, API keys
- Raw command output or logs
- Generic greetings or off-topic chat
- Very obvious defaults (e.g., "created a new file")

Valid memory types:
- preference     → tool/command/library preference or choice
- coding_style   → naming, format, convention preference
- decision       → architecture or technology decision
- constraint     → what NOT to do in this project

Valid scopes:
- user    → preference specific to this developer (tools, style)
- project → decision specific to this project (architecture, stack)

IMPORTANT: Be INCLUSIVE rather than exclusive. If there's any signal of a tool or command preference, save it with appropriate confidence. It's better to save something with 0.65 confidence than to miss a real preference.

Return STRICT JSON only (no markdown, no explanation):
{
  "memories": [
    {
      "type": "preference",
      "scope": "user",
      "content": "User prefers 'laravel new' over composer create-project for creating Laravel projects.",
      "confidence": 0.80,
      "reason": "User explicitly specified 'laravel new' command when creating a Laravel project."
    }
  ]
}

If there is truly no useful information, return exactly:
{"memories":[]}`;

// ─── Class ────────────────────────────────────────────────────────────────────

export class MemoryExtractor {
  private redactor = new SecretRedactor();

  /**
   * Ekstrak memory candidates dari riwayat percakapan.
   *
   * @param options.client  - OpenRouterClient yang sudah terinisialisasi
   * @param options.modelId - Model ID yang digunakan (sebaiknya fast model)
   * @param options.messages - Riwayat pesan sesi aktif
   * @returns Array MemoryCandidate yang sudah difilter dan divalid
   */
  async extract(options: {
    client: OpenRouterClient;
    modelId: string;
    messages: Message[];
  }): Promise<MemoryCandidate[]> {
    // 1. Filter dan persiapkan transcript
    const transcript = options.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)  // hanya 20 turn terakhir
      .map(m => `${m.role.toUpperCase()}: ${this.redactor.redact(m.content).slice(0, 4_000)}`)
      .join('\n\n');

    // Tidak ada percakapan yang cukup untuk diekstrak
    if (transcript.trim().length < 30) return [];

    const extractorMessages: Message[] = [
      { role: 'system', content: MEMORY_EXTRACTOR_PROMPT },
      { role: 'user',   content: transcript },
    ];

    // 2. LLM call dengan hard timeout 5 detik
    let raw = '';
    try {
      const llmPromise = (async () => {
        for await (const chunk of options.client.streamChat({
          model:    options.modelId,
          messages: extractorMessages,
          stream:   true,
        })) {
          raw += chunk;
        }
      })();

      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('MemoryExtractor timeout (12s)')), 12_000)
      );

      await Promise.race([llmPromise, timeoutPromise]);
    } catch {
      // Timeout atau error LLM — kembalikan kosong secara silent
      return [];
    }

    // 3. Parse JSON response
    const parsed = this.parseJson(raw);
    const rawCandidates: any[] = parsed.memories ?? [];

    // 4. Validasi, confidence boost/penalty, dan filter
    return this.validateAndBoost(rawCandidates);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private parseJson(text: string): any {
    // Cari JSON object (mungkin ada teks lain sebelum/sesudah)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { memories: [] };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { memories: [] };
    }
  }

  /**
   * Validasi candidates dan terapkan confidence boost/penalty.
   *
   * Boost:  +0.10 jika content mengandung frasa eksplisit preferensi kuat
   * Penalty: -0.15 jika content mengandung frasa sementara/one-time
   *
   * Threshold: confidence >= 0.60 (diturunkan dari 0.70 agar lebih inklusif)
   * Auto-save hanya untuk MVP_AUTO_SAVE_TYPES; tipe lain di-skip.
   */
  private validateAndBoost(items: any[]): MemoryCandidate[] {
    const BOOST_PHRASES = [
      'aku lebih suka', 'saya lebih suka', 'i prefer', 'always use', 'selalu gunakan',
      'jangan gunakan', 'never use', 'wajib pakai', 'harus pakai', 'always',
      'lebih suka', 'prefer', 'biasa pakai', 'usually use',
    ];
    const PENALTY_PHRASES = [
      'untuk project ini saja', 'kali ini saja', 'sementara', 'temporarily',
      'for now', 'just this time', 'sekali ini', 'kali ini',
    ];

    const valid: MemoryCandidate[] = [];

    for (const item of items) {
      // Validasi struktur dasar
      if (typeof item?.content !== 'string' || item.content.trim().length < 10) continue;
      if (typeof item?.confidence !== 'number') continue;
      if (!['preference','coding_style','decision','constraint','bug','solution','fact'].includes(item.type)) continue;

      const contentLower = item.content.toLowerCase();

      // Terapkan boost/penalty
      let confidence = Math.min(1.0, Math.max(0.0, item.confidence));
      if (BOOST_PHRASES.some(p => contentLower.includes(p)))   confidence = Math.min(1.0, confidence + 0.10);
      if (PENALTY_PHRASES.some(p => contentLower.includes(p))) confidence = Math.max(0.0, confidence - 0.15);

      // Filter confidence minimum — diturunkan ke 0.60 agar lebih inklusif
      if (confidence < 0.60) continue;

      // Filter tipe: auto-save hanya untuk MVP types
      const type = item.type as MemoryCandidate['type'];
      if (!MVP_AUTO_SAVE_TYPES.has(type as any)) continue;

      valid.push({
        type,
        scope:      ['user','project','session'].includes(item.scope) ? item.scope : 'project',
        content:    this.redactor.redact(item.content.trim()).slice(0, 500),
        confidence: parseFloat(confidence.toFixed(2)),
        reason:     String(item.reason ?? '').slice(0, 300),
      });
    }

    return valid;
  }
}
