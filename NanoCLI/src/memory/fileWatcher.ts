/**
 * fileWatcher.ts — P2-04
 *
 * Auto-index watcher berbasis chokidar.
 * Memantau perubahan file di dalam project root dan secara otomatis
 * memicu re-indexing inkremental via MemoryManager.
 *
 * Design principles:
 * - Debounce 2s: multiple rapid changes dikumpulkan menjadi satu re-index
 * - Hanya trigger untuk file yang masuk ALLOWED_INDEX_EXTENSIONS
 * - Tidak re-index file sensitif (.env, credentials, dll.)
 * - Shutdown graceful via stop()
 * - Tidak pernah throw ke caller — semua error di-log secara quiet
 */

import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { isSensitiveFile } from '../files/sensitiveFileBlocker';


/** Ekstensi file yang layak di-trigger ulang saat berubah */
const WATCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.json', '.yaml', '.yml', '.toml', '.ini',
  '.md', '.mdx', '.txt',
  '.html', '.css', '.scss', '.vue', '.svelte',
  '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.proto',
]);

/** Pola path yang diabaikan watcher */
const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.nanocli/**',
  '**/dist/**',
  '**/build/**',
  '**/.cache/**',
  '**/*.lock',
  '**/package-lock.json',
];

/**
 * Callback yang dipanggil setelah debounce ketika ada file yang berubah.
 * Menerima set path file yang berubah (relative dari projectRoot).
 */
export type WatcherChangeCallback = (changedPaths: Set<string>) => Promise<void>;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private projectRoot: string;
  private onChange: WatcherChangeCallback;
  private debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Kumpulan path yang sudah berubah — di-flush saat debounce timer fire */
  private pendingChanges = new Set<string>();
  private isRunning = false;

  constructor(
    projectRoot: string,
    onChange: WatcherChangeCallback,
    debounceMs = 2_000,
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.onChange    = onChange;
    this.debounceMs  = debounceMs;
  }

  /**
   * Mulai memantau project root.
   * Aman dipanggil ulang — cek isRunning terlebih dahulu.
   */
  start(): void {
    if (this.isRunning) return;

    this.watcher = chokidar.watch(this.projectRoot, {
      ignored: IGNORED_PATTERNS,
      ignoreInitial: true,     // tidak trigger untuk file yang sudah ada saat start
      persistent: true,
      usePolling: false,       // gunakan native fs events untuk performa
      awaitWriteFinish: {
        stabilityThreshold: 200,  // tunggu file selesai ditulis
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add',    (filePath) => this.handleChange(filePath))
      .on('change', (filePath) => this.handleChange(filePath))
      .on('unlink', (filePath) => this.handleChange(filePath))
      .on('error',  (err) => {
        // Quiet — watcher error tidak boleh crash CLI
        process.stderr.write(`[FileWatcher] Error: ${err}\n`);
      });

    this.isRunning = true;
  }

  /**
   * Hentikan watcher dan bersihkan resources.
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isRunning = false;
  }

  /**
   * Kembalikan status running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private handleChange(absolutePath: string): void {
    // Filter 1: hanya extension yang relevan
    const ext = path.extname(absolutePath).toLowerCase();
    const isEnvExample = path.basename(absolutePath).toLowerCase() === '.env.example';
    if (!WATCHABLE_EXTENSIONS.has(ext) && !isEnvExample) return;

    // Filter 2: jangan trigger untuk file sensitif
    if (isSensitiveFile(absolutePath)) return;

    // Tambahkan ke pending changes
    const relativePath = path.relative(this.projectRoot, absolutePath);
    this.pendingChanges.add(relativePath);

    // Debounce: reset timer
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const toProcess = new Set(this.pendingChanges);
    this.pendingChanges.clear();
    this.debounceTimer = null;

    try {
      await this.onChange(toProcess);
    } catch (err) {
      // Quiet — callback error tidak boleh crash watcher
      process.stderr.write(`[FileWatcher] Callback error: ${err}\n`);
    }
  }
}
