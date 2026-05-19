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

export class ReviewCommand {
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

    // 1. System Prompt for Review
    messages.push({
      role: 'system',
      content: `You are an expert code reviewer. Review the provided code for:
- Correctness and potential bugs
- Security vulnerabilities
- Performance optimizations
- Maintainability and best practices
- Consistency with common coding standards

Provide your feedback in a structured Markdown format with clear headings.`
    });

    // 2. Add File Context
    messages.push({
      role: 'user',
      content: `Please review this file: ${fileName}\n\nContent:\n\`\`\`\n${fileContent}\n\`\`\``
    });

    // 3. Compact Context
    const compactedMessages = this.compactor.compactMessages(messages, mode);

    // 4. Cost Guard Info
    const modelMetadata = await this.modelManager.getModel(modelId);
    if (modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1000);
      if (estimatedCost > 0.05) {
        Renderer.printStatus(`Estimasi biaya review: $${estimatedCost.toFixed(4)} USD.`, 'warn');
      }
    }

    Renderer.printStatus(`Sedang me-review ${chalk.bold(fileName)}...`, 'info');

    // 5. Stream Response
    process.stdout.write(chalk.cyan('\nReview Result:\n'));
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

      // 6. Log Usage
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
}
