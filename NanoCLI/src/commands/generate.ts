/**
 * generate.ts
 *
 * Command: nanocli generate <type> <prompt> --out <path>
 *
 * Generate dokumen proyek terstruktur menggunakan template khusus:
 *   nanocli generate prd "fitur login JWT" --out docs/PRD-login.md
 *   nanocli generate implementation "fitur auth" --out docs/IMPL-auth.md
 *   nanocli generate tasks "fitur login JWT" --out docs/TASKS-login.md
 *   nanocli generate readme --out README.md
 *   nanocli generate api-spec "auth endpoint" --out docs/API-auth.md
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { ConfigManager } from '../files/configManager';
import { OpenRouterClient, Message } from '../llm/openrouterClient';
import { MemoryManager } from '../memory/memoryManager';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';
import { ContextCompactor } from '../context/contextCompactor';
import { ModelManager } from '../llm/modelManager';
import { FileOperationManager } from '../file/fileOperationManager';
import { StatsManager } from '../tokens/statsManager';
import { Renderer } from '../ui/render';
import { PRD_SYSTEM_PROMPT, buildPrdPrompt } from '../generators/prdGenerator';
import { IMPLEMENTATION_SYSTEM_PROMPT, buildImplementationPrompt } from '../generators/implementationGenerator';
import { TASK_SYSTEM_PROMPT, buildTaskPrompt } from '../generators/taskGenerator';
import { README_SYSTEM_PROMPT, buildReadmePrompt, buildApiSpecPrompt } from '../generators/readmeGenerator';

const GENERATE_TYPES = ['prd', 'implementation', 'tasks', 'readme', 'api-spec'] as const;
type GenerateType = typeof GENERATE_TYPES[number];

interface GeneratorConfig {
  systemPrompt: string;
  buildPrompt: (topic: string, context?: string) => string;
  defaultOutputDir: string;
  defaultFilename: (topic: string) => string;
  label: string;
}

export class GenerateCommand {
  private configManager: ConfigManager;
  private memoryManager: MemoryManager;
  private tokenManager: TokenBudgetManager;
  private compactor: ContextCompactor;
  private modelManager: ModelManager;
  private fileManager: FileOperationManager;
  private statsManager: StatsManager;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configManager = new ConfigManager(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.compactor = new ContextCompactor();
    this.modelManager = new ModelManager(projectRoot);
    this.fileManager = new FileOperationManager(projectRoot);
    this.statsManager = new StatsManager(projectRoot);
  }

  async execute(type: string, topic: string, options: any) {
    const mode = options.mode || 'high';

    if (!GENERATE_TYPES.includes(type as GenerateType)) {
      Renderer.printStatus(
        `Tipe tidak valid: "${type}". Pilih salah satu: ${GENERATE_TYPES.join(', ')}`,
        'error',
      );
      return;
    }

    const apiKey = await this.configManager.getApiKey();
    const modelId = options.model || await this.configManager.getModelForMode(mode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    const genType = type as GenerateType;
    const config = this.getConfig(genType);

    // Tentukan output path
    let outPath: string = options.out;
    if (!outPath) {
      outPath = path.join(config.defaultOutputDir, config.defaultFilename(topic));
      Renderer.printStatus(`Output path tidak diberikan. Akan disimpan ke: ${chalk.bold(outPath)}`, 'info');
    }

    const client = new OpenRouterClient(apiKey);
    const messages: Message[] = [];

    // 1. System prompt sesuai generator type
    messages.push({ role: 'system', content: config.systemPrompt });

    // 2. Context proyek
    const contextQuery = `${topic} ${genType} documentation architecture`;
    const context = await this.memoryManager.getContextForQuery(contextQuery);

    // Untuk readme: juga baca package.json
    let packageJson: string | undefined;
    if (genType === 'readme') {
      try {
        const pkgPath = path.join(this.projectRoot, 'package.json');
        if (await fs.pathExists(pkgPath)) {
          packageJson = await fs.readFile(pkgPath, 'utf-8');
        }
      } catch { /* ignore */ }
    }

    // 3. User prompt
    const userPrompt = genType === 'readme'
      ? buildReadmePrompt(context ?? undefined, packageJson)
      : genType === 'api-spec'
      ? buildApiSpecPrompt(topic, context ?? undefined)
      : config.buildPrompt(topic, context ?? undefined);

    messages.push({ role: 'user', content: userPrompt });

    // 4. Compact
    const modelMetadata = await this.modelManager.getModel(modelId);
    const compactedMessages = this.compactor.compactMessages(messages, mode, modelMetadata?.context_length);

    Renderer.printStatus(`Generating ${config.label}...`, 'info');

    // 5. Stream
    let fullContent = '';
    process.stdout.write(chalk.gray('\n  Generating'));
    try {
      const stream = client.streamChat({ model: modelId, messages: compactedMessages, stream: true });
      for await (const chunk of stream) {
        process.stdout.write(chalk.gray('.'));
        fullContent += chunk;
      }
      process.stdout.write(chalk.gray(' done\n\n'));
    } catch (err: any) {
      Renderer.printStatus(err.message, 'error');
      return;
    }

    // 6. Tulis file dengan approval
    const result = await this.fileManager.write(outPath, fullContent, 'create', {
      requireApproval: true,
      reason: `Generate ${config.label}: ${topic.slice(0, 60)}`,
      showDiff: false,
    });

    this.fileManager.printResult(result);

    // 7. Save ke memory
    if (result.success) {
      try {
        await this.memoryManager.saveMemoryEntry({
          type: 'decision',
          content: `[GENERATED ${genType.toUpperCase()}: ${topic.slice(0, 80)}]\nSaved to: ${outPath}\n${fullContent.slice(0, 400)}`,
          sourceFile: outPath,
          timestamp: Date.now(),
        });
      } catch { /* ignore */ }
    }

    // 8. Log usage
    if (modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const outputTokens = this.tokenManager.countTextTokens(fullContent);
      const costUsd = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);
      await this.statsManager.logUsage({ timestamp: Date.now(), modelId, mode, inputTokens, outputTokens, costUsd });
    }
  }

  private getConfig(type: GenerateType): GeneratorConfig {
    const configs: Record<GenerateType, GeneratorConfig> = {
      'prd': {
        systemPrompt: PRD_SYSTEM_PROMPT,
        buildPrompt: buildPrdPrompt,
        defaultOutputDir: 'docs',
        defaultFilename: (t) => `PRD-${t.slice(0, 30).replace(/\s+/g, '-').toLowerCase()}.md`,
        label: 'PRD (Product Requirements Document)',
      },
      'implementation': {
        systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
        buildPrompt: buildImplementationPrompt,
        defaultOutputDir: 'docs',
        defaultFilename: (t) => `IMPLEMENTATION-${t.slice(0, 25).replace(/\s+/g, '-').toLowerCase()}.md`,
        label: 'Implementation Plan',
      },
      'tasks': {
        systemPrompt: TASK_SYSTEM_PROMPT,
        buildPrompt: buildTaskPrompt,
        defaultOutputDir: 'docs',
        defaultFilename: (t) => `TASKS-${t.slice(0, 30).replace(/\s+/g, '-').toLowerCase()}.md`,
        label: 'Task Breakdown',
      },
      'readme': {
        systemPrompt: README_SYSTEM_PROMPT,
        buildPrompt: (t, ctx) => buildReadmePrompt(ctx),
        defaultOutputDir: '.',
        defaultFilename: () => 'README.md',
        label: 'README',
      },
      'api-spec': {
        systemPrompt: README_SYSTEM_PROMPT,
        buildPrompt: buildApiSpecPrompt,
        defaultOutputDir: 'docs',
        defaultFilename: (t) => `API-SPEC-${t.slice(0, 25).replace(/\s+/g, '-').toLowerCase()}.md`,
        label: 'API Specification',
      },
    };
    return configs[type];
  }
}
