import fs from 'fs-extra';
import path from 'path';
import { OpenRouterClient } from './openrouterClient';
import { ConfigManager } from '../files/configManager';
import chalk from 'chalk';

export interface ModelMetadata {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export class ModelManager {
  private cachePath: string;
  private ttl: number = 24 * 60 * 60 * 1000; // 24 hours in ms
  private configManager: ConfigManager;
  /** BUG-05 fix: in-memory cache agar getModels() tidak repeat disk/network per command. */
  private inMemoryCache: ModelMetadata[] | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.cachePath = path.join(projectRoot, '.nanocli', 'cache', 'model_list.json');
    this.configManager = new ConfigManager(projectRoot);
  }

  async getModels(forceRefresh: boolean = false): Promise<ModelMetadata[]> {
    // BUG-05 fix: in-memory cache — skip disk I/O jika sudah ada di memori
    if (!forceRefresh && this.inMemoryCache) {
      return this.inMemoryCache;
    }

    if (!forceRefresh && await this.isCacheValid()) {
      const cache = await fs.readJson(this.cachePath);
      this.inMemoryCache = cache.models;
      return this.inMemoryCache!;
    }

    return await this.refreshModels();
  }

  async refreshModels(): Promise<ModelMetadata[]> {
    const apiKey = await this.configManager.getApiKey();
    if (!apiKey) {
      throw new Error('API Key tidak ditemukan. Jalankan "nanocli auth login" terlebih dahulu.');
    }

    const client = new OpenRouterClient(apiKey);
    console.log(chalk.gray('Mengambil daftar model terbaru dari OpenRouter...'));
    
    const response = await client.getModels();
    const models: ModelMetadata[] = response.data.map((m: any) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      context_length: m.context_length,
      pricing: m.pricing
    }));

    await fs.ensureDir(path.dirname(this.cachePath));
    await fs.writeJson(this.cachePath, {
      timestamp: Date.now(),
      models
    }, { spaces: 2 });

    // Update in-memory cache setelah refresh
    this.inMemoryCache = models;
    return models;
  }

  async getModel(modelId: string): Promise<ModelMetadata | undefined> {
    const models = await this.getModels();
    return models.find(m => m.id === modelId);
  }

  private async isCacheValid(): Promise<boolean> {
    if (!(await fs.pathExists(this.cachePath))) return false;
    
    const cache = await fs.readJson(this.cachePath);
    const now = Date.now();
    return (now - cache.timestamp) < this.ttl;
  }

  async searchModels(keyword: string): Promise<ModelMetadata[]> {
    const models = await this.getModels();
    const lowerKeyword = keyword.toLowerCase();
    return models.filter(m => 
      m.id.toLowerCase().includes(lowerKeyword) || 
      m.name.toLowerCase().includes(lowerKeyword) ||
      (m.description && m.description.toLowerCase().includes(lowerKeyword))
    );
  }
}
