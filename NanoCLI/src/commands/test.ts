import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { ConfigManager } from '../files/configManager';
import { OpenRouterClient, Message } from '../llm/openrouterClient';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';
import { ContextCompactor } from '../context/contextCompactor';
import { StatsManager } from '../tokens/statsManager';
import { ModelManager } from '../llm/modelManager';
import { Renderer } from '../ui/render';
import { isValidMode, VALID_MODES } from '../config/modes';
import { safeReadTextFile } from '../files/safeFileReader';

export class TestCommand {
  private configManager: ConfigManager;
  private tokenManager: TokenBudgetManager;
  private compactor: ContextCompactor;
  private statsManager: StatsManager;
  private modelManager: ModelManager;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.compactor = new ContextCompactor();
    this.statsManager = new StatsManager(projectRoot);
    this.modelManager = new ModelManager(projectRoot);
  }

  async execute(filePath: string, options: any) {
    const mode = options.mode || 'normal';

    // Fix Bug 3.3: validasi mode
    if (!isValidMode(mode)) {
      Renderer.printStatus(`Mode tidak valid: "${mode}". Pilih salah satu: ${VALID_MODES.join(', ')}`, 'error');
      return;
    }

    const framework = options.framework || 'vitest';
    const apiKey = await this.configManager.getApiKey();
    const modelId = options.model || await this.configManager.getModelForMode(mode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    let fileResult;
    try {
      fileResult = await safeReadTextFile(filePath, {
        projectRoot: process.cwd(),
        maxBytes: 100_000,
      });
    } catch (err: any) {
      Renderer.printStatus(err.message, 'error');
      return;
    }

    const { content: fileContent, relativePath: fileName } = fileResult;

    const client = new OpenRouterClient(apiKey);
    const messages: Message[] = [];

    // 1. System Prompt for Test Generation
    messages.push({
      role: 'system',
      content: `You are an expert software tester. Generate comprehensive unit tests for the provided code.
Your goal is to:
1. Use the ${framework} testing framework.
2. Cover edge cases, success paths, and error scenarios.
3. Follow best practices for unit testing (AAA pattern, descriptive names).
4. Ensure the generated code is ready to be saved and run.

Provide only the test code inside a single Markdown code block.`
    });

    // 2. Add File Context
    messages.push({
      role: 'user',
      content: `Generate unit tests for this file: ${fileName}\n\nContent:\n\`\`\`\n${fileContent}\n\`\`\``
    });

    // 3. Compact Context
    const compactedMessages = this.compactor.compactMessages(messages, mode);

    // 4. Cost Guard Info
    const modelMetadata = await this.modelManager.getModel(modelId);
    if (modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1500);
      if (estimatedCost > 0.05) {
        Renderer.printStatus(`Estimasi biaya pembuatan test: $${estimatedCost.toFixed(4)} USD.`, 'warn');
      }
    }

    Renderer.printStatus(`Sedang membuat unit test untuk ${chalk.bold(fileName)} menggunakan ${chalk.bold(framework)}...`, 'info');

    // 5. Stream Response
    process.stdout.write(chalk.magenta('\nGenerated Test Code:\n'));
    let fullResponse = '';
    try {
      const stream = client.streamChat({
        model: modelId,
        messages: compactedMessages,
        stream: true
      });

      for await (const chunk of stream) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      process.stdout.write('\n\n');

      // 6. Handle --write option
      if (options.write) {
        await this.handleWrite(filePath, fullResponse, options.overwrite ?? false);
      }

      // 7. Log Usage
      if (modelMetadata) {
        const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
        const outputTokens = this.tokenManager.countTextTokens(fullResponse);
        const costUsd = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);

        await this.statsManager.logUsage({
          timestamp: Date.now(),
          modelId,
          mode,
          inputTokens,
          outputTokens,
          costUsd
        });
      }

    } catch (error: any) {
      Renderer.printStatus(error.message, 'error');
    }
  }

  private async handleWrite(originalPath: string, aiResponse: string, overwrite: boolean = false) {
    // Extract code from markdown block
    const codeMatch = aiResponse.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (!codeMatch || !codeMatch[1]) {
      Renderer.printStatus('Gagal mengekstrak kode test dari respon AI.', 'error');
      return;
    }

    const testCode = codeMatch[1].trim();
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const testPath = path.join(dir, `${base}.test${ext}`);

    // Fix Bug 3.11: cek apakah file test sudah ada sebelum menimpa
    if (!overwrite && await fs.pathExists(testPath)) {
      Renderer.printStatus(
        `File test sudah ada: ${chalk.bold(testPath)}. Gunakan --overwrite untuk menimpa.`,
        'warn'
      );
      return;
    }

    try {
      await fs.writeFile(testPath, testCode, 'utf-8');
      Renderer.printStatus(`File test berhasil ditulis ke: ${chalk.bold(testPath)}`, 'success');
    } catch (error: any) {
      Renderer.printStatus(`Gagal menulis file test: ${error.message}`, 'error');
    }
  }
}
