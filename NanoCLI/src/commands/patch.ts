import path from 'path';
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
import { safeReadTextFile } from '../files/safeFileReader';
import { PatchApplicator } from '../file/patchApplicator';
import { FileOperationManager } from '../file/fileOperationManager';

export class PatchCommand {
  private configManager: ConfigManager;
  private memoryManager: MemoryManager;
  private tokenManager: TokenBudgetManager;
  private compactor: ContextCompactor;
  private statsManager: StatsManager;
  private modelManager: ModelManager;
  private patchApplicator: PatchApplicator;
  private fileManager: FileOperationManager;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.compactor = new ContextCompactor();
    this.statsManager = new StatsManager(projectRoot);
    this.modelManager = new ModelManager(projectRoot);
    this.patchApplicator = new PatchApplicator();
    this.fileManager = new FileOperationManager(projectRoot);
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

    // 2. Project Context — enriched query: style, patterns, dan implementation hints
    const enrichedPatchQuery = [
      instruction.slice(0, 200),
      `implementation pattern refactoring coding style`,
      // BUG-07 fix: gunakan path yang sudah diimport di atas, bukan require() inline
      `file ${path.basename(fileName)}`,
    ].join(' ');
    const context = await this.memoryManager.getContextForQuery(enrichedPatchQuery);
    if (context) {
      messages.push({
        role: 'system',
        content: `Project Context (coding style, decisions to guide patch):\n${context}`
      });
    }

    // 3. Add File and Instruction Context
    messages.push({
      role: 'user',
      content: `File: ${fileName}\nInstruction: ${instruction}\n\nCurrent Content:\n\`\`\`\n${fileContent}\n\`\`\``
    });

    // 4. Fetch model metadata dan compact dengan model-aware budget
    const modelMetadata = await this.modelManager.getModel(modelId);
    const compactedMessages = this.compactor.compactMessages(messages, mode, modelMetadata?.context_length);

    // 5. Cost Guard Info
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

      // 7. Jika --apply diberikan, terapkan patch ke file
      if (options.apply) {
        Renderer.printStatus('Mengekstrak dan menerapkan patch...', 'info');
        const ext = path.extname(filePath);
        const extracted = this.patchApplicator.extract(fullResponse, ext);

        if (!extracted) {
          Renderer.printStatus('Tidak bisa mengekstrak patch dari respons AI. Pastikan AI menghasilkan code block.', 'error');
        } else {
          const newContent = this.patchApplicator.apply(fileContent, extracted);
          if (!newContent) {
            Renderer.printStatus('Patch gagal diapply. Coba dengan instruksi yang lebih spesifik.', 'error');
          } else {
            const writeResult = await this.fileManager.write(filePath, newContent, 'overwrite', {
              requireApproval: true,
              reason: instruction.slice(0, 80),
              showDiff: true,
            });
            this.fileManager.printResult(writeResult);
          }
        }
      }

      // 8. Log Usage
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
