import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { NanoMode, ModelConfig, VALID_MODES } from '../config/modes';

export interface Config {
  provider: {
    name: string;
    baseUrl: string;
    apiKeyEnv: string;
    stream: boolean;
    timeoutMs: number;
  };
  models: Record<NanoMode, ModelConfig>;
  chat: {
    defaultMode: NanoMode;
    openChatWhenNoArgs: boolean;
    saveSessions: boolean;
  };
}

export class ConfigManager {
  private configPath: string;
  private credentialsPath: string;
  private globalConfigDir: string;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, '.nanocli', 'config.json');
    this.globalConfigDir = path.join(os.homedir(), '.nanocli');
    // Credential disimpan global di home dir agar tidak ikut commit
    this.credentialsPath = path.join(this.globalConfigDir, 'credentials.json');
  }

  async getConfig(): Promise<Partial<Config>> {
    if (await fs.pathExists(this.configPath)) {
      return await fs.readJson(this.configPath);
    }
    return {};
  }

  async saveConfig(config: Partial<Config>): Promise<void> {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, config, { spaces: 2 });
  }

  async setModelForMode(mode: NanoMode, modelId: string): Promise<void> {
    const config = await this.getConfig();
    const defaultConfig = this.getDefaultConfig();

    const newConfig: Config = {
      ...defaultConfig,
      ...config,
      models: {
        ...defaultConfig.models,
        ...(config.models || {}),
        [mode]: {
          id: modelId,
          fallback: config.models?.[mode]?.fallback || []
        }
      }
    };

    await this.saveConfig(newConfig);
  }

  async getModelForMode(mode: string): Promise<string> {
    const config = await this.getConfig();
    const defaultConfig = this.getDefaultConfig();

    // Normalisasi: jika mode tidak valid, fallback ke 'normal'
    const safeMode = VALID_MODES.includes(mode as NanoMode) ? (mode as NanoMode) : 'normal';
    const modelConfig = config.models?.[safeMode] || defaultConfig.models[safeMode];
    return modelConfig.id;
  }

  async getModelConfigForMode(mode: NanoMode): Promise<ModelConfig> {
    const config = await this.getConfig();
    const defaultConfig = this.getDefaultConfig();
    return config.models?.[mode] || defaultConfig.models[mode];
  }

  /**
   * Mengembalikan model utama dan array fallback untuk digunakan di OpenRouter request.
   * Gunakan ini saat mengirim request agar fallback model aktif.
   *
   * @example
   * const routing = await configManager.getModelRoutingForMode('normal');
   * client.streamChat({ ...routing, messages, stream: true });
   */
  async getModelRoutingForMode(mode: string): Promise<{ model: string; models: string[] }> {
    const { normalizeMode } = await import('../config/modes');
    const config = await this.getModelConfigForMode(normalizeMode(mode));
    const models = [config.id, ...(config.fallback ?? [])].filter(Boolean);
    return { model: config.id, models };
  }

  async getApiKey(): Promise<string | undefined> {
    // Prioritas 1: Environment Variable
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) return envKey;

    // Prioritas 2: Global credentials file
    if (await fs.pathExists(this.credentialsPath)) {
      const creds = await fs.readJson(this.credentialsPath);
      return creds.apiKey;
    }

    return undefined;
  }

  async saveApiKey(apiKey: string): Promise<void> {
    await fs.ensureDir(path.dirname(this.credentialsPath));
    await fs.writeJson(this.credentialsPath, { apiKey }, { spaces: 2 });

    // Pastikan .nanocli/ ada di .gitignore project
    await this.ensureProjectGitignore();
  }

  async deleteApiKey(): Promise<void> {
    if (await fs.pathExists(this.credentialsPath)) {
      await fs.remove(this.credentialsPath);
    }
  }

  async getApiKeySource(): Promise<'env' | 'file' | 'none'> {
    if (process.env.OPENROUTER_API_KEY) return 'env';
    if (await fs.pathExists(this.credentialsPath)) return 'file';
    return 'none';
  }

  /**
   * Fix Bug 3.2: isFirstRun tidak boleh blokir user yang punya ENV key.
   * Hanya cek apakah API key tersedia, bukan apakah config file ada.
   */
  async isFirstRun(): Promise<boolean> {
    const hasApiKey = !!(await this.getApiKey());
    return !hasApiKey;
  }

  /**
   * Memastikan entry .nanocli/ ada di .gitignore project.
   * Dibuat otomatis jika file tidak ada.
   */
  async ensureProjectGitignore(): Promise<void> {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    const entry = '.nanocli/\n';

    if (!(await fs.pathExists(gitignorePath))) {
      await fs.writeFile(gitignorePath, entry, 'utf-8');
      return;
    }

    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.nanocli/')) {
      await fs.appendFile(gitignorePath, `\n${entry}`);
    }
  }

  getDefaultConfig(): Config {
    return {
      provider: {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        stream: true,
        timeoutMs: 120000
      },
      models: {
        // Fix Bug 3.1: key konsisten memakai 'extra-high' bukan 'extraHigh'
        'fast': { id: 'openrouter/free', fallback: ['openrouter/auto'] },
        'normal': { id: 'openrouter/auto', fallback: ['openrouter/free'] },
        'high': { id: 'openrouter/auto', fallback: [] },
        'extra-high': { id: 'openrouter/auto', fallback: [] }
      },
      chat: {
        defaultMode: 'normal',
        openChatWhenNoArgs: true,
        saveSessions: true
      }
    };
  }
}
