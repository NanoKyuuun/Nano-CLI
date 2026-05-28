/**
 * agent.ts
 *
 * Command: nanocli agent "<task>"
 *
 * Menjalankan workflow agentik multi-step.
 *   nanocli agent "buat PRD dan implementation plan untuk fitur login JWT"
 *   nanocli agent "fix error build lalu jalankan test" --max-steps 5
 *   nanocli agent "review dan perbaiki src/auth.ts" --dry-run
 */

import { ConfigManager } from '../files/configManager';
import { AgentLoop } from '../agent/agentLoop';
import { AgentLoopOptions } from '../agent/agentTypes';
import { Renderer } from '../ui/render';
import { isValidMode, VALID_MODES } from '../config/modes';

export class AgentCommand {
  private configManager: ConfigManager;
  private agentLoop: AgentLoop;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.agentLoop = new AgentLoop(projectRoot);
  }

  async execute(task: string, options: any) {
    const mode = options.mode || 'high';

    if (!isValidMode(mode)) {
      Renderer.printStatus(`Mode tidak valid: "${mode}". Pilih salah satu: ${VALID_MODES.join(', ')}`, 'error');
      return;
    }

    const apiKey = await this.configManager.getApiKey();
    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    const modelId = options.model || await this.configManager.getModelForMode(mode);

    const loopOptions: AgentLoopOptions = {
      maxSteps: parseInt(options.maxSteps ?? '8', 10),
      mode,
      modelId,
      permission: options.permission ?? 'workspace',
      dryRun: options.dryRun ?? false,
      verbose: options.verbose ?? false,
    };

    try {
      await this.agentLoop.run(task, apiKey, loopOptions);
    } catch (err: any) {
      Renderer.printStatus(`Agent error: ${err.message}`, 'error');
    }
  }
}
