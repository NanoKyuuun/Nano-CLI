import chalk from 'chalk';
import { ConfigManager } from '../files/configManager';
import { OpenRouterClient, Message } from '../llm/openrouterClient';
import { MemoryManager } from '../memory/memoryManager';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';
import { ContextCompactor } from '../context/contextCompactor';
import { StatsManager } from '../tokens/statsManager';
import { ModelManager } from '../llm/modelManager';
import { Renderer } from '../ui/render';
import { isValidMode, VALID_MODES } from '../config/modes';

export class PlanCommand {
  private configManager: ConfigManager;
  private memoryManager: MemoryManager;
  private tokenManager: TokenBudgetManager;
  private compactor: ContextCompactor;
  private statsManager: StatsManager;
  private modelManager: ModelManager;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.compactor = new ContextCompactor();
    this.statsManager = new StatsManager(projectRoot);
    this.modelManager = new ModelManager(projectRoot);
  }

  async execute(prompt: string, options: any) {
    const mode = options.mode || 'high';

    if (!isValidMode(mode)) {
      Renderer.printStatus(`Mode tidak valid: "${mode}". Pilih salah satu: ${VALID_MODES.join(', ')}`, 'error');
      return;
    }

    const apiKey = await this.configManager.getApiKey();
    let modelId = options.model || await this.configManager.getModelForMode(mode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    const client = new OpenRouterClient(apiKey);
    const messages: Message[] = [];

    // 1. System Prompt for Planning
    messages.push({
      role: 'system',
      content: `You are an expert software architect. Create a detailed implementation plan for the requested feature.
Your plan should include:
1. Summary of requirements.
2. List of files that might be affected.
3. Step-by-step implementation steps.
4. Potential risks or technical debt.
5. Suggested verification/testing steps.

Use project context to ensure the plan aligns with existing architecture and tech stack.`
    });

    // 2. Add Project Context
    const context = await this.memoryManager.getContextForQuery(prompt);
    if (context) {
      messages.push({
        role: 'system',
        content: `Current Project Context:\n${context}`
      });
    }

    // 3. Add User Request
    messages.push({ role: 'user', content: `Plan this feature: ${prompt}` });

    // 4. Compact Context
    const compactedMessages = this.compactor.compactMessages(messages, mode);
    
    // 5. Cost Guard Info
    const modelMetadata = await this.modelManager.getModel(modelId);
    if (modelMetadata) {
      const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
      const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1500);
      
      if (estimatedCost > 0.05) {
        Renderer.printStatus(`Estimasi biaya pembuatan plan: $${estimatedCost.toFixed(4)} USD.`, 'warn');
      }
    }

    Renderer.printStatus(`Sedang menyusun rencana implementasi...`, 'info');

    // 6. Stream Response
    process.stdout.write(chalk.blue('\nImplementation Plan:\n'));
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

      // 7. Log Usage
      if (modelMetadata) {
        const inputTokens = this.tokenManager.countMessageTokens(compactedMessages);
        const outputTokens = this.tokenManager.countTextTokens(fullResponse);
        const costUsd = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);

        await this.statsManager.logUsage({
          timestamp: Date.now(),
          modelId: modelId,
          mode: mode,
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
