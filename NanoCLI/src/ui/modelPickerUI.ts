const { AutoComplete } = require('enquirer');
import chalk from 'chalk';
import { ModelManager, ModelMetadata } from '../llm/modelManager';

export class ModelPickerUI {
  private modelManager: ModelManager;

  constructor(projectRoot: string = process.cwd()) {
    this.modelManager = new ModelManager(projectRoot);
  }

  async pickModel(message: string = 'Pilih model OpenRouter:'): Promise<string | undefined> {
    try {
      const models = await this.modelManager.getModels();
      
      if (models.length === 0) {
        console.log(chalk.yellow('Daftar model kosong. Coba jalankan "nanocli models list --refresh".'));
        return undefined;
      }

      const choices = models.map(m => ({
        name: m.id,
        message: `${m.id} (${m.name})`,
        value: m.id,
        hint: `Context: ${Math.floor(m.context_length / 1024)}K`
      }));

      const prompt = new AutoComplete({
        name: 'model',
        message: message,
        limit: 10,
        initial: 0,
        choices: choices,
        footer: () => chalk.gray('\n(Gunakan panah untuk navigasi, ketik untuk mencari, Enter untuk memilih)')
      });

      const selectedId = await prompt.run();
      
      // Tampilkan detail singkat setelah dipilih
      const selectedModel = models.find(m => m.id === selectedId);
      if (selectedModel) {
        this.displayModelDetail(selectedModel);
      }

      return selectedId;
    } catch (error: any) {
      if (error === '') return undefined; // User cancelled with Esc/Ctrl+C
      console.log(chalk.red(`Error saat memilih model: ${error.message}`));
      return undefined;
    }
  }

  private displayModelDetail(model: ModelMetadata) {
    console.log(chalk.cyan('\n┌──────────────────────────────────────────────┐'));
    console.log(chalk.cyan(`│ Detail Model: ${model.id.substring(0, 30).padEnd(30)} │`));
    console.log(chalk.cyan('├──────────────────────────────────────────────┤'));
    console.log(chalk.white(`│ Nama: ${model.name.padEnd(38)} │`));
    console.log(chalk.white(`│ Context: ${(model.context_length.toLocaleString() + ' tokens').padEnd(35)} │`));
    console.log(chalk.white(`│ Harga Input: $${parseFloat(model.pricing.prompt).toFixed(6).padEnd(30)} │`));
    console.log(chalk.white(`│ Harga Output: $${parseFloat(model.pricing.completion).toFixed(6).padEnd(29)} │`));
    console.log(chalk.cyan('└──────────────────────────────────────────────┘\n'));
  }
}
