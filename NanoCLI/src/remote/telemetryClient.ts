/**
 * telemetryClient.ts
 *
 * Lightweight client untuk Share mode.
 * Mengirim HANYA metadata anonim — TIDAK pernah mengirim konten percakapan,
 * kode, nama file, atau informasi yang bisa mengidentifikasi user.
 *
 * Endpoint tidak memerlukan autentikasi karena data yang dikirim anonim.
 */

import axios from 'axios';
import type { TelemetryEvent } from './types';

/**
 * URL server telemetry default.
 * Override dengan env var NANOCLI_TELEMETRY_URL saat deployment.
 * Ini URL yang akan diisi saat open-source dirilis.
 */
export const NANOCLI_TELEMETRY_URL =
  process.env['NANOCLI_TELEMETRY_URL'] ?? 'https://telemetry.nanocli.dev';

/** Versi CLI — diisi dari package.json saat build */
const CLI_VERSION = process.env['npm_package_version'] ?? '1.0.0';

export class TelemetryClient {
  private readonly serverUrl: string;

  constructor(serverUrl: string = NANOCLI_TELEMETRY_URL) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
  }

  /**
   * Kirim satu telemetry event ke server.
   * FIRE-AND-FORGET: tidak pernah throw, tidak pernah block caller.
   * Timeout 3 detik — lebih pendek dari request biasa.
   */
  sendEvent(event: TelemetryEvent): void {
    const payload: TelemetryEvent = {
      ...event,
      cli_version: CLI_VERSION,
    };

    // Tidak di-await secara sengaja — fire-and-forget
    axios
      .post(`${this.serverUrl}/telemetry/event`, payload, {
        timeout: 3_000,
        // Tidak ada header auth — endpoint publik, data anonim
      })
      .catch(() => {
        // Intentionally silent — telemetry tidak boleh ganggu user
      });
  }

  /**
   * Helper untuk mengklasifikasikan jumlah token ke dalam range.
   * Menghindari pengiriman angka pasti yang bisa jadi fingerprint.
   */
  static tokenRange(count: number): TelemetryEvent['token_range'] {
    if (count <= 4_000) return '0-4k';
    if (count <= 8_000) return '4k-8k';
    if (count <= 32_000) return '8k-32k';
    return '32k+';
  }

  /**
   * Cek apakah server telemetry bisa dijangkau.
   * Digunakan di setup wizard untuk validasi Share mode.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${this.serverUrl}/health`, { timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}
