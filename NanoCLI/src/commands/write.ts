/**
 * write.ts
 *
 * Command: nanocli write <path> <prompt>
 *
 * Membuat atau menimpa file dari prompt menggunakan AI.
 * Menampilkan preview dan approval sebelum menulis.
 *
 * Contoh:
 *   nanocli write docs/PRD-login.md "Buat PRD fitur login JWT"
 *   nanocli write src/auth.ts "Buat auth service dengan JWT" --mode high
 *   nanocli write README.md "Buat README untuk project ini" --overwrite
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
import { Renderer } from '../ui/render';
import { isValidMode, VALID_MODES } from '../config/modes';
import { StatsManager } from '../tokens/statsManager';

export class WriteCommand {
  private configManager: ConfigManager;
  private memoryManager: MemoryManager;
  private tokenManager: TokenBudgetManager;
  private compactor: ContextCompactor;
  private modelManager: ModelManager;
  private fileManager: FileOperationManager;
  private statsManager: StatsManager;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.compactor = new ContextCompactor();
    this.modelManager = new ModelManager(projectRoot);
    this.fileManager = new FileOperationManager(projectRoot);
    this.statsManager = new StatsManager(projectRoot);
  }

  async execute(filePath: string, prompt: string, options: any) {
    const mode = options.mode || 'high';
    const overwrite: boolean = options.overwrite ?? false;

    if (!isValidMode(mode)) {
      Renderer.printStatus(`Mode tidak valid: "${mode}". Pilih salah satu: ${VALID_MODES.join(', ')}`, 'error');
      return;
    }

    const apiKey = await this.configManager.getApiKey();
    const modelId = options.model || await this.configManager.getModelForMode(mode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    // Tentukan mode write berdasarkan apakah file sudah ada
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    const fileExists = await fs.pathExists(absPath);
    const writeMode = fileExists
      ? (overwrite ? 'overwrite' : 'create')
      : 'create';

    if (fileExists && !overwrite) {
      Renderer.printStatus(
        `File sudah ada: ${filePath}. Gunakan --overwrite untuk menimpa.`,
        'warn',
      );
      return;
    }

    // Deteksi extension untuk membantu AI menentukan format
    const ext = path.extname(filePath).slice(1) || 'markdown';

    const client = new OpenRouterClient(apiKey);
    const messages: Message[] = [];

    // 1. System prompt
    messages.push({
      role: 'system',
      content: `You are an expert technical writer and senior engineer.
Generate the complete content for a ${ext} file based on the user's request.
Rules:
- Output ONLY the file content, with NO markdown wrapper or explanation
- The content must be ready to save directly to the file
- Match the style and conventions of the project if context is available
- Be thorough and complete — do not use placeholders like "add content here"`,
    });

    // 2. Project context
    const context = await this.memoryManager.getContextForQuery(
      `${prompt.slice(0, 200)} file content ${ext}`,
    );
    if (context) {
      messages.push({ role: 'system', content: `Project Context:\n${context}` });
    }

    // 3. User request
    messages.push({
      role: 'user',
      content: `Create the content for file: ${filePath}\n\nRequirement: ${prompt}\n\nOutput only the file content, ready to be saved.`,
    });

    // 4. Compact
    const modelMetadata = await this.modelManager.getModel(modelId);
    const compactedMessages = this.compactor.compactMessages(messages, mode, modelMetadata?.context_length);

    Renderer.printStatus(`Generating content for ${chalk.bold(filePath)}...`, 'info');

    // 5. Stream response
    let fullContent = '';
    process.stdout.write(chalk.gray('\n  Generating...\n'));
    try {
      const stream = client.streamChat({ model: modelId, messages: compactedMessages, stream: true });
      for await (const chunk of stream) {
        process.stdout.write(chalk.gray('.'));
        fullContent += chunk;
      }
      process.stdout.write('\n\n');
    } catch (err: any) {
      Renderer.printStatus(err.message, 'error');
      return;
    }

    // 6. Tulis file dengan approval
    const result = await this.fileManager.write(filePath, fullContent, writeMode, {
      requireApproval: true,
      reason: prompt.slice(0, 100),
      showDiff: fileExists,
    });

    this.fileManager.printResult(result);

    // 7. Log usage
    if (result.success && modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const outputTokens = this.tokenManager.countTextTokens(fullContent);
      const costUsd = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);
      await this.statsManager.logUsage({ timestamp: Date.now(), modelId, mode, inputTokens, outputTokens, costUsd });
    }
  }
}
