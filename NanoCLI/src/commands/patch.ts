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

export class PatchCommand {
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

  async execute(filePath: string, instruction: string, options: any) {
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

    // 1. System Prompt for Patching
    messages.push({
      role: 'system',
      content: `You are an expert software engineer. Provide a code patch for the provided file based on the user's instruction.
Your goal is to:
1. Provide the changes in a clear format (Unified Diff or a single code block with the updated file).
2. Ensure the changes are minimal and maintainable.
3. Follow the existing code style of the file.

Provide the patch/updated code inside a Markdown code block.`
    });

    // 2. Add File and Instruction Context
    messages.push({
      role: 'user',
      content: `File: ${fileName}\nInstruction: ${instruction}\n\nCurrent Content:\n\`\`\`\n${fileContent}\n\`\`\``
    });

    // 3. Compact Context
    const compactedMessages = this.compactor.compactMessages(messages, mode);

    // 4. Cost Guard Info
    const modelMetadata = await this.modelManager.getModel(modelId);
    if (modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1000);
      if (estimatedCost > 0.05) {
        Renderer.printStatus(`Estimasi biaya pembuatan patch: $${estimatedCost.toFixed(4)} USD.`, 'warn');
      }
    }

    Renderer.printStatus(`Sedang membuat saran perubahan untuk ${chalk.bold(fileName)}...`, 'info');

    // 5. Stream Response
    process.stdout.write(chalk.yellow('\nPatch Suggestion:\n'));
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
