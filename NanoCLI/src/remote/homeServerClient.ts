/**
 * homeServerClient.ts
 *
 * HTTP client untuk berkomunikasi dengan NanoCLI RAG API di home server.
 *
 * Prinsip desain:
 * - Semua operasi ingest bersifat FIRE-AND-FORGET — tidak pernah throw ke caller.
 * - isAvailable() menggunakan timeout 2 detik agar tidak memperlambat pipeline.
 * - Search menggunakan timeout 8 detik dengan null return jika gagal.
 */

import axios from 'axios';
import type {
  RemoteMemoryEntryPayload,
  RemoteConversationTurnPayload,
  RemoteSearchPayload,
  RemoteSearchResponse,
  RemoteHealthResponse,
  RemoteFeedbackPayload,
  RemoteStatsResponse,
} from './types';

const HEALTH_TIMEOUT_MS  = 2_000;
const REQUEST_TIMEOUT_MS = 8_000;

export class HomeServerClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Hapus trailing slash agar URL konsisten
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey  = apiKey;
  }

  private get headers() {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Cek apakah home server bisa diakses.
   * Timeout 2 detik — didesain untuk tidak memblok pipeline.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/health`, {
        headers: this.headers,
        timeout: HEALTH_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ambil detail health check (database, ollama, model).
   * Kembalikan null jika server tidak tersedia.
   */
  async getHealth(): Promise<RemoteHealthResponse | null> {
    try {
      const resp = await axios.get<RemoteHealthResponse>(`${this.baseUrl}/health`, {
        headers: this.headers,
        timeout: HEALTH_TIMEOUT_MS,
      });
      return resp.data;
    } catch {
      return null;
    }
  }

  /**
   * Upload memory entry ke home server (bug, decision, dll).
   * FIRE-AND-FORGET: tidak pernah throw, tidak perlu di-await.
   */
  async ingestMemoryEntry(payload: RemoteMemoryEntryPayload): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/ingest/memory-entry`, payload, {
        headers: this.headers,
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch {
      // Intentionally silent — home server mungkin sedang tidak tersedia
    }
  }

  /**
   * Upload satu turn percakapan ke home server.
   * FIRE-AND-FORGET: tidak pernah throw, tidak perlu di-await.
   */
  async ingestConversationTurn(payload: RemoteConversationTurnPayload): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/ingest/conversation-turn`, payload, {
        headers: this.headers,
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch {
      // Intentionally silent
    }
  }

  /**
   * Semantic search di knowledge base home server.
   * Kembalikan null jika server tidak tersedia atau error.
   */
  async search(payload: RemoteSearchPayload): Promise<RemoteSearchResponse | null> {
    try {
      const resp = await axios.post<RemoteSearchResponse>(`${this.baseUrl}/search`, payload, {
        headers: this.headers,
        timeout: REQUEST_TIMEOUT_MS,
      });
      return resp.data;
    } catch {
      return null;
    }
  }

  /**
   * Upload feedback rating ke home server.
   * FIRE-AND-FORGET: tidak pernah throw, tidak perlu di-await.
   * Data ini menjadi training signal untuk pengembangan model LLM.
   */
  async ingestFeedback(payload: RemoteFeedbackPayload): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/ingest/feedback`, payload, {
        headers: this.headers,
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch {
      // Intentionally silent
    }
  }

  /**
   * Ambil statistik agregat dari home server.
   * Digunakan oleh `nanocli data stats` command.
   * Kembalikan null jika server tidak tersedia atau terjadi error.
   */
  async getStats(): Promise<RemoteStatsResponse | null> {
    try {
      const resp = await axios.get<RemoteStatsResponse>(`${this.baseUrl}/stats`, {
        headers: this.headers,
        timeout: REQUEST_TIMEOUT_MS,
      });
      return resp.data;
    } catch {
      return null;
    }
  }
}
