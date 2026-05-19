import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { Message } from '../llm/openrouterClient';
import { isInsideProject, isSecretFile } from '../utils/fsSafe';

export class PromptBuilder {
  private projectRoot: string;
  private nanocliDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.nanocliDir = path.join(this.projectRoot, '.nanocli');
  }

  /**
   * Membangun System Prompt yang kaya akan konteks proyek.
   */
  async buildSystemPrompt(commandMode: string): Promise<string> {
    const coreIdentity = this.getCoreIdentity();
    const environmentContext = await this.buildEnvironmentContext();
    const keyFilesContext = await this.autoInjectKeyFiles();
    const projectContext = await this.readProjectFile('PROJECT_CONTEXT.md');
    const agentsInstructions = await this.readProjectFile('AGENTS.md');
    const modeRules = this.getModeRules(commandMode);

    return `
${coreIdentity}

${environmentContext}

${keyFilesContext ? `### KEY PROJECT FILES (auto-injected):\n${keyFilesContext}` : ''}

${agentsInstructions ? `### PROJECT-SPECIFIC INSTRUCTIONS (AGENTS.md):\n${agentsInstructions}` : ''}

${projectContext ? `### CURRENT PROJECT CONTEXT:\n${projectContext}` : ''}

${modeRules}

### OPERATIONAL RULES:
1. Answer based ONLY on the actual environment context provided above. Do NOT invent file names, folder structures, or project details that are not listed.
2. When the user asks about files or folders, refer to the CURRENT WORKING DIRECTORY and FILE TREE sections above.
3. When the user asks about a specific file's content, refer to the KEY PROJECT FILES section or ask the user to type: /file <filename>
4. If you suggest code changes, ensure they follow the project's coding style.
5. Be concise and technical.
`.trim();
  }

  /**
   * Auto-inject file kunci proyek ke dalam system prompt.
   * Prioritas: tsconfig.json, package.json, README.md, .env.example, dll.
   */
  private async autoInjectKeyFiles(): Promise<string> {
    const KEY_FILES = [
      'package.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'README.md',
      'readme.md',
      '.env.example',
      'composer.json',
      'pyproject.toml',
      'requirements.txt',
      'go.mod',
      'Cargo.toml',
    ];

    const MAX_FILE_BYTES = 20_000; // max 20KB per file
    const sections: string[] = [];

    for (const filename of KEY_FILES) {
      const filePath = path.join(this.projectRoot, filename);
      try {
        if (await fs.pathExists(filePath)) {
          const stat = await fs.stat(filePath);
          if (stat.size <= MAX_FILE_BYTES) {
            const content = await fs.readFile(filePath, 'utf-8');
            const ext = path.extname(filename).slice(1) || 'text';
            sections.push(`#### ${filename}\n\`\`\`${ext}\n${content.trim()}\n\`\`\``);
          }
        }
      } catch {
        // skip unreadable files silently
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Deteksi nama file yang disebutkan user dalam pesan,
   * lalu baca dan kembalikan kontennya sebagai context tambahan.
   * Dipanggil dari ChatUI sebelum pesan user dikirim ke LLM.
   */
  async autoInjectMentionedFiles(userMessage: string): Promise<string | null> {
    const MAX_FILE_BYTES = 50_000; // max 50KB per file
    const MAX_FILES_PER_MESSAGE = 3;

    // Regex: tangkap kata yang mengandung ekstensi file atau path
    const filePatterns = [
      // Fix Bug 3.8: hapus 'env' dari daftar ekstensi auto-inject
      // '.env' termasuk file secret, jangan dikirim ke AI secara otomatis
      /[\w.\-/\\]+\.(?:ts|js|tsx|jsx|json|md|py|go|rs|php|vue|html|css|scss|yaml|yml|toml|txt|sh|sql|prisma|lock)(?:\b|$)/gi,
    ];

    const candidates = new Set<string>();
    for (const pattern of filePatterns) {
      const matches = userMessage.match(pattern) ?? [];
      for (const m of matches) {
        candidates.add(m.replace(/^['`"]+|['`"]+$/g, '').trim());
      }
    }

    if (candidates.size === 0) return null;

    const injected: string[] = [];
    let count = 0;

    for (const candidate of candidates) {
      if (count >= MAX_FILES_PER_MESSAGE) break;

      // Resolve relatif terhadap projectRoot
      const resolvedPath = path.isAbsolute(candidate)
        ? candidate
        : path.resolve(this.projectRoot, candidate);

      try {
        if (!(await fs.pathExists(resolvedPath))) continue;
        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile()) continue;
        if (stat.size > MAX_FILE_BYTES) continue;

        // Fix Bug 3.7 & 3.8: blokir file luar project dan file secret
        if (!isInsideProject(this.projectRoot, resolvedPath)) continue;
        if (isSecretFile(resolvedPath)) continue;

        const content = await fs.readFile(resolvedPath, 'utf-8');
        const relativePath = path.relative(this.projectRoot, resolvedPath);
        const ext = path.extname(resolvedPath).slice(1) || 'text';
        injected.push(`#### ${relativePath} (auto-read)\n\`\`\`${ext}\n${content.trim()}\n\`\`\``);
        count++;
      } catch {
        // skip
      }
    }

    if (injected.length === 0) return null;
    return `### FILES MENTIONED BY USER:\n${injected.join('\n\n')}`;
  }

  /**
   * Membangun konteks environment nyata: cwd, daftar file aktual, dan status NanoCLI.
   */
  private async buildEnvironmentContext(): Promise<string> {
    const lines: string[] = [];

    // 1. Current Working Directory
    lines.push(`### CURRENT WORKING DIRECTORY:\n${this.projectRoot}`);

    // 2. Real File Tree
    try {
      const ignorePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.nanocli/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/vendor/**',
        '**/__pycache__/**'
      ];

      const files = await glob('**/*', {
        cwd: this.projectRoot,
        ignore: ignorePatterns,
        nodir: false,
        mark: true // trailing slash untuk direktori
      });

      if (files.length > 0) {
        const limited = files.slice(0, 150); // batasi agar tidak membanjiri context
        const fileTree = limited
          .sort()
          .map(f => `  ${f}`)
          .join('\n');
        lines.push(`### FILE TREE (${files.length} entries${files.length > 150 ? ', showing first 150' : ''}):\n${fileTree}`);
      } else {
        lines.push('### FILE TREE:\n  (Direktori kosong atau semua file diabaikan)');
      }
    } catch {
      lines.push('### FILE TREE:\n  (Gagal membaca struktur folder)');
    }

    // 3. NanoCLI project status
    const isNanoInitialized = await fs.pathExists(this.nanocliDir);
    lines.push(`### NANOCLI STATUS:\n${isNanoInitialized ? 'Project sudah di-init (.nanocli folder tersedia)' : 'Project BELUM di-init. Jalankan: nanocli init'}`);

    return lines.join('\n\n');
  }

  private getCoreIdentity(): string {
    return `
You are NanoCLI, a specialized AI Coding Assistant running directly in the user's terminal.
Your goal is to help developers understand, review, debug, and build software efficiently.
You have access to the project's local memory and can see the files the user provides.
`.trim();
  }

  private getModeRules(mode: string): string {
    const rules: Record<string, string> = {
      'chat': 'Mode: INTERACTIVE CHAT. Act as a pair-programmer. Keep the conversation flowing and ask for clarification if needed.',
      'ask': 'Mode: QUICK QUERY. Provide a direct, concise answer to the user\'s question.',
      'review': 'Mode: CODE REVIEW. Focus on security, performance, and maintainability. Be critical but constructive.',
      'debug': 'Mode: DEBUGGING. Analyze the error carefully and provide a step-by-step fix.',
      'test': 'Mode: TEST GENERATION. Generate comprehensive unit tests. Provide only the code block.',
      'plan': 'Mode: ARCHITECTURAL PLANNING. Think like a senior architect. Provide a structured implementation roadmap.',
      'patch': 'Mode: CODE PATCHING. Provide minimal, clean, and safe code changes.'
    };
    return `### CURRENT MODE RULES:\n${rules[mode.toLowerCase()] || rules['chat']}`;
  }

  private async readProjectFile(filename: string): Promise<string | null> {
    const filePath = path.join(this.nanocliDir, filename);
    if (await fs.pathExists(filePath)) {
      return await fs.readFile(filePath, 'utf-8');
    }
    return null;
  }
}
