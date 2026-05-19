import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import CryptoJS from 'crypto-js';
import { Renderer } from '../ui/render';
import { Indexer } from './indexer';
import { OpenRouterClient } from '../llm/openrouterClient';
import { ConfigManager } from '../files/configManager';
import { isSensitiveFile } from '../files/sensitiveFileBlocker';

/**
 * Extension allowlist untuk memory indexing.
 * Hanya file teks/kode yang relevan yang perlu diindeks.
 */
const ALLOWED_INDEX_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.php', '.rb', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.vue', '.svelte', '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.mdx', '.txt', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.prisma', '.graphql', '.gql',
  '.env.example',  // aman: hanya placeholder
]);

/** Ukuran maksimal file yang akan diindeks (200KB). */
const MAX_INDEX_FILE_BYTES = 200_000;

export class MemoryManager {
  private projectRoot: string;
  private nanocliDir: string;
  private indexer: Indexer;
  private configManager: ConfigManager;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.nanocliDir = path.join(this.projectRoot, '.nanocli');
    this.indexer = new Indexer(projectRoot);
    this.configManager = new ConfigManager(projectRoot);
  }

  async initProject(): Promise<void> {
    if (await fs.pathExists(this.nanocliDir)) {
      Renderer.printStatus('Folder .nanocli sudah ada di proyek ini.', 'warn');
      return;
    }

    try {
      const dirs = ['', 'memory', 'index', 'summaries/files', 'sessions', 'cache', 'benchmarks'];
      for (const dir of dirs) {
        await fs.ensureDir(path.join(this.nanocliDir, dir));
      }

      await this.createFileFromTemplate('PROJECT_CONTEXT.md', this.getProjectContextTemplate());
      await this.createFileFromTemplate('AGENTS.md', this.getAgentsTemplate());

      const memoryFiles = {
        'decisions.md': '# Technical Decisions\n\nCatat keputusan teknis penting di sini.',
        'changelog.md': '# Changelog\n\nRiwayat perubahan proyek.',
        'bugs.md': '# Bug Reports\n\nCatatan bug dan solusinya.',
        'todos.md': '# TODO List\n\nDaftar tugas yang perlu dikerjakan.',
        'coding_style.md': '# Coding Style\n\nPreferensi gaya penulisan kode.',
        'dependencies.md': '# Dependencies\n\nDaftar framework dan library utama.'
      };

      for (const [filename, content] of Object.entries(memoryFiles)) {
        await this.createFileFromTemplate(path.join('memory', filename), content);
      }

      Renderer.printStatus('Project Memory berhasil diinisialisasi!', 'success');
    } catch (error: any) {
      Renderer.printStatus(`Gagal inisialisasi proyek: ${error.message}`, 'error');
    }
  }

  async updateMemory(): Promise<void> {
    Renderer.printStatus('Memulai pembaruan Project Memory...', 'info');
    
    try {
      await this.indexer.connect();
      
      const ignorePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.nanocli/**',
        '**/dist/**',
        '**/build/**',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml'
      ];

      const files = await glob('**/*', { 
        cwd: this.projectRoot, 
        ignore: ignorePatterns,
        nodir: true,
        absolute: true
      });

      Renderer.printStatus(`Ditemukan ${files.length} file untuk diproses.`, 'info');

      let updatedCount = 0;
      let skippedCount = 0;
      for (const filePath of files) {
        const relativePath = path.relative(this.projectRoot, filePath);

        // Filter 1: skip file sensitif
        if (isSensitiveFile(filePath)) {
          skippedCount++;
          continue;
        }

        // Filter 2: skip extension yang tidak diizinkan
        const ext = path.extname(filePath).toLowerCase();
        const isEnvExample = path.basename(filePath).toLowerCase() === '.env.example';
        if (!ALLOWED_INDEX_EXTENSIONS.has(ext) && !isEnvExample) {
          skippedCount++;
          continue;
        }

        // Filter 3: skip file yang terlalu besar
        let stat: fs.Stats;
        try {
          stat = await fs.stat(filePath);
        } catch {
          skippedCount++;
          continue;
        }
        if (stat.size > MAX_INDEX_FILE_BYTES) {
          skippedCount++;
          continue;
        }

        // Filter 4: skip file binary (null byte check)
        let rawBuffer: Buffer;
        try {
          rawBuffer = await fs.readFile(filePath);
        } catch {
          skippedCount++;
          continue;
        }
        if (rawBuffer.includes(0)) {
          skippedCount++;
          continue;
        }

        const content = rawBuffer.toString('utf-8');
        const hash = CryptoJS.MD5(content).toString();

        // Cek apakah file berubah (logic sederhana: bandingkan hash di DB nanti)
        // Untuk sekarang kita asumsikan perlu update jika belum ada di index
        // (Implementasi pengecekan hash di Indexer akan lebih optimal di Task selanjutnya)
        
        // Fix Bug 3.12: ganti dummy summary dengan heuristic extraction
        const summary = this.buildHeuristicSummary(relativePath, content);
        
        this.indexer.updateFileIndex({
          path: relativePath,
          hash: hash,
          summary: summary,
          lastIndexed: Date.now()
        });
        updatedCount++;
      }

      Renderer.printStatus(
        `Pembaruan selesai. ${updatedCount} file diindeks, ${skippedCount} file dilewati (sensitif/binary/terlalu besar).`,
        'success'
      );

    } catch (error: any) {
      Renderer.printStatus(`Gagal memperbarui memory: ${error.message}`, 'error');
    } finally {
      this.indexer.close();
    }
  }

  async searchMemory(query: string): Promise<void> {
    Renderer.printStatus(`Mencari konteks untuk: "${query}"...`, 'info');
    
    try {
      await this.indexer.connect();
      const results = this.indexer.search(query);

      if (results.files.length === 0 && results.memory.length === 0) {
        console.log(chalk.yellow('\nTidak ditemukan konteks yang relevan di memory lokal.'));
        return;
      }

      if (results.files.length > 0) {
        console.log(chalk.cyan('\nFile Proyek Relevan:'));
        const fileRows = results.files.map((f: any) => [
          f.path,
          f.summary.substring(0, 60) + (f.summary.length > 60 ? '...' : '')
        ]);
        Renderer.renderTable(['Path', 'Ringkasan'], fileRows);
      }

      if (results.memory.length > 0) {
        console.log(chalk.cyan('\nEntri Memori Relevan:'));
        const memoryRows = results.memory.map((m: any) => [
          m.type.toUpperCase(),
          m.content.substring(0, 60).replace(/\n/g, ' ') + (m.content.length > 60 ? '...' : '')
        ]);
        Renderer.renderTable(['Tipe', 'Konten'], memoryRows);
      }

    } catch (error: any) {
      Renderer.printStatus(`Gagal melakukan pencarian: ${error.message}`, 'error');
    } finally {
      this.indexer.close();
    }
  }

  async getContextForQuery(query: string): Promise<string> {
    try {
      await this.indexer.connect();
      const results = this.indexer.search(query);
      
      let context = '';
      
      if (results.files.length > 0) {
        context += '\nRelevant Project Files:\n';
        results.files.forEach((f: any) => {
          context += `- ${f.path}: ${f.summary}\n`;
        });
      }

      if (results.memory.length > 0) {
        context += '\nRelevant Project Memory:\n';
        results.memory.forEach((m: any) => {
          context += `[${m.type.toUpperCase()}] ${m.content}\n`;
        });
      }

      return context.trim();
    } catch (error) {
      return '';
    } finally {
      this.indexer.close();
    }
  }

  private async createFileFromTemplate(relativePath: string, content: string) {
    const fullPath = path.join(this.nanocliDir, relativePath);
    if (!(await fs.pathExists(fullPath))) {
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * Fix Bug 3.12: Buat ringkasan heuristik dari konten file.
   * Mengekstrak imports, class names, dan function names untuk
   * memberikan konteks semantic yang lebih baik untuk FTS search.
   */
  private buildHeuristicSummary(relativePath: string, content: string): string {
    const parts: string[] = [`File: ${relativePath}`];

    // Extract class names
    const classes = content.match(/class\s+(\w+)/g)
      ?.map(m => m.replace('class ', ''))
      .slice(0, 8);
    if (classes && classes.length > 0) {
      parts.push(`Classes: ${classes.join(', ')}`);
    }

    // Extract function/method names (function keyword dan arrow functions)
    const funcs = content.match(/(?:async\s+)?function\s+(\w+)|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*(?:=>|{)/g)
      ?.map(m => m.split(/[\s(]/)[0]!.replace(/^async\s*/, ''))
      .filter(name => name && !['if', 'for', 'while', 'switch', 'catch'].includes(name))
      .slice(0, 10);
    if (funcs && funcs.length > 0) {
      parts.push(`Functions: ${funcs.join(', ')}`);
    }

    // Extract top-level imports (module names)
    const imports = content.match(/^import .+from ['"]([@\w.\-/]+)['"];?$/gm)
      ?.map(m => {
        const match = m.match(/from ['"]([@\w.\-/]+)['"]/)
        return match?.[1] ?? '';
      })
      .filter(Boolean)
      .slice(0, 8);
    if (imports && imports.length > 0) {
      parts.push(`Imports: ${imports.join(', ')}`);
    }

    // Deteksi bahasa/teknologi dari ekstensi
    const ext = path.extname(relativePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript React',
      '.js': 'JavaScript', '.jsx': 'JavaScript React',
      '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
      '.php': 'PHP', '.vue': 'Vue', '.sql': 'SQL',
    };
    if (langMap[ext]) parts.push(`Lang: ${langMap[ext]}`);

    return parts.join(' | ');
  }

  private getProjectContextTemplate(): string {
    return `# Project Context\n\n## Project Name\n(Isi nama proyek)\n\n## Project Goal\n(Jelaskan tujuan utama proyek ini)\n\n## Tech Stack\n(Daftar bahasa, framework, dan database yang digunakan)\n\n## Main Architecture\n(Jelaskan pola arsitektur yang digunakan)\n\n## Important Commands\n(Daftar perintah penting)\n\n## Current Development Focus\n(Apa yang sedang dikerjakan saat ini?)\n\n## Known Issues\n(Masalah atau bug yang sudah diketahui)\n\n## Coding Rules\n(Aturan khusus dalam penulisan kode)\n\n## Last Stable State\n(Kapan terakhir kali proyek dalam kondisi stabil?)\n`;
  }

  private getAgentsTemplate(): string {
    return `# AGENTS.md\n\n## Project Overview\n(Ringkasan proyek untuk instruksi AI)\n\n## Setup Commands\n(Instruksi cara setup)\n\n## Test Commands\n(Instruksi cara menjalankan test)\n\n## Code Style\n(Instruksi gaya kode)\n\n## Safety Rules\n(Aturan keamanan)\n\n## File Access Rules\n(Aturan akses file)\n\n## Response Style\n(Gaya jawaban AI)\n`;
  }
}
