import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './files/configManager';
import { SetupUI } from './ui/setupUI';
import { ModelManager } from './llm/modelManager';
import { ModelPickerUI } from './ui/modelPickerUI';
import { ChatUI } from './ui/chatUI';
import { Renderer } from './ui/render';
import { StatsManager } from './tokens/statsManager';
import { MemoryManager } from './memory/memoryManager';
import { AskCommand } from './commands/ask';
import { ReviewCommand } from './commands/review';
import { DebugCommand } from './commands/debug';
import { TestCommand } from './commands/test';
import { PlanCommand } from './commands/plan';
import { PatchCommand } from './commands/patch';
import { SearchCommand } from './commands/search';

const program = new Command();
const configManager = new ConfigManager();
const setupUI = new SetupUI();
const modelManager = new ModelManager();
const modelPickerUI = new ModelPickerUI();
const chatUI = new ChatUI();
const statsManager = new StatsManager();
const memoryManager = new MemoryManager();
const askCommand = new AskCommand();
const reviewCommand = new ReviewCommand();
const debugCommand = new DebugCommand();
const testCommand = new TestCommand();
const planCommand = new PlanCommand();
const patchCommand = new PatchCommand();
const searchCommand = new SearchCommand();

program
  .name('nanocli')
  .description('AI Coding Assistant berbasis CLI dengan TypeScript, OpenRouter API, dan Project Memory')
  .version('1.0.0');

// Middleware-like check for onboarding
async function checkOnboarding(cmdObj: any) {
  const name = cmdObj.name();
  const parentName = cmdObj.parent?.name();
  const isSetupCommand = name === 'setup' || name === 'auth' || name === 'token' || name === 'init' || name === 'memory' || parentName === 'memory' || parentName === 'auth' || parentName === 'token';
  if (!isSetupCommand && await configManager.isFirstRun()) {
    Renderer.renderBox('NanoCLI Setup', [
      'OpenRouter API key belum ditemukan.',
      'Silakan jalankan:',
      'nanocli setup'
    ], 'yellow');
    process.exit(0);
  }
}

// Default action: Chat
program
  .action(async () => {
    if (process.argv.length <= 2) {
      await checkOnboarding(program);
      await chatUI.startChat();
    }
  });

program
  .command('init')
  .description('Inisialisasi konfigurasi awal NanoCLI di root proyek')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await memoryManager.initProject();
  });

program
  .command('ask')
  .description('Tanya cepat dari terminal')
  .argument('<prompt>', 'Pertanyaan atau instruksi untuk AI')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode: fast, normal, high, extra-high', 'normal')
  .option('--project', 'Gunakan konteks proyek')
  .option('--search <mode>', 'Mode web search: off, auto, on, deep', 'auto')
  .action(async (prompt, options, cmd) => {
    await checkOnboarding(cmd);
    await askCommand.execute(prompt, options);
  });

program
  .command('chat')
  .description('Buka sesi chat interaktif')
  .option('--mode <mode>', 'Pilih mode: fast, normal, high, extra-high', 'normal')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await chatUI.startChat(options.mode, options.model);
  });

program
  .command('review')
  .description('Audit kode per file')
  .argument('<file>', 'Path ke file yang akan di-review')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'normal')
  .action(async (file, options, cmd) => {
    await checkOnboarding(cmd);
    await reviewCommand.execute(file, options);
  });

program
  .command('debug')
  .description('Analisis error dan solusi')
  .argument('<file>', 'Path ke file terkait')
  .argument('<error>', 'Pesan error')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'normal')
  .option('--search <mode>', 'Mode web search: off, auto, on, deep', 'auto')
  .action(async (file, error, options, cmd) => {
    await checkOnboarding(cmd);
    await debugCommand.execute(file, error, options);
  });

program
  .command('search')
  .description('Cari informasi teknis dari web (powered by OpenRouter)')
  .argument('<query>', 'Query pencarian')
  .option('--max-results <number>', 'Jumlah hasil maksimal (1-10)', '5')
  .action(async (query, options, cmd) => {
    await checkOnboarding(cmd);
    await searchCommand.execute(query, options);
  });

program
  .command('test')
  .description('Buat unit test otomatis')
  .argument('<file>', 'Path ke file target')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'normal')
  .option('--framework <name>', 'Framework test (vitest, jest, dll)', 'vitest')
  .option('--write', 'Tulis file test secara otomatis')
  .option('--overwrite', 'Timpa file test yang sudah ada (pakai bersama --write)')
  .action(async (file, options, cmd) => {
    await checkOnboarding(cmd);
    await testCommand.execute(file, options);
  });

program
  .command('plan')
  .description('Buat rencana implementasi fitur')
  .argument('<prompt>', 'Deskripsi fitur yang ingin dibuat')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'high')
  .action(async (prompt, options, cmd) => {
    await checkOnboarding(cmd);
    await planCommand.execute(prompt, options);
  });

program
  .command('patch')
  .description('Beri saran patch untuk file')
  .argument('<file>', 'Path ke file target')
  .argument('<instruction>', 'Instruksi perubahan')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'normal')
  .action(async (file, instruction, options, cmd) => {
    await checkOnboarding(cmd);
    await patchCommand.execute(file, instruction, options);
  });

const memory = program.command('memory').description('Manajemen Project Memory');

memory
  .command('update')
  .description('Perbarui ringkasan proyek dan file')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await memoryManager.updateMemory();
  });

memory
  .command('search')
  .description('Cari konteks dari memory')
  .argument('<query>', 'Query pencarian')
  .action(async (query, options, cmd) => {
    await checkOnboarding(cmd);
    await memoryManager.searchMemory(query);
  });

const models = program.command('models').description('Manajemen model OpenRouter');

models
  .command('list')
  .description('Tampilkan daftar model')
  .option('--refresh', 'Paksa perbarui cache model')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    try {
      const list = await modelManager.getModels(options.refresh);
      console.log(chalk.cyan(`\nDaftar Model (${list.length} model ditemukan):`));
      const rows = list.slice(0, 20).map(m => [m.id, m.name, `${Math.floor(m.context_length / 1024)}K`]);
      Renderer.renderTable(['ID', 'Nama', 'Context'], rows);
      if (list.length > 20) {
        console.log(chalk.gray(`... dan ${list.length - 20} model lainnya. Gunakan 'models search' untuk mencari spesifik.`));
      }
    } catch (error: any) {
      Renderer.printStatus(error.message, 'error');
    }
  });

models
  .command('search')
  .description('Cari model')
  .argument('<keyword>', 'Kata kunci pencarian')
  .action(async (keyword, options, cmd) => {
    await checkOnboarding(cmd);
    try {
      const results = await modelManager.searchModels(keyword);
      console.log(chalk.cyan(`\nHasil Pencarian untuk "${keyword}" (${results.length} ditemukan):`));
      const rows = results.map(m => [m.id, m.name]);
      Renderer.renderTable(['ID', 'Nama'], rows);
    } catch (error: any) {
      Renderer.printStatus(error.message, 'error');
    }
  });

models
  .command('pick')
  .description('Pilih model secara interaktif')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await modelPickerUI.pickModel();
  });

models
  .command('ui')
  .description('Buka Model Picker UI')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await modelPickerUI.pickModel();
  });

models
  .command('set')
  .description('Set model untuk mode tertentu')
  .argument('<mode>', 'Mode (fast, normal, high, extra-high)')
  .argument('[model-id]', 'ID Model OpenRouter (opsional, jika kosong akan membuka picker)')
  .action(async (mode, modelId, options, cmd) => {
    await checkOnboarding(cmd);
    
    const validModes = ['fast', 'normal', 'high', 'extra-high'];
    if (!validModes.includes(mode)) {
      Renderer.printStatus(`Mode tidak valid. Pilih salah satu: ${validModes.join(', ')}`, 'error');
      return;
    }

    let selectedId = modelId;
    if (!selectedId) {
      selectedId = await modelPickerUI.pickModel(`Pilih model untuk mode ${mode}:`);
    }
    
    if (selectedId) {
      try {
        await configManager.setModelForMode(mode, selectedId);
        Renderer.printStatus(`Model untuk mode ${chalk.bold(mode)} berhasil diatur ke: ${chalk.bold(selectedId)}`, 'success');
      } catch (error: any) {
        Renderer.printStatus(`Gagal menyimpan konfigurasi: ${error.message}`, 'error');
      }
    }
  });

const token = program.command('token').description('Manajemen penggunaan token dan biaya');

token
  .command('stats')
  .description('Tampilkan statistik penggunaan token global')
  .action(async () => {
    const stats = await statsManager.getStats();
    console.log(chalk.cyan('\nStatistik Penggunaan Token Global:'));
    Renderer.renderTable(['Metrik', 'Nilai'], [
      ['Total Requests', stats.totalRequests.toString()],
      ['Total Input', `${stats.totalInputTokens.toLocaleString()} tokens`],
      ['Total Output', `${stats.totalOutputTokens.toLocaleString()} tokens`],
      ['Total Biaya', `$${stats.totalCostUsd.toFixed(4)} USD`]
    ]);
  });

token
  .command('reset')
  .description('Reset statistik penggunaan token')
  .action(async () => {
    await statsManager.resetStats();
    Renderer.printStatus('Statistik penggunaan token telah direset.', 'success');
  });

program
  .command('cost')
  .description('Tampilkan laporan biaya')
  .action(async () => {
    const stats = await statsManager.getStats();
    console.log(chalk.cyan('\nLaporan Biaya Historis (100 request terakhir):'));
    if (stats.history.length === 0) {
      console.log(chalk.gray('Belum ada riwayat penggunaan.'));
      return;
    }
    const rows = stats.history.map(r => [
      new Date(r.timestamp).toLocaleString(),
      r.modelId.split('/').pop() || r.modelId,
      r.mode,
      `$${r.costUsd.toFixed(6)}`
    ]);
    Renderer.renderTable(['Waktu', 'Model', 'Mode', 'Biaya'], rows);
    console.log(chalk.green(`\nTotal Akumulasi Biaya: $${stats.totalCostUsd.toFixed(4)} USD`));
  });

program
  .command('setup')
  .description('Buka terminal setup UI')
  .action(async () => {
    await setupUI.startSetup();
  });

const auth = program.command('auth').description('Manajemen autentikasi OpenRouter');

auth
  .command('login')
  .description('Input API Key')
  .action(async () => {
    await setupUI.setupManualKey();
  });

auth
  .command('status')
  .description('Cek status autentikasi')
  .action(async () => {
    const source = await configManager.getApiKeySource();
    const hasKey = !!(await configManager.getApiKey());
    
    console.log(chalk.cyan('\nStatus Autentikasi:'));
    if (hasKey) {
      Renderer.printStatus(`Aktif (Sumber: ${source === 'env' ? 'Environment Variable' : 'File Lokal'})`, 'success');
    } else {
      Renderer.printStatus('Belum terkonfigurasi', 'error');
    }
  });

auth
  .command('reset')
  .description('Hapus kredensial')
  .action(async () => {
    await configManager.deleteApiKey();
    Renderer.printStatus('Kredensial lokal telah dihapus.', 'success');
  });

export async function run() {
  await program.parseAsync(process.argv);
}
