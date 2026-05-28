/**
 * ignoreRules.ts
 *
 * Membaca .ragignore, .aiignore, dan .gitignore dari root project,
 * lalu menyediakan fungsi untuk mengecek apakah file harus diabaikan.
 *
 * - .ragignore → file yang tidak boleh masuk RAG (local SQLite + remote)
 * - .aiignore → file yang tidak boleh dikirim ke model AI
 * - .gitignore → fallback untuk file yang tidak di-track
 *
 * Menggunakan package 'ignore' (gitignore-style pattern matching).
 */

import fs from 'fs-extra';
import path from 'path';
import ignore, { Ignore } from 'ignore';

export class IgnoreRules {
  private ragIgnore: Ignore | null = null;
  private aiIgnore: Ignore | null = null;
  private gitIgnore: Ignore | null = null;
  private projectRoot: string;
  private loaded = false;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load semua ignore files. Lazy-load — hanya baca file saat pertama kali dipanggil.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    this.ragIgnore = await this.loadIgnoreFile('.ragignore');
    this.aiIgnore = await this.loadIgnoreFile('.aiignore');
    this.gitIgnore = await this.loadIgnoreFile('.gitignore');
    this.loaded = true;
  }

  /**
   * Baca satu ignore file dan return Ignore instance.
   * Return null jika file tidak ada.
   */
  private async loadIgnoreFile(filename: string): Promise<Ignore | null> {
    const filePath = path.join(this.projectRoot, filename);
    try {
      if (!(await fs.pathExists(filePath))) return null;
      const content = await fs.readFile(filePath, 'utf-8');
      const ig = ignore();
      ig.add(content);
      return ig;
    } catch {
      return null;
    }
  }

  /**
   * Apakah file harus diabaikan untuk RAG indexing?
   * Check order: .ragignore → .gitignore (fallback)
   *
   * @param relativePath - Path relatif terhadap project root (forward slash)
   */
  async shouldIgnoreForRAG(relativePath: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalized = relativePath.replace(/\\/g, '/');

    // .ragignore punya prioritas tertinggi
    if (this.ragIgnore?.ignores(normalized)) return true;

    // Fallback ke .gitignore jika .ragignore tidak ada
    if (!this.ragIgnore && this.gitIgnore?.ignores(normalized)) return true;

    return false;
  }

  /**
   * Apakah file harus diabaikan untuk AI model (tidak boleh dikirim ke LLM)?
   * Check order: .aiignore → .ragignore → .gitignore
   *
   * @param relativePath - Path relatif terhadap project root (forward slash)
   */
  async shouldIgnoreForAI(relativePath: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalized = relativePath.replace(/\\/g, '/');

    // .aiignore punya prioritas tertinggi untuk AI
    if (this.aiIgnore?.ignores(normalized)) return true;

    // Fallback ke .ragignore
    if (this.ragIgnore?.ignores(normalized)) return true;

    // Fallback ke .gitignore
    if (!this.aiIgnore && !this.ragIgnore && this.gitIgnore?.ignores(normalized)) return true;

    return false;
  }

  /**
   * Force reload semua ignore files (misalnya setelah user edit .ragignore).
   */
  async reload(): Promise<void> {
    this.loaded = false;
    await this.ensureLoaded();
  }
}
