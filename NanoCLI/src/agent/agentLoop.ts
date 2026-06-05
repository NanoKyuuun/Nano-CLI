/**
 * agentLoop.ts
 *
 * Loop utama agent NanoCLI.
 *
 * Flow:
 * 1. Terima task dari user
 * 2. Build initial messages dengan system prompt agent
 * 3. Loop max N step:
 *    a. Request ke LLM
 *    b. Parse response → ToolRouter
 *    c. Jika type 'final' atau tidak ada tool call → break
 *    d. Tampilkan activity step
 *    e. Jalankan StepRunner
 *    f. Append hasil ke messages
 * 4. Render final summary
 */

import chalk from 'chalk';
import { OpenRouterClient, Message } from '../llm/openrouterClient';
import { ToolRouter } from './toolRouter';
import { StepRunner } from './stepRunner';
import {
  AgentAction,
  AgentMessage,
  AgentLoopOptions,
  AgentState,
  AgentStep,
  FinalAnswerAction,
} from './agentTypes';
import { MemoryManager } from '../memory/memoryManager';
import { ContextCompactor } from '../context/contextCompactor';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';
import { ModelManager } from '../llm/modelManager';
import { Renderer } from '../ui/render';

const AGENT_SYSTEM_PROMPT = `You are NanoCLI, a terminal-first AI coding agent.

You perform tasks by outputting structured actions. Each action has TWO parts:
1. A JSON header block (metadata only, NO file content inside)
2. A code block with the actual content (for file operations)

=== ACTION FORMATS ===

ACTION: Create or overwrite a file
Step 1 — JSON header:
\`\`\`json
{"type": "file.write", "path": "app/Http/Controllers/AuthController.php", "mode": "create", "reason": "Create authentication controller"}
\`\`\`
Step 2 — File content (immediately after, no text between):
\`\`\`php
<?php

namespace App\\Http\\Controllers;

// ... complete file content here
\`\`\`

ACTION: Run a terminal command (JSON only, no code block needed)
\`\`\`json
{"type": "terminal.run", "command": "php artisan migrate", "reason": "Run database migrations"}
\`\`\`

ACTION: Read a file before editing
\`\`\`json
{"type": "file.read", "path": "app/Models/User.php"}
\`\`\`

ACTION: Signal task completion
\`\`\`json
{"type": "final", "summary": "Created AuthController, updated routes, and ran migrations.", "filesChanged": ["app/Http/Controllers/AuthController.php"], "nextSteps": ["Add middleware"]}
\`\`\`

=== CRITICAL RULES ===
- Output EXACTLY ONE action per response (one JSON header + optional code block)
- NEVER put file content inside the JSON — always use a separate code block
- The code block must come IMMEDIATELY after the JSON block, no text between them
- When writing files, always output the COMPLETE file content, not snippets
- After all files are created, output the "final" action
- Explain your reasoning BEFORE the JSON block
- Respond in the same language the user uses`;

export class AgentLoop {
  private toolRouter: ToolRouter;
  private stepRunner: StepRunner;
  private memoryManager: MemoryManager;
  private compactor: ContextCompactor;
  private tokenManager: TokenBudgetManager;
  private modelManager: ModelManager;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.toolRouter = new ToolRouter();
    this.stepRunner = new StepRunner(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.compactor = new ContextCompactor();
    this.tokenManager = new TokenBudgetManager();
    this.modelManager = new ModelManager(projectRoot);
  }

  /**
   * Konversi AgentMessage[] (internal) ke Message[] yang diterima OpenRouter API.
   *
   * OpenRouter tidak menerima role 'tool' — wajib dikonversi ke role 'user'
   * dengan prefix yang jelas agar LLM tetap memahami konteks hasil eksekusi.
   */
  private normalizeMessagesForLLM(messages: AgentMessage[]): Message[] {
    return messages.map((msg, idx) => {
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: `[Tool Result - Step ${idx}]\n${msg.content}`,
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  async run(
    task: string,
    apiKey: string,
    options: AgentLoopOptions,
  ): Promise<AgentState> {
    const modelId = options.modelId ?? 'openrouter/auto';
    const client = new OpenRouterClient(apiKey);
    const modelMetadata = await this.modelManager.getModel(modelId);

    const state: AgentState = {
      task,
      messages: [],
      steps: [],
      filesChanged: [],
      commandsRun: [],
      startedAt: Date.now(),
      status: 'running',
    };

    // 1. Build initial messages
    state.messages.push({ role: 'system', content: AGENT_SYSTEM_PROMPT });

    // Inject project context
    const context = await this.memoryManager.getContextForQuery(task.slice(0, 200));
    if (context) {
      state.messages.push({
        role: 'system',
        content: `Project Context (existing code and decisions):\n${context}`,
      });
    }

    state.messages.push({ role: 'user', content: task });

    // 2. Print task header
    console.log();
    console.log(chalk.bold.cyan('  ╭─ Agent Task ') + chalk.cyan('─'.repeat(48) + '╮'));
    console.log(`  │ ${chalk.white(task.slice(0, 60))}`);
    console.log(`  │ ${chalk.gray('Max steps: ' + options.maxSteps + ' | Mode: ' + options.mode)}`);
    console.log(chalk.cyan('  ╰' + '─'.repeat(62) + '╯'));
    console.log();

    // 3. Agent loop
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    /**
     * Fingerprint setiap action berdasarkan (type, path/command).
     * Tidak menggunakan konten — perubahan minor konten tidak mencegah deteksi loop.
     */
    function fingerprintAction(action: AgentAction): string {
      switch (action.type) {
        case 'file.write':
        case 'file.patch':
        case 'file.read':
          return `${action.type}:${action.path}`;
        case 'terminal.run':
          return `terminal.run:${action.command}`;
        default:
          return action.type;
      }
    }

    // Map fingerprint → jumlah eksekusi
    const executedActionFingerprints = new Map<string, number>();

    for (let step = 1; step <= options.maxSteps; step++) {
      console.log(chalk.gray(`  ● Step ${step}/${options.maxSteps}`));

      // Compact messages
      const normalizedForLLM = this.normalizeMessagesForLLM(state.messages);
      const compacted = this.compactor.compactMessages(
        normalizedForLLM,
        options.mode,
        modelMetadata?.context_length,
      );

      // Cost guard per step — info jika token mulai banyak
      if (modelMetadata) {
        const stepTokens = this.tokenManager.countMessageTokens(compacted);
        const stepCost   = this.tokenManager.estimateCost(stepTokens, modelMetadata.pricing, 800);
        if (stepCost !== null && stepCost > 0.02) {
          Renderer.printStatus(
            `Estimasi biaya step ${step}: $${stepCost.toFixed(4)} USD (${stepTokens} token)`,
            'warn',
          );
        }
      }

      // Request LLM — tampilkan output secara real-time
      let fullResponse = '';
      try {
        // Header sebelum streaming dimulai
        const stepHeader = chalk.gray(`\n  ─── Step ${step}/${options.maxSteps} `) +
          chalk.cyan('thinking') + chalk.gray(' ─'.repeat(20));
        process.stdout.write(stepHeader + '\n\n');

        const stream = client.streamChat({
          model: modelId,
          messages: compacted,
          stream: true,
        });

        // Stream langsung ke terminal agar user bisa lihat apa yang dihasilkan AI
        for await (const chunk of stream) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }
        process.stdout.write('\n');

        // Separator setelah AI selesai
        process.stdout.write(chalk.gray('  ' + '─'.repeat(50) + '\n\n'));

      } catch (err: any) {
        Renderer.printStatus(`LLM error: ${err.message}`, 'error');
        state.status = 'error';
        break;
      }

      // Parse tool call dari response
      const parsed = this.toolRouter.parse(fullResponse);

      // Debug: tampilkan parse error dalam verbose mode
      if (!parsed.valid && options.verbose && parsed.error) {
        Renderer.printStatus(`Parse: ${parsed.error}`, 'warn');
      }

      if (!parsed.valid || !parsed.action) {
        // Tidak ada tool call — cek apakah ini final response
        if (this.toolRouter.isFinalResponse(fullResponse)) {
          console.log(chalk.green('  ✓ Agent menandai task selesai.'));
          state.messages.push({ role: 'assistant', content: fullResponse });
          state.status = 'completed';
          break;
        }

        // Respons narasi biasa — append ke messages dan lanjut
        state.messages.push({ role: 'assistant', content: fullResponse });
        if (options.verbose) {
          console.log(chalk.gray(`    Response: ${fullResponse.slice(0, 200)}...`));
        }
        continue;
      }

      const action = parsed.action;

      // Handle final action
      if (action.type === 'final') {
        const finalAction = action as FinalAnswerAction;
        state.messages.push({ role: 'assistant', content: fullResponse });
        state.status = 'completed';
        this.renderFinalSummary(finalAction, state);
        break;
      }

      // ── Duplicate Action Guard ────────────────────────────────────────────
      // Jika action non-final yang sama diulang ≥ 2x, hentikan agent.
      // Ini mencegah infinite loop ketika model tidak tahu task sudah selesai.
      const fp    = fingerprintAction(action);
      const count = (executedActionFingerprints.get(fp) ?? 0) + 1;
      executedActionFingerprints.set(fp, count);

      if (count >= 2) {
        Renderer.printStatus(
          `Agent berhenti: action yang sama diulang ${count}x (${fp}). ` +
          `Kemungkinan task sudah selesai atau agent tidak bisa melanjutkan. Coba perinci task-nya.`,
          'warn',
        );
        state.status = 'error';
        this.renderPartialSummary(state);
        return state;
      }
      // ─────────────────────────────────────────────────────────────────────

      // Tampilkan action yang akan dijalankan
      this.printActionPreview(action);

      if (options.dryRun) {
        console.log(chalk.yellow('    [DRY RUN] Action tidak dieksekusi.'));
        state.messages.push({
          role: 'tool',
          content: `[DRY RUN] Action would execute: ${JSON.stringify(action)}`,
        });
        continue;
      }

      // Jalankan action — teruskan options agar permission policy di-enforce
      const result = await this.stepRunner.run(action, options);

      // Track perubahan
      if (action.type === 'file.write' || action.type === 'file.patch') {
        if (result.success) state.filesChanged.push((action as any).path);
      }
      if (action.type === 'terminal.run') {
        if (result.success) state.commandsRun.push(action.command);
      }

      // Simpan step
      const agentStep: AgentStep = {
        stepIndex: step,
        action,
        result,
        timestamp: Date.now(),
      };
      state.steps.push(agentStep);

      // Hasil ke messages
      state.messages.push({ role: 'assistant', content: fullResponse });
      state.messages.push({
        role: 'tool',
        content: `Step ${step} result: ${result.success ? 'SUCCESS' : 'FAILED'}\n${result.output.slice(0, 3000)}`,
      });

      if (options.verbose || !result.success) {
        const icon = result.success ? chalk.green('✓') : chalk.red('✗');
        console.log(`    ${icon} ${result.output.slice(0, 120)}`);
      }

      // Consecutive failure guard
      if (!result.success) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          Renderer.printStatus(
            `Agent berhenti: ${MAX_CONSECUTIVE_FAILURES} step berturut-turut gagal. Periksa konfigurasi atau berikan task yang lebih spesifik.`,
            'error',
          );
          state.status = 'error';
          this.renderPartialSummary(state);
          return state;
        }
      } else {
        consecutiveFailures = 0; // reset jika step berhasil
      }
    }

    if (state.status === 'running') {
      state.status = 'max_step_reached';
      Renderer.printStatus(`Max step (${options.maxSteps}) tercapai. Agent berhenti.`, 'warn');
      this.renderPartialSummary(state);
    }

    return state;
  }

  // ─── Private Render Helpers ──────────────────────────────────────────────

  private printActionPreview(action: AgentAction): void {
    const typeColors: Record<string, chalk.Chalk> = {
      'terminal.run': chalk.yellow,
      'file.write': chalk.blue,
      'file.patch': chalk.magenta,
      'file.read': chalk.cyan,
    };
    const color = typeColors[action.type] ?? chalk.white;
    const details = action.type === 'terminal.run'
      ? action.command
      : (action as any).path ?? '';
    console.log(`    ${color('→')} ${chalk.bold(action.type)} ${chalk.white(details)}`);
  }

  private renderFinalSummary(action: FinalAnswerAction, state: AgentState): void {
    const duration = ((Date.now() - state.startedAt) / 1000).toFixed(1);
    console.log();
    console.log(chalk.bold.green('  ╭─ Task Completed ') + chalk.green('─'.repeat(43) + '╮'));
    console.log(`  │ ${chalk.gray('Duration')} : ${chalk.white(duration + 's')}`);
    console.log(`  │ ${chalk.gray('Steps')}    : ${chalk.white(String(state.steps.length))}`);

    if (state.filesChanged.length > 0) {
      console.log(`  │`);
      console.log(`  │ ${chalk.gray('Files changed:')}`);
      state.filesChanged.forEach(f => console.log(`  │   ${chalk.green('+')} ${f}`));
    }

    if (state.commandsRun.length > 0) {
      console.log(`  │`);
      console.log(`  │ ${chalk.gray('Commands run:')}`);
      state.commandsRun.forEach(c => console.log(`  │   ${chalk.yellow('$')} ${c}`));
    }

    if (action.nextSteps && action.nextSteps.length > 0) {
      console.log(`  │`);
      console.log(`  │ ${chalk.gray('Next steps:')}`);
      action.nextSteps.forEach((s, i) => console.log(`  │   ${chalk.cyan(`${i + 1}.`)} ${s}`));
    }

    console.log(`  │`);
    console.log(`  │ ${chalk.white(action.summary)}`);
    console.log(chalk.green('  ╰' + '─'.repeat(62) + '╯'));
    console.log();
  }

  private renderPartialSummary(state: AgentState): void {
    const duration = ((Date.now() - state.startedAt) / 1000).toFixed(1);
    console.log();
    console.log(chalk.yellow('  Summary:'));
    console.log(chalk.gray(`  Duration: ${duration}s | Steps: ${state.steps.length}`));
    if (state.filesChanged.length > 0) {
      console.log(chalk.gray(`  Files: ${state.filesChanged.join(', ')}`));
    }
  }
}
