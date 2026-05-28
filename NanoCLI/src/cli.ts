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
import { HomeServerClient } from './remote/homeServerClient';
import { RemoteSetupUI } from './ui/remoteSetupUI';
import { TerminalCommand } from './commands/terminal';
import { WriteCommand } from './commands/write';
import { GenerateCommand } from './commands/generate';
import { UndoCommand } from './commands/undo';
import { AgentCommand } from './commands/agent';

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
const terminalCommand = new TerminalCommand();
const writeCommand = new WriteCommand();
const generateCommand = new GenerateCommand();
const undoCommand = new UndoCommand();
const agentCommand = new AgentCommand();

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
    // BUG-08 fix: exit(1) bukan exit(0) — API key belum dikonfigurasi adalah kondisi error.
    // exit(0) menandakan sukses ke shell/CI, membuat kondisi ini tidak terdeteksi oleh script.
    process.exit(1);
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
  .option('--out <path>', 'Simpan output ke file (misal: docs/PLAN.md)')
  .action(async (prompt, options, cmd) => {
    await checkOnboarding(cmd);
    await planCommand.execute(prompt, options);
  });

program
  .command('patch')
  .description('Beri saran patch untuk file, atau terapkan langsung dengan --apply')
  .argument('<file>', 'Path ke file target')
  .argument('<instruction>', 'Instruksi perubahan')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'normal')
  .option('--apply', 'Terapkan patch ke file setelah generate (dengan approval)')
  .action(async (file, instruction, options, cmd) => {
    await checkOnboarding(cmd);
    await patchCommand.execute(file, instruction, options);
  });

program
  .command('write')
  .description('Buat atau timpa file dari prompt AI')
  .argument('<path>', 'Path file yang akan dibuat')
  .argument('<prompt>', 'Deskripsi konten yang diinginkan')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'high')
  .option('--overwrite', 'Izinkan menimpa file yang sudah ada')
  .action(async (filePath, prompt, options, cmd) => {
    await checkOnboarding(cmd);
    await writeCommand.execute(filePath, prompt, options);
  });

program
  .command('generate')
  .description('Generate dokumen proyek terstruktur (prd, implementation, tasks, readme, api-spec)')
  .argument('<type>', 'Tipe dokumen: prd | implementation | tasks | readme | api-spec')
  .argument('[topic]', 'Topik atau fitur yang ingin didokumentasikan')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'high')
  .option('--out <path>', 'Path output file (default: docs/)')
  .action(async (type, topic, options, cmd) => {
    await checkOnboarding(cmd);
    await generateCommand.execute(type, topic ?? '', options);
  });

program
  .command('undo')
  .description('Batalkan operasi file terakhir (restore dari backup)')
  .option('--list', 'Tampilkan daftar semua backup yang tersedia')
  .action(async (options, cmd) => {
    await checkOnboarding(cmd);
    await undoCommand.execute(options);
  });

program
  .command('agent')
  .description('Jalankan workflow agentik multi-step')
  .argument('<task>', 'Task yang ingin diselesaikan oleh agent')
  .option('-m, --model <model-id>', 'Gunakan model spesifik')
  .option('--mode <mode>', 'Pilih mode', 'high')
  .option('--max-steps <n>', 'Jumlah maksimum langkah agent', '8')
  .option('--permission <level>', 'Level permission: workspace | full', 'workspace')
  .option('--dry-run', 'Tampilkan proposal tanpa eksekusi')
  .option('--verbose', 'Tampilkan output detail setiap step')
  .action(async (task, options, cmd) => {
    await checkOnboarding(cmd);
    await agentCommand.execute(task, options);
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

// ─── Remote Commands ────────────────────────────────────────────────────

const remote = program
  .command('remote')
  .description('Manage NanoCLI connection mode (local / share / self-host)');

remote
  .command('setup')
  .description('Interactive wizard: configure connection mode')
  .action(async () => {
    const ui = new RemoteSetupUI(process.cwd());
    await ui.startSetup();
  });

remote
  .command('status')
  .description('Show current connection mode and server status')
  .action(async () => {
    const ui = new RemoteSetupUI(process.cwd());
    await ui.showStatus();
  });

remote
  .command('switch')
  .description('Switch connection mode (alias for: nanocli remote setup)')
  .action(async () => {
    const ui = new RemoteSetupUI(process.cwd());
    await ui.startSetup();
  });

remote
  .command('clear')
  .description('Reset to local mode and remove any remote configuration')
  .action(async () => {
    await configManager.setMode('local');
    await configManager.saveRemoteConfig({ url: '', apiKey: '' });
    console.log(chalk.green('\n  ✓ Reset to local mode. No network calls will be made.\n'));
  });

// ─── Terminal Commands ────────────────────────────────────────────────────────

const terminal = program
  .command('terminal')
  .description('Secure Terminal Bridge — jalankan command lokal dengan approval dan redaction');

terminal
  .command('detect')
  .description('Deteksi shell yang tersedia di sistem')
  .action(async (options: any, cmd: any) => {
    await checkOnboarding(cmd);
    await terminalCommand.detect();
  });

terminal
  .command('run')
  .description('Jalankan command lokal dengan approval dan redaction')
  .argument('<command>', 'Command yang akan dijalankan')
  .option('--cwd <path>', 'Working directory')
  .option('-y, --yes', 'Skip approval untuk command low-risk')
  .option('--timeout <seconds>', 'Timeout dalam detik (default: 300)', '300')
  .action(async (command: string, options: any, cmd: any) => {
    await checkOnboarding(cmd);
    await terminalCommand.run(command, options);
  });

// ─── Data Commands ────────────────────────────────────────────────────────────

const data = program
  .command('data')
  .description('Inspect and analyze NanoCLI memory and usage data');

data
  .command('stats')
  .description('Show memory statistics and usage analytics')
  .action(async () => {
    const { Indexer } = await import('./memory/indexer');

    console.log('\n' + chalk.bold.cyan('┌' + '─'.repeat(56) + '┐'));
    console.log(chalk.bold.cyan('│') + chalk.bold('  NanoCLI — Data Statistics'.padEnd(56)) + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('└' + '─'.repeat(56) + '┘') + '\n');

    // ── Local SQLite stats ──────────────────────────────────────
    console.log(chalk.bold.white('  Local Memory (SQLite)'));
    console.log(chalk.dim('  ' + '─'.repeat(50)));

    try {
      const indexer = new Indexer(process.cwd());
      await indexer.connect();
      const local = indexer.getLocalStats();
      indexer.close();

      console.log(`  Files indexed    : ${chalk.cyan(local.filesIndexed.toLocaleString())}`);

      const memTotal = Object.values(local.memoryByType).reduce((a, b) => a + b, 0);
      if (memTotal > 0) {
        const parts = Object.entries(local.memoryByType)
          .sort(([, a], [, b]) => b - a)
          .map(([t, c]) => `${t}:${c}`)
          .join('  ');
        console.log(`  Memory entries   : ${chalk.cyan(memTotal)} ${chalk.dim('(' + parts + ')')}`);
      } else {
        console.log(`  Memory entries   : ${chalk.dim('0 (run nanocli memory update)')}`);
      }

      if (local.feedbackTotal > 0) {
        const goodPct = Math.round((local.feedbackGood / local.feedbackTotal) * 100);
        console.log(`  Feedback ratings : ${chalk.cyan(local.feedbackTotal)}` +
          `  ${chalk.green('▲ ' + local.feedbackGood)}` +
          `  ${chalk.red('▼ ' + local.feedbackBad)}` +
          `  ${chalk.dim('~ ' + local.feedbackNeutral)}` +
          `  ${chalk.dim('(' + goodPct + '% good)')}`
        );
      } else {
        console.log(`  Feedback ratings : ${chalk.dim('0 (no ratings yet)')}`);
      }
    } catch (err: any) {
      // Bedakan antara DB belum ada (fresh install) vs error lain
      const isFirstRun = err?.message?.includes('no such table') ||
                         err?.code === 'SQLITE_ERROR'            ||
                         !require('fs').existsSync(
                           require('path').join(process.cwd(), '.nanocli', 'index', 'memory.sqlite')
                         );
      if (isFirstRun) {
        console.log(chalk.dim('  No local data yet.') + chalk.dim(' → Run: nanocli memory update'));
      } else {
        console.log(chalk.yellow(`  ⚠  Local stats error: ${err?.message ?? 'unknown'}`));
        console.log(chalk.dim('  Try: nanocli memory update'));
      }
    }

    // ── Remote stats (hanya jika self-host mode) ────────────────
    const mode = await configManager.getMode();

    if (mode === 'self-host') {
      const remoteConfig = await configManager.getRemoteConfig();
      if (remoteConfig?.url && remoteConfig?.apiKey) {
        console.log('\n' + chalk.bold.white('  Remote Analytics (Home Server)'));
        console.log(chalk.dim('  ' + '─'.repeat(50)));

        process.stdout.write(chalk.dim('  Fetching stats...'));
        const client = new HomeServerClient(remoteConfig.url, remoteConfig.apiKey);
        const stats = await client.getStats();

        if (!stats) {
          process.stdout.write(chalk.yellow(' ⚠ unreachable\n'));
          console.log(chalk.dim('  Run: nanocli remote status'));
        } else {
          process.stdout.write(chalk.green(' ✓\n'));

          console.log(`  Total events     : ${chalk.cyan(stats.total_events.toLocaleString())}`);

          if (stats.total_feedback > 0) {
            const goodPct = Math.round((stats.feedback_good / stats.total_feedback) * 100);
            console.log(`  Feedback ratings : ${chalk.cyan(stats.total_feedback.toLocaleString())}` +
              `  ${chalk.green('▲ ' + stats.feedback_good)}` +
              `  ${chalk.red('▼ ' + stats.feedback_bad)}` +
              `  ${chalk.dim('(' + goodPct + '% good)')}`
            );
          }

          if (stats.avg_response_ms) {
            console.log(`  Avg response     : ${chalk.cyan(Math.round(stats.avg_response_ms) + ' ms')}`);
          }

          console.log(`  Memory entries   : ${chalk.cyan(stats.total_memory_entries.toLocaleString())}`);
          console.log(`  Conversations    : ${chalk.cyan(stats.total_conversation_turns.toLocaleString())}` +
            `  ${chalk.dim('(' + stats.total_sessions + ' sessions)')}`
          );

          if (stats.top_commands.length > 0) {
            console.log('\n  ' + chalk.bold('Top Commands:'));
            stats.top_commands.slice(0, 5).forEach(cmd => {
              const bar = '█'.repeat(Math.round(cmd.pct / 5));
              console.log(`    ${cmd.command.padEnd(12)} ${chalk.cyan(bar)} ${cmd.pct}%  ${chalk.dim('(' + cmd.total + ')')}`);
            });
          }

          if (stats.feedback_by_model.length > 0) {
            console.log('\n  ' + chalk.bold('Feedback by Model:'));
            stats.feedback_by_model.slice(0, 5).forEach(m => {
              const pct = m.good_pct.toFixed(0);
              const color = m.good_pct >= 70 ? chalk.green : m.good_pct >= 40 ? chalk.yellow : chalk.red;
              console.log(`    ${m.model_id.split('/').pop()!.padEnd(30)} ${color(pct + '% good')}  ${chalk.dim('n=' + m.total)}`);
            });
          }

          if (stats.data_since) {
            const since = new Date(stats.data_since).toLocaleDateString();
            console.log(chalk.dim(`\n  Data since: ${since}`));
          }
        }
      }
    } else if (mode === 'share') {
      console.log('\n' + chalk.dim('  Remote analytics not available in Share mode.'));
      console.log(chalk.dim('  Switch to self-host mode for full analytics: nanocli remote setup'));
    } else {
      console.log('\n' + chalk.dim('  Remote analytics: not configured (Local mode).'));
      console.log(chalk.dim('  Run nanocli remote setup to configure a remote server.'));
    }

    console.log('');
  });


export async function run() {
  await program.parseAsync(process.argv);
}
