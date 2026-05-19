const { Input, Confirm } = require('enquirer');
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { ConfigManager } from '../files/configManager';
import { OpenRouterClient, Message, createOpenRouterWebSearchTool } from '../llm/openrouterClient';
import { ModelPickerUI } from './modelPickerUI';
import { Renderer } from './render';
import { TokenBudgetManager } from '../tokens/tokenBudgetManager';
import { ContextCompactor } from '../context/contextCompactor';
import { ModelManager } from '../llm/modelManager';
import { StatsManager } from '../tokens/statsManager';
import { PromptBuilder } from '../prompts/promptBuilder';
import { isInsideProject, isSecretFile } from '../utils/fsSafe';
import { isValidMode, VALID_MODES } from '../config/modes';
import { SearchMode } from '../search/types';
import { shouldSearch } from '../search/searchDecisionEngine';

export class ChatUI {
  private configManager: ConfigManager;
  private modelPickerUI: ModelPickerUI;
  private modelManager: ModelManager;
  private tokenManager: TokenBudgetManager;
  private statsManager: StatsManager;
  private compactor: ContextCompactor;
  private promptBuilder: PromptBuilder;
  private messages: Message[] = [];
  private currentMode: string = 'normal';
  private currentModelId: string = '';
  private currentSearchMode: SearchMode = 'auto';

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
    this.modelPickerUI = new ModelPickerUI(projectRoot);
    this.modelManager = new ModelManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.statsManager = new StatsManager(projectRoot);
    this.compactor = new ContextCompactor();
    this.promptBuilder = new PromptBuilder(projectRoot);
  }

  async startChat(mode: string = 'normal', modelId?: string) {
    this.currentMode = mode;
    const apiKey = await this.configManager.getApiKey();
    // Jika --model diberikan lewat CLI, gunakan langsung. Jika tidak, load dari config.
    this.currentModelId = modelId ?? await this.configManager.getModelForMode(this.currentMode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    const client = new OpenRouterClient(apiKey);

    // Initialize System Prompt with Awareness
    const systemPrompt = await this.promptBuilder.buildSystemPrompt('chat');
    this.messages = [{ role: 'system', content: systemPrompt }];

    this.displayWelcome();

    while (true) {
      const stats = this.tokenManager.getStats(this.messages, this.currentMode);
      const prompt = new Input({
        message: chalk.blue('You'),
        footer: () => chalk.gray(`(Budget: ${stats.inputTokens}/${stats.budget} tokens | /exit untuk keluar)`)
      });

      try {
        const userInput = await prompt.run();

        if (!userInput || userInput.trim() === '') continue;
        
        if (userInput.startsWith('/')) {
          const shouldExit = await this.handleCommand(userInput);
          if (shouldExit) break;
          continue;
        }

        this.messages.push({ role: 'user', content: userInput });

        // Auto-inject konten file yang disebutkan user dalam pesannya
        const mentionedFilesContext = await this.promptBuilder.autoInjectMentionedFiles(userInput);
        if (mentionedFilesContext) {
          // Sisipkan sebagai system message tepat sebelum user message terakhir
          const lastUserMsg = this.messages.pop()!;
          this.messages.push({ role: 'system', content: mentionedFilesContext });
          this.messages.push(lastUserMsg);
          Renderer.printStatus('File yang disebutkan otomatis dimuat ke konteks.', 'info');
        }

        const compactedMessages = this.compactor.compactMessages(this.messages, this.currentMode);
        const compactionStats = this.compactor.getCompactionStats(this.messages, compactedMessages);

        if (parseFloat(compactionStats.saving) > 0) {
          Renderer.printStatus(`Context diringkas: ${compactionStats.actual}/${compactionStats.baseline} tokens (Hemat ${compactionStats.saving})`, 'info');
        }

        // Tentukan apakah web search diperlukan untuk pesan ini
        const searchDecision = shouldSearch({ prompt: userInput, mode: this.currentSearchMode });
        const tools = searchDecision.search
          ? [createOpenRouterWebSearchTool({ maxResults: 5, maxTotalResults: 10, contextSize: 'low' })]
          : undefined;
        if (searchDecision.search) {
          Renderer.printStatus(`🔍 Web Search aktif — ${searchDecision.reason}`, 'info');
        }

        const shouldContinue = await this.checkCostGuard(compactedMessages);
        if (!shouldContinue) {
          this.messages.pop();
          continue;
        }

        process.stdout.write(chalk.cyan('\nNanoCLI: '));

        let fullResponse = '';
        try {
          const stream = client.streamChat({
            model: this.currentModelId,
            messages: compactedMessages,
            ...(tools && { tools }),
            stream: true
          });

          for await (const chunk of stream) {
            process.stdout.write(chunk);
            fullResponse += chunk;
          }
          process.stdout.write('\n\n');

          this.messages.push({ role: 'assistant', content: fullResponse });
          await this.logUsage(compactedMessages, fullResponse);

        } catch (error: any) {
          Renderer.printStatus(error.message, 'error');
          console.log('');
        }

      } catch (error) {
        break;
      }
    }

    console.log(chalk.yellow('\nSesi chat berakhir. Sampai jumpa!'));
  }

  private async logUsage(inputMessages: Message[], outputText: string) {
    const modelMetadata = await this.modelManager.getModel(this.currentModelId);
    if (!modelMetadata) return;

    const inputTokens = this.tokenManager.countMessageTokens(inputMessages);
    const outputTokens = this.tokenManager.countTextTokens(outputText);
    const costUsd = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);

    await this.statsManager.logUsage({
      timestamp: Date.now(),
      modelId: this.currentModelId,
      mode: this.currentMode,
      inputTokens,
      outputTokens,
      costUsd
    });
  }

  private async checkCostGuard(messages: Message[]): Promise<boolean> {
    const modelMetadata = await this.modelManager.getModel(this.currentModelId);
    if (!modelMetadata) return true;

    const inputTokens = this.tokenManager.countMessageTokens(messages);
    const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1000);

    const threshold = 0.05;
    const isHighMode = this.currentMode === 'high' || this.currentMode === 'extra-high';

    if (estimatedCost > threshold || (isHighMode && estimatedCost > 0.01)) {
      console.log(chalk.yellow('\n⚠️  Peringatan Biaya:'));
      Renderer.renderTable(['Metrik', 'Estimasi'], [
        ['Model', this.currentModelId],
        ['Input Tokens', `${inputTokens} tokens`],
        ['Estimasi Biaya', `$${estimatedCost.toFixed(4)} USD`]
      ]);

      const confirmPrompt = new Confirm({
        name: 'continue',
        message: 'Lanjutkan request ini?'
      });

      return await confirmPrompt.run();
    }

    return true;
  }

  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.split(' ');
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case '/exit':
      case '/quit':
        return true;

      case '/help':
        this.displayHelp();
        break;

      case '/clear':
        const systemPrompt = await this.promptBuilder.buildSystemPrompt('chat');
        this.messages = [{ role: 'system', content: systemPrompt }];
        console.clear();
        this.displayWelcome();
        break;

      case '/compact':
        const before = this.tokenManager.countMessageTokens(this.messages);
        this.messages = this.compactor.compactMessages(this.messages, this.currentMode);
        const after = this.tokenManager.countMessageTokens(this.messages);
        Renderer.printStatus(`Konteks diringkas secara manual: ${after}/${before} tokens.`, 'success');
        break;

      case '/mode':
        if (args.length > 0) {
          const newMode = args[0]!;
          const validModes = ['fast', 'normal', 'high', 'extra-high'];
          if (validModes.includes(newMode)) {
            this.currentMode = newMode;
            this.currentModelId = await this.configManager.getModelForMode(this.currentMode);
            
            // Update system prompt for new mode
            const newSystemPrompt = await this.promptBuilder.buildSystemPrompt('chat');
            if (this.messages.length > 0 && this.messages[0]?.role === 'system') {
              this.messages[0].content = newSystemPrompt;
            }

            Renderer.printStatus(`Mode diganti ke: ${chalk.bold(this.currentMode)}`, 'success');
            console.log(chalk.gray(`Model aktif: ${this.currentModelId}\n`));
          } else {
            Renderer.printStatus(`Mode tidak valid. Pilih: ${validModes.join(', ')}`, 'error');
            console.log('');
          }
        } else {
          console.log(chalk.cyan(`\nMode saat ini: ${chalk.bold(this.currentMode)}\n`));
        }
        break;

      case '/search':
        const searchArg = args[0]?.toLowerCase();
        const validSearchModes: SearchMode[] = ['on', 'off', 'auto', 'deep'];
        if (searchArg && (validSearchModes as string[]).includes(searchArg)) {
          this.currentSearchMode = searchArg as SearchMode;
          Renderer.printStatus(`Search mode diatur ke: ${chalk.bold(this.currentSearchMode)}`, 'success');
          console.log('');
        } else {
          console.log(chalk.cyan(`\nSearch mode saat ini: ${chalk.bold(this.currentSearchMode)}`));
          console.log(chalk.gray('Gunakan: /search on | off | auto | deep\n'));
        }
        break;

      case '/model':
        if (args.length > 0) {
          this.currentModelId = args[0]!;
          Renderer.printStatus(`Model diganti ke: ${chalk.bold(this.currentModelId)}`, 'success');
          console.log('');
        } else {
          const selected = await this.modelPickerUI.pickModel('Pilih model baru untuk sesi ini:');
          if (selected) {
            this.currentModelId = selected;
            Renderer.printStatus(`Model diganti ke: ${chalk.bold(this.currentModelId)}`, 'success');
            console.log('');
          }
        }
        break;

      case '/token':
      case '/tokens':
        const stats = this.tokenManager.getStats(this.messages, this.currentMode);
        const globalStats = await this.statsManager.getStats();
        console.log(chalk.cyan('\nStatistik Token Sesi Ini:'));
        Renderer.renderTable(['Metrik', 'Nilai'], [
          ['Input Terpakai', `${stats.inputTokens} tokens`],
          ['Budget Mode', `${stats.budget} tokens`],
          ['Sisa Budget', `${stats.remaining} tokens`],
          ['Persentase', `${stats.percentUsed.toFixed(2)}%`]
        ]);
        console.log(chalk.cyan('\nStatistik Akumulasi (Global):'));
        Renderer.renderTable(['Metrik', 'Nilai'], [
          ['Total Requests', globalStats.totalRequests.toString()],
          ['Total Input', `${globalStats.totalInputTokens.toLocaleString()} tokens`],
          ['Total Output', `${globalStats.totalOutputTokens.toLocaleString()} tokens`],
          ['Total Biaya', `$${globalStats.totalCostUsd.toFixed(4)} USD`]
        ]);
        console.log('');
        break;

      case '/context':
        if (args[0] === 'show') {
          console.log(chalk.cyan('\nRiwayat Pesan Saat Ini:'));
          const rows = this.messages.map((m, i) => [
            i.toString(),
            m.role.toUpperCase(),
            m.content.substring(0, 50).replace(/\n/g, ' ') + (m.content.length > 50 ? '...' : '')
          ]);
          Renderer.renderTable(['#', 'Role', 'Content Snippet'], rows);
          console.log('');
        } else {
          console.log(chalk.yellow('\nGunakan: /context show\n'));
        }
        break;

      case '/file':
      case '/read': {
        const filePath = args.join(' ').trim();
        if (!filePath) {
          Renderer.printStatus('Penggunaan: /file <path>', 'error');
          console.log('');
          break;
        }

        // Resolve relative terhadap cwd
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        // Fix Bug 3.7: blokir akses file di luar project root
        if (!isInsideProject(process.cwd(), resolvedPath)) {
          Renderer.printStatus('Akses file di luar project root diblokir demi keamanan.', 'error');
          console.log('');
          break;
        }

        // Fix Bug 3.8: blokir file secret/credential
        if (isSecretFile(resolvedPath)) {
          Renderer.printStatus('File terlihat seperti credential/secret dan tidak akan dikirim ke AI.', 'error');
          console.log('');
          break;
        }

        if (!(await fs.pathExists(resolvedPath))) {
          Renderer.printStatus(`File tidak ditemukan: ${resolvedPath}`, 'error');
          console.log('');
          break;
        }

        try {
          const stat = await fs.stat(resolvedPath);
          if (stat.isDirectory()) {
            const entries = await fs.readdir(resolvedPath);
            const dirContent = entries.map(e => `  ${e}`).join('\n');
            const message = `Isi direktori ${resolvedPath}:\n${dirContent}`;
            this.messages.push({ role: 'user', content: message });
            Renderer.printStatus(`Direktori dimuat ke konteks: ${resolvedPath} (${entries.length} entries)`, 'success');
          } else {
            const MAX_BYTES = 100_000; // ~100KB
            if (stat.size > MAX_BYTES) {
              Renderer.printStatus(`File terlalu besar (${(stat.size / 1024).toFixed(1)}KB). Max 100KB.`, 'warn');
              console.log('');
              break;
            }

            const content = await fs.readFile(resolvedPath, 'utf-8');
            const relativePath = path.relative(process.cwd(), resolvedPath);
            const ext = path.extname(resolvedPath).slice(1) || 'text';
            const message = `Berikut isi file \`${relativePath}\`:\n\`\`\`${ext}\n${content}\n\`\`\``;
            this.messages.push({ role: 'user', content: message });
            Renderer.printStatus(`File dimuat ke konteks: ${relativePath} (${(stat.size / 1024).toFixed(1)}KB)`, 'success');
          }
          console.log('');
        } catch (err: any) {
          Renderer.printStatus(`Gagal membaca file: ${err.message}`, 'error');
          console.log('');
        }
        break;
      }

      case '/ls': {
        const targetDir = args.join(' ').trim() || process.cwd();
        const resolvedDir = path.isAbsolute(targetDir)
          ? targetDir
          : path.resolve(process.cwd(), targetDir);

        try {
          if (!(await fs.pathExists(resolvedDir))) {
            Renderer.printStatus(`Direktori tidak ditemukan: ${resolvedDir}`, 'error');
            console.log('');
            break;
          }
          const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
          console.log(chalk.cyan(`\nIsi folder: ${resolvedDir}`));
          const rows = entries.map(e => [
            e.isDirectory() ? chalk.blue(e.name + '/') : e.name,
            e.isDirectory() ? 'folder' : 'file'
          ]);
          Renderer.renderTable(['Nama', 'Tipe'], rows);
          console.log('');
        } catch (err: any) {
          Renderer.printStatus(`Gagal membaca direktori: ${err.message}`, 'error');
          console.log('');
        }
        break;
      }

      default:
        Renderer.printStatus(`Perintah tidak dikenal: ${command}. Ketik /help untuk bantuan.`, 'error');
        console.log('');
    }

    return false;
  }

  private displayWelcome() {
    Renderer.renderBox('NanoCLI Chat', [
      `Mode: ${this.currentMode}`,
      `Model: ${this.currentModelId}`,
      'Ketik /help untuk daftar perintah'
    ]);
    console.log('');
  }

  private displayHelp() {
    console.log(chalk.cyan('\nPerintah Internal Chat:'));
    const rows = [
      ['/help', 'Tampilkan bantuan ini'],
      ['/exit, /quit', 'Keluar dari sesi chat'],
      ['/clear', 'Bersihkan riwayat percakapan'],
      ['/compact', 'Ringkas konteks secara manual'],
      ['/mode <name>', 'Ganti mode (fast, normal, high, extra-high)'],
      ['/model [id]', 'Ganti model (buka picker jika ID kosong)'],
      ['/search <mode>', 'Atur web search: on | off | auto | deep'],
      ['/tokens', 'Tampilkan statistik penggunaan token'],
      ['/context show', 'Tampilkan ringkasan konteks saat ini'],
      ['/file <path>', 'Muat isi file/folder ke dalam konteks chat'],
      ['/ls [path]', 'Tampilkan isi folder (default: folder aktif)']
    ];
    Renderer.renderTable(['Perintah', 'Deskripsi'], rows);
    console.log('');
  }
}
