const { Password, Select } = require('enquirer');
import chalk from 'chalk';
import { ConfigManager } from '../files/configManager';
import { OpenRouterClient } from '../llm/openrouterClient';

export class SetupUI {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async startSetup() {
    console.log(chalk.cyan('\n┌──────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│ NanoCLI Setup                                │'));
    console.log(chalk.cyan('└──────────────────────────────────────────────┘\n'));

    const prompt = new Select({
      name: 'method',
      message: 'Pilih metode konfigurasi API Key:',
      choices: [
        { name: 'manual', message: 'Masukkan API key sekarang (disimpan lokal)' },
        { name: 'env', message: 'Gunakan environment variable (OPENROUTER_API_KEY)' },
        { name: 'skip', message: 'Lewati untuk sekarang' }
      ]
    });

    const method = await prompt.run();

    if (method === 'manual') {
      await this.setupManualKey();
    } else if (method === 'env') {
      await this.setupEnvKey();
    } else {
      console.log(chalk.yellow('\nSetup dilewati. Beberapa fitur mungkin tidak berfungsi.'));
    }
  }

  public async setupManualKey() {
    const passwordPrompt = new Password({
      name: 'key',
      message: 'Masukkan OpenRouter API Key:'
    });

    const apiKey = await passwordPrompt.run();

    if (!apiKey) {
      console.log(chalk.red('API Key tidak boleh kosong.'));
      return;
    }

    console.log(chalk.gray('Memvalidasi API Key...'));
    
    const client = new OpenRouterClient(apiKey);
    try {
      // Validasi dengan mencoba mengambil daftar model (request ringan)
      await client.getModels();
      
      // Simpan ke config dasar jika belum ada
      const currentConfig = await this.configManager.getConfig();
      if (Object.keys(currentConfig).length === 0) {
        await this.configManager.saveConfig(this.configManager.getDefaultConfig());
      }

      // Simpan API Key secara aman (terpisah dari config.json)
      await this.configManager.saveApiKey(apiKey);

      console.log(chalk.green('\n✔ API Key berhasil divalidasi dan disimpan secara aman!'));
    } catch (error: any) {
      console.log(chalk.red(`\n✘ Validasi gagal: ${error.message}`));
      console.log(chalk.yellow('Pastikan API Key Anda benar dan coba lagi.'));
    }
  }

  public async setupEnvKey() {
    console.log(chalk.blue('\nInstruksi Environment Variable:'));
    console.log(chalk.white('1. Tambahkan ke shell profile Anda (.bashrc, .zshrc, dll):'));
    console.log(chalk.cyan('   export OPENROUTER_API_KEY="your_key_here"'));
    console.log(chalk.white('2. Restart terminal Anda.'));
    
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) {
      console.log(chalk.green('\n✔ OPENROUTER_API_KEY terdeteksi di environment saat ini.'));
    } else {
      console.log(chalk.yellow('\n! OPENROUTER_API_KEY belum terdeteksi di sesi ini.'));
    }
  }
}
