const { Input, Confirm } = require('enquirer');
import chalk from 'chalk';
import fs from 'fs-extra';
import { HistoryInput } from './historyInput';
import { ChatHistoryManager } from './chatHistory';
import path from 'path';
import { randomUUID } from 'crypto';
import { ConfigManager, NanoCLIMode } from '../files/configManager';
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
import { HomeServerClient } from '../remote/homeServerClient';
import { TelemetryClient, NANOCLI_TELEMETRY_URL } from '../remote/telemetryClient';
import { MemoryManager } from '../memory/memoryManager';
import { MemoryExtractor } from '../memory/memoryExtractor';
import { SecretRedactor } from '../security/secretRedactor';
import { TerminalCommand } from '../commands/terminal';
import { AgentLoop } from '../agent/agentLoop';

export class ChatUI {
  private configManager: ConfigManager;
  private modelPickerUI: ModelPickerUI;
  private modelManager: ModelManager;
  private tokenManager: TokenBudgetManager;
  private statsManager: StatsManager;
  private compactor: ContextCompactor;
  private promptBuilder: PromptBuilder;
  private memoryManager: MemoryManager;
  private messages: Message[] = [];
  private currentMode: string = 'normal';
  private currentModelId: string = '';
  private currentSearchMode: SearchMode = 'auto';
  private sessionId: string = randomUUID();
  /** Mode koneksi aktif: local | share | self-host */
  private nanoMode: NanoCLIMode = 'local';
  /** HomeServerClient — hanya aktif di self-host mode */
  private homeClient: HomeServerClient | null = null;
  /** TelemetryClient — hanya aktif di share mode */
  private telemetryClient: TelemetryClient | null = null;
  private projectName: string = '';
  private redactor = new SecretRedactor();
  private terminalCommand: TerminalCommand;
  private agentLoop: AgentLoop;
  private projectRoot: string;
  private historyManager: ChatHistoryManager;
  private client: OpenRouterClient | null = null;
  /**
   * Flag untuk CTRL+C context-aware:
   * - true  → user sedang mengetik di prompt enquirer → SIGINT diabaikan (enquirer handle)
   * - false → idle / streaming → SIGINT memicu exit graceful
   */
  private isPromptActive = false;
  /**
   * Cache status auto-memory untuk ditampilkan di footer prompt.
   * Di-init dari config saat startChat(), di-update saat user toggle /memory auto.
   * Default: true — memory extraction aktif secara default.
   */
  private memoryAutoOn = true;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configManager = new ConfigManager(projectRoot);
    this.modelPickerUI = new ModelPickerUI(projectRoot);
    this.modelManager = new ModelManager(projectRoot);
    this.tokenManager = new TokenBudgetManager();
    this.statsManager = new StatsManager(projectRoot);
    this.compactor = new ContextCompactor();
    this.promptBuilder = new PromptBuilder(projectRoot);
    this.memoryManager = new MemoryManager(projectRoot);
    this.terminalCommand = new TerminalCommand(projectRoot);
    this.agentLoop = new AgentLoop(projectRoot);
    this.historyManager = new ChatHistoryManager(projectRoot);
  }

  async startChat(mode: string = 'normal', modelId?: string) {
    this.currentMode = mode;
    const apiKey = await this.configManager.getApiKey();
    this.currentModelId = modelId ?? await this.configManager.getModelForMode(this.currentMode);

    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan. Jalankan "nanocli setup" terlebih dahulu.', 'error');
      return;
    }

    // ─── Init mode-aware connections ────────────────────────────────────
    this.projectName = await this.configManager.getProjectName();
    this.nanoMode    = await this.configManager.getMode();

    if (this.nanoMode === 'self-host') {
      const remoteConfig = await this.configManager.getRemoteConfig();
      if (remoteConfig?.url && remoteConfig?.apiKey) {
        this.homeClient = new HomeServerClient(remoteConfig.url, remoteConfig.apiKey);

        // P1-05: Cek availability backend sekali saat startup.
        // Jika tidak tersedia, tampilkan pesan satu kali dan fallback ke lokal.
        // Tidak throw — CLI tetap berjalan penuh dengan SQLite FTS5 lokal.
        const backendAvailable = await this.homeClient.isAvailable();
        if (!backendAvailable) {
          Renderer.printStatus(
            'Semantic backend tidak tersedia. Menggunakan SQLite FTS5 lokal sebagai fallback. ' +
            'Pastikan nanocli-server berjalan dan API_KEY sudah diset.',
            'warn',
          );
          this.homeClient = null; // matikan client agar tidak ada retry di setiap query
        }
      }
      this.telemetryClient = null;
    } else if (this.nanoMode === 'share') {
      this.homeClient      = null;
      this.telemetryClient = new TelemetryClient(NANOCLI_TELEMETRY_URL);
      // Kirim event session_start (anonim)
      this.telemetryClient.sendEvent({
        event: 'session_start',
        model_id: this.currentModelId,
        nano_mode: this.currentMode,
      });
    } else {
      // local — zero network
      this.homeClient      = null;
      this.telemetryClient = null;
    }

    this.client = new OpenRouterClient(apiKey);
    const historyList = await this.historyManager.loadHistory();

    // Initialize System Prompt
    const systemPrompt = await this.promptBuilder.buildSystemPrompt('chat');
    this.messages = [{ role: 'system', content: systemPrompt }];

    await this.displayWelcome();

    // P2-04: Aktifkan auto-index watcher di background (quiet mode).
    // Watcher memantau perubahan file dan re-index secara inkremental.
    // Tidak ada output per perubahan agar tidak ganggu chat.
    this.memoryManager.startWatcher(true);

    // ─── SIGINT handler (Ctrl+C) context-aware ─────────────────────
    // process.once agar tidak terdaftar berkali-kali jika startChat() dipanggil ulang.
    // Handler dihapus saat chat loop selesai (normal exit atau error).
    //
    // Behavior:
    // - isPromptActive = true  → user sedang mengetik → skip (enquirer sudah handle)
    // - isPromptActive = false → idle/streaming       → exit graceful + extraction
    const sigintHandler = async () => {
      if (this.isPromptActive) {
        // Enquirer sudah menangani CTRL+C saat mengetik (cancel prompt).
        // Re-register handler agar tetap aktif untuk press berikutnya.
        process.once('SIGINT', sigintHandler);
        return;
      }
      console.log(''); // newline setelah ^C
      await this.extractAndSaveSessionMemory();
      process.exit(0);
    };
    process.once('SIGINT', sigintHandler);

    // Baca status memory dari config untuk ditampilkan di footer
    this.memoryAutoOn = (await this.configManager.getFlag('memoryAutoExtract').catch(() => true)) ?? true;

    while (true) {
      const stats = this.tokenManager.getStats(this.messages, this.currentMode);

      // Input prompt: tampilkan mode + model aktif sebagai label
      const modeIcons: Record<string, string> = { fast: '⚡', normal: '◆', high: '▲', 'extra-high': '◉' };
      const modeColors: Record<string, chalk.Chalk> = {
        fast: chalk.green, normal: chalk.cyan, high: chalk.yellow, 'extra-high': chalk.magenta
      };
      const modeIcon  = modeIcons[this.currentMode]  ?? '◆';
      const modeColor = modeColors[this.currentMode] ?? chalk.cyan;
      const modelShort = this.currentModelId.split('/').pop() ?? this.currentModelId;
      const budgetPct  = stats.budget > 0 ? Math.round((stats.inputTokens / stats.budget) * 100) : 0;
      const budgetColor = budgetPct > 80 ? chalk.red : budgetPct > 60 ? chalk.yellow : chalk.dim;

      const memoryIcon   = this.memoryAutoOn ? chalk.green('🧠') : chalk.dim('🧠');
      const memoryStatus = this.memoryAutoOn ? chalk.green('on') : chalk.dim('off');

      const prompt = new HistoryInput({
        message: modeColor(`${modeIcon} ${this.currentMode}`) + chalk.dim(` · ${modelShort}`),
        prefix: chalk.cyan('  ›'),
        footer: chalk.dim(`  ${stats.inputTokens}/${stats.budget} tokens`) +
                budgetColor(` (${budgetPct}%)`) +
                chalk.dim('  ·  ') + memoryIcon + chalk.dim(` memory: `) + memoryStatus +
                chalk.dim('  ·  /help  ·  /exit'),
        history: historyList
      });

      try {
        this.isPromptActive = true;
        const userInput = await prompt.run();
        this.isPromptActive = false;

        if (!userInput || userInput.trim() === '') continue;

        await this.historyManager.append(userInput);
        historyList.push(userInput);
        if (historyList.length > 100) historyList.shift();
        
        if (userInput.startsWith('/')) {
          const shouldExit = await this.handleCommand(userInput);
          if (shouldExit) {
            process.removeListener('SIGINT', sigintHandler);
            break;
          }
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

        const summarizeFn = async (msgs: Message[]): Promise<string> => {
          Renderer.printStatus('Meringkas percakapan lama untuk menghemat token...', 'info');
          const fastModelId = await this.configManager.getModelForMode('fast');
          const summaryPrompt = `Berikut adalah riwayat percakapan sebelumnya. Ringkaslah isi percakapan ini secara sangat padat (maksimal 2-3 paragraf), fokus pada keputusan teknis, kode yang dibuat/diubah, dan status terakhir proyek. Gunakan bahasa Indonesia:\n\n` +
            msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

          try {
            let summaryText = '';
            if (this.client) {
              const stream = this.client.streamChat({
                model: fastModelId,
                messages: [
                  { role: 'system', content: 'Anda adalah asisten perangkas percakapan teknis yang andal. Ringkaslah percakapan dengan sangat padat, sebutkan file yang dirubah atau dibuat, keputusan penting, dan status/progress terakhir.' },
                  { role: 'user', content: summaryPrompt }
                ]
              });
              for await (const chunk of stream) {
                summaryText += chunk;
              }
            }
            return summaryText.trim();
          } catch {
            return msgs.map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 100)}`).join('\n');
          }
        };

        const modelMetadata = await this.modelManager.getModel(this.currentModelId);
        const modelContextLength = modelMetadata?.context_length;

        const { compacted, discarded } = this.compactor.compactAndDiscard(
          this.messages,
          this.currentMode,
          modelContextLength
        );

        let compactedMessages = compacted;

        if (discarded.length > 0) {
          const discardTokens = this.tokenManager.countMessageTokens(discarded);
          if (discarded.length >= 4 || discardTokens >= 1000) {
            const summaryText = await summarizeFn(discarded);
            const summaryMsg: Message = {
              role: 'system',
              content: `[Ringkasan percakapan sebelumnya: ${summaryText}]`
            };

            const systemPrompt = compacted[0]?.role === 'system' ? compacted[0] : null;
            const chatMsgs = systemPrompt ? compacted.slice(1) : compacted;
            compactedMessages = systemPrompt ? [systemPrompt, summaryMsg, ...chatMsgs] : [summaryMsg, ...chatMsgs];
          }
        }

        const beforeCount = this.messages.length;
        if (compactedMessages.length < beforeCount) {
          const compactionStats = this.compactor.getCompactionStats(this.messages, compactedMessages);
          if (parseFloat(compactionStats.saving) > 0) {
            Renderer.printStatus(`Context diringkas: ${compactionStats.actual}/${compactionStats.baseline} tokens (Hemat ${compactionStats.saving})`, 'info');
          }
          this.messages = compactedMessages;
        }

        // Tentukan apakah web search diperlukan untuk pesan ini
        const searchDecision = shouldSearch({ prompt: userInput, mode: this.currentSearchMode });
        const tools = searchDecision.search
          ? [createOpenRouterWebSearchTool({ maxResults: 5, maxTotalResults: 10, contextSize: 'low' })]
          : undefined;
        if (searchDecision.search) {
          Renderer.printStatus(`🔍 Web Search aktif — ${searchDecision.reason}`, 'info');
        }

        // ── Ephemeral RAG context untuk request ini ───────────────────
        // Injeksi SETELAH compact agar tidak di-trim compactor.
        // TIDAK masuk ke this.messages — tidak mengakumulasi per-turn.
        // Budget lebih kecil (2000) karena chat lebih dinamis dari command.
        let messagesToSend = compactedMessages;
        try {
          const ragContext = await this.memoryManager.getContextForQuery(userInput, 12_000);
          if (ragContext) {
            // Sisipkan sebagai system message sebelum user message terakhir
            const msgs = [...compactedMessages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx]?.role === 'user') {
              msgs.splice(lastIdx, 0, { role: 'system', content: ragContext });
            } else {
              msgs.push({ role: 'system', content: ragContext });
            }
            messagesToSend = msgs;
          }
        } catch {
          // RAG gagal — tetap lanjut tanpa context
        }

        // Cost guard dijalankan SETELAH RAG injection agar token RAG ikut dihitung.
        // Ini memastikan estimasi biaya akurat sebelum request dikirim ke API.
        const shouldContinueAfterRag = await this.checkCostGuard(messagesToSend);
        if (!shouldContinueAfterRag) {
          this.messages.pop();
          continue;
        }

        // Response frame: tampilkan header sebelum stream
        Renderer.renderResponseStart();
        const responseStartedAt = Date.now();

        let fullResponse = '';
        let responseCostUsd: number | undefined;
        try {
          if (!this.client) {
            throw new Error('Client tidak terinisialisasi.');
          }
          const stream = this.client.streamChat({
            model: this.currentModelId,
            messages: messagesToSend,
            ...(tools && { tools }),
            stream: true
          });

          for await (const chunk of stream) {
            process.stdout.write(chunk);
            fullResponse += chunk;
          }

          // Hitung cost untuk ditampilkan di footer
          const modelMetadataForCost = await this.modelManager.getModel(this.currentModelId);
          if (modelMetadataForCost) {
            const inputTok  = this.tokenManager.countMessageTokens(messagesToSend);
            const outputTok = this.tokenManager.countTextTokens(fullResponse);
            const costResult = this.tokenManager.estimateCost(inputTok, modelMetadataForCost.pricing, outputTok);
            // null = pricing tidak diketahui — jangan tampilkan angka palsu
            responseCostUsd = costResult ?? undefined;
          }

          // Response frame: tampilkan footer dengan timing + cost
          Renderer.renderResponseEnd(Date.now() - responseStartedAt, responseCostUsd);

          this.messages.push({ role: 'assistant', content: fullResponse });
          // logUsage menggunakan messagesToSend (sudah include RAG context)
          // agar log token dan cost akurat sesuai yang benar-benar dikirim ke API.
          await this.logUsage(messagesToSend, fullResponse);

          await this.interceptTerminalProposals(fullResponse);
          await this.interceptAgentActions(fullResponse, userInput);

          // Fire-and-forget upload ke home server (tidak block chat loop)
          // Redact secrets sebelum upload — user bisa tidak sengaja paste token
          const safeUserInput = this.redactor.redact(userInput);
          const safeResponse = this.redactor.redact(fullResponse);
          this.uploadConversationTurn('user', safeUserInput);
          this.uploadConversationTurn('assistant', safeResponse);

          // Rating bar hanya ditampilkan jika user aktifkan via /feedback on (default: off)
          // Cek flag di config — jika tidak ada, skip
          const feedbackEnabled = await this.configManager.getFlag('feedback').catch(() => false);
          if (feedbackEnabled) {
            await this.askFeedback(userInput, fullResponse);
          }

        } catch (error: any) {
          Renderer.printStatus(error.message, 'error');
          console.log('');
        }

      } catch (error) {
        // Outer catch: enquirer cancel (Ctrl+C saat mengetik) atau error tak terduga
        this.isPromptActive = false;

        const isCanceled =
          (error as any)?.message === 'canceled' ||
          (error as any)?.name   === 'AbortError' ||
          error === 'canceled';

        if (isCanceled) {
          // User tekan CTRL+C saat mengetik → batalkan input, loop kembali
          // Jangan exit — hanya clear baris saat ini
          console.log(
            chalk.dim('  [Input dibatalkan. Tekan Ctrl+C lagi atau ketik /exit untuk keluar.]')
          );
          continue; // ← kembali ke awal loop, tampilkan prompt lagi
        }

        // Error lain (bukan cancel) → break loop dan exit normal
        break;
      }
    }

    // Kirim session_end event sebelum keluar (share mode only — anonim)
    // Digunakan untuk menghitung durasi sesi dan completion rate
    if (this.nanoMode === 'share' && this.telemetryClient) {
      this.telemetryClient.sendEvent({
        event: 'session_end',
        model_id: this.currentModelId,
        nano_mode: this.currentMode,
      });
    }

    // P2-04: Hentikan file watcher
    await this.memoryManager.stopWatcher();

    console.log(chalk.yellow('\nSesi chat berakhir. Sampai jumpa!'));
  }

  private async logUsage(inputMessages: Message[], outputText: string) {
    const modelMetadata = await this.modelManager.getModel(this.currentModelId);
    if (!modelMetadata) return;

    const inputTokens  = this.tokenManager.countMessageTokens(inputMessages);
    const outputTokens = this.tokenManager.countTextTokens(outputText);
    const costUsd      = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, outputTokens);

    // Hanya log jika cost diketahui — jangan simpan cost palsu ke stats
    await this.statsManager.logUsage({
      timestamp: Date.now(),
      modelId:   this.currentModelId,
      mode:      this.currentMode,
      inputTokens,
      outputTokens,
      costUsd: costUsd ?? 0,   // 0 = unknown, dibedakan dari NaN/negatif
    });
  }

  private async interceptTerminalProposals(responseText: string): Promise<void> {
    // Cari JSON block, model mungkin menggunakan format {"type": "terminal.propose", "command": ...}
    // Atau model mungkin menggunakan output JSON bebas yang mengandung "command" seperti komplain user.
    
    let commandsToRun: Array<{command: string, reason?: string, cwd?: string}> = [];

    // Coba parser standar: {"type": "terminal.propose", "command": "...", "reason": "..."}
    const proposeRegex = /\{[\s\S]*?"type"\s*:\s*"terminal\.propose"[\s\S]*?\}/g;
    const proposes = responseText.match(proposeRegex);
    if (proposes) {
      for (const match of proposes) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.command) {
            commandsToRun.push({ command: parsed.command, reason: parsed.reason });
          }
        } catch (e) {}
      }
    }

    // Jika kosong, tidak ada fallback ke JSON block bebas.
    // BUG-03 fix: fallback parser sebelumnya mencari 'parsed.command' dari JSON block
    // sembarangan — sangat rentan false positive. Jika AI memberi contoh JSON yang
    // kebetulan punya field 'command', approval dialog akan muncul padahal bukan proposal.
    // Terminal Bridge hanya aktif jika model menggunakan format eksplisit 'terminal.propose'.

    for (const proposal of commandsToRun) {
      console.log(chalk.yellow(`\n[Terminal Bridge] AI mengusulkan perintah:`));
      console.log(chalk.cyan(`  ${proposal.command}`));
      if (proposal.cwd) console.log(chalk.dim(`  CWD: ${proposal.cwd}`));
      if (proposal.reason) console.log(chalk.dim(`  Alasan: ${proposal.reason}\n`));
      
      const confirmPrompt = new Confirm({
        name: 'run',
        message: 'Izinkan NanoCLI menjalankan perintah ini?'
      });
      
      try {
        const approved = await confirmPrompt.run();
        if (approved) {
           const result = await this.terminalCommand.run(proposal.command, proposal.cwd ? { cwd: proposal.cwd } : {});
           if (result && result.output) {
              const safeOutput = result.output.substring(0, 5000); // Batasi output agar token tidak meledak
              this.messages.push({ 
                role: 'user', 
                content: `Output dari perintah \`${proposal.command}\`:\n\`\`\`\n${safeOutput}\n\`\`\`\nSilakan lanjutkan analisa atau beri perintah selanjutnya jika diperlukan.` 
              });
              Renderer.printStatus('Output perintah ditambahkan ke konteks percakapan untuk turn berikutnya.', 'success');
           }
        } else {
           this.messages.push({ 
             role: 'user', 
             content: `User MENOLAK untuk menjalankan perintah: \`${proposal.command}\`. Tolong berikan solusi lain tanpa perintah ini.` 
           });
        }
      } catch (e) {
        console.log(chalk.dim('Prompt dibatalkan.'));
      }
    }
  }

  /**
   * Intercept agent actions (file.write, file.patch, terminal.run) dari response AI.
   *
   * Jika AI mengeluarkan JSON action block dalam format agent,
   * tanya user apakah ingin menjalankan AgentLoop secara inline.
   *
   * Ini adalah "Auto-detect Agent Mode" — user tidak perlu tahu kapan
   * harus pakai `nanocli agent` vs `nanocli chat`.
   */
  private async interceptAgentActions(responseText: string, originalUserTask: string): Promise<void> {
    // Deteksi: apakah ada JSON agent action block dalam response?
    // Format: ```json\n{"type": "file.write"|"file.patch"|"terminal.run", ...}\n```
    const agentActionTypes = ['file.write', 'file.patch', 'file.read', 'terminal.run'];
    
    // Cari semua JSON blocks
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n?```/g;
    let match: RegExpExecArray | null;
    const detectedActions: string[] = [];

    while ((match = jsonBlockRegex.exec(responseText)) !== null) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.type && agentActionTypes.includes(parsed.type)) {
          detectedActions.push(parsed.type);
        }
      } catch {
        // bukan valid JSON, skip
      }
    }

    // Juga deteksi inline JSON tanpa code block
    const inlineJsonRegex = /\{"type"\s*:\s*"(file\.write|file\.patch|file\.read|terminal\.run)"[\s\S]*?\}/g;
    while ((match = inlineJsonRegex.exec(responseText)) !== null) {
      if (match[1]) detectedActions.push(match[1]);
    }

    if (detectedActions.length === 0) {
      // Tidak ada agent action — tapi cek apakah AI merespons dengan kode panjang
      // tanpa membuat file (false negative detection)
      // Jika response berisi code block yang besar, tanya user
      if (this.hasAgentIntent(originalUserTask, responseText)) {
        // Tanya apakah ingin dijalankan sebagai agent task
        console.log('');
        console.log(
          chalk.dim('  💡  AI memberikan kode yang bisa langsung dibuat jadi file. ') +
          chalk.cyan('Jalankan sebagai agent?') +
          chalk.dim(' (/agent untuk konfirmasi)')
        );
        console.log('');
      }
      return;
    }

    // Ada agent action — tampilkan notifikasi dan tanya konfirmasi
    const uniqueActions = [...new Set(detectedActions)];
    console.log('');
    console.log(chalk.cyan('  ⚡  Agent Mode Detected'));
    console.log(chalk.dim(`  AI menyiapkan: ${uniqueActions.join(', ')}`));
    console.log(chalk.dim(`  Task: "${originalUserTask.slice(0, 80)}${originalUserTask.length > 80 ? '...' : ''}"`));
    console.log('');

    const confirmPrompt = new Confirm({
      name: 'runAgent',
      message: chalk.cyan('Jalankan agent untuk mengeksekusi perubahan file secara langsung?'),
    });

    let approved = false;
    try {
      approved = await confirmPrompt.run();
    } catch {
      return; // dibatalkan dengan Ctrl+C
    }

    if (!approved) {
      console.log(chalk.dim('  Agent dibatalkan. Kode di atas bisa kamu copy-paste secara manual.\n'));
      return;
    }

    // Jalankan AgentLoop dengan task yang sama
    const apiKey = await this.configManager.getApiKey();
    if (!apiKey) {
      Renderer.printStatus('API Key tidak ditemukan.', 'error');
      return;
    }

    console.log('');
    Renderer.printStatus('Memulai Agent Mode...', 'info');
    console.log('');

    try {
      const agentState = await this.agentLoop.run(originalUserTask, apiKey, {
        maxSteps: 10,
        mode: this.currentMode,
        modelId: this.currentModelId,
        permission: 'workspace',
        dryRun: false,
        verbose: false,
      });

      // Inject hasil agent ke dalam context chat agar percakapan tetap nyambung
      if (agentState.filesChanged.length > 0 || agentState.commandsRun.length > 0) {
        const summary = [
          `[Agent selesai]`,
          agentState.filesChanged.length > 0
            ? `Files dibuat/diubah: ${agentState.filesChanged.join(', ')}`
            : '',
          agentState.commandsRun.length > 0
            ? `Commands dijalankan: ${agentState.commandsRun.join(', ')}`
            : '',
        ].filter(Boolean).join('\n');

        this.messages.push({
          role: 'user',
          content: `${summary}\n\nAgent telah menyelesaikan task. Apakah ada hal lain yang perlu disesuaikan atau langkah selanjutnya?`,
        });
      }
    } catch (err: any) {
      Renderer.printStatus(`Agent error: ${err.message}`, 'error');
    }
  }

  /**
   * Upload satu turn percakapan ke home server.
   * HANYA aktif di self-host mode.
   * Fire-and-forget — tidak pernah throw.
   */
  private uploadConversationTurn(role: 'user' | 'assistant', content: string): void {
    // Hanya self-host yang kirim konten percakapan
    if (this.nanoMode !== 'self-host' || !this.homeClient) return;
    if (content.trim().length < 20) return;

    this.homeClient.ingestConversationTurn({
      session_id: this.sessionId,
      ...(this.projectName ? { project_name: this.projectName } : {}),
      role,
      content,
    });
  }

  /**
   * Tampilkan prompt rating response setelah setiap assistant response.
   *
   * UX: satu baris di bawah response:
   *   Rate: [g] good  [b] bad  [Enter] skip
   *
   * User tekan satu tombol tanpa Enter. Feedback disimpan ke SQLite + home server.
   * Jika terminal tidak interaktif (pipe/CI), langsung skip.
   */
  private async askFeedback(userInput: string, responseText: string): Promise<void> {
    if (!process.stdin.isTTY) return;

    process.stdout.write(chalk.dim('  Rate: [g] good  [b] bad  [Enter] skip  '));
    const key = await this.readSingleKey();
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    let rating: 1 | -1 | 0 = 0;
    if (key === 'g' || key === 'G') {
      rating = 1;
      process.stdout.write(chalk.green('  ✓ Marked as good\n\n'));
    } else if (key === 'b' || key === 'B') {
      rating = -1;
      process.stdout.write(chalk.red('  ✗ Marked as bad\n\n'));
    } else {
      process.stdout.write('\n');
      return; // skip — tidak simpan apapun
    }

    // ─── Simpan lokal (semua mode) ───────────────────────────────
    await this.memoryManager.saveFeedback({
      sessionId: this.sessionId,
      responsePreview: responseText.slice(0, 200),
      rating,
      promptPreview: userInput.slice(0, 100),
      modelId: this.currentModelId,
    });

    // ─── Kirim telemetry (share mode only — tanpa konten) ────────
    if (this.nanoMode === 'share' && this.telemetryClient) {
      this.telemetryClient.sendEvent({
        event: 'feedback',
        rating,
        model_id: this.currentModelId,
        nano_mode: this.currentMode,
        // TIDAK kirim responsePreview atau promptPreview
      });
    }
  }

  /**
   * Baca satu keystroke dari stdin tanpa menunggu Enter.
   * Menggunakan raw mode untuk menangkap karakter tunggal.
   *
   * BUG-02 fix:
   * - Hapus readline.createInterface yang tidak digunakan dan dapat menyebabkan
   *   stdin conflict (readline dan manual listener masing-masing listen stdin).
   * - Gunakan stdin.once alih-alih stdin.on agar listener auto-cleanup.
   * - Perbaiki urutan: set encoding sebelum resume.
   */
  private readSingleKey(): Promise<string> {
    return new Promise(resolve => {
      // Set encoding sebelum resume agar data event sudah dalam bentuk string
      process.stdin.setEncoding('utf8');

      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      // once() auto-remove listener setelah trigger pertama — tidak perlu cleanup manual
      process.stdin.once('data', (key: string) => {
        process.stdin.pause();
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
        // Ctrl+C: exit gracefully
        if (key === '\u0003') process.exit();
        resolve(key);
      });
    });
  }


  private async checkCostGuard(messages: Message[]): Promise<boolean> {
    const modelMetadata = await this.modelManager.getModel(this.currentModelId);
    if (!modelMetadata) return true;

    const inputTokens = this.tokenManager.countMessageTokens(messages);
    const estimatedCost = this.tokenManager.estimateCost(inputTokens, modelMetadata.pricing, 1000);

    const threshold = 0.05;
    const isHighMode = this.currentMode === 'high' || this.currentMode === 'extra-high';

    // null = pricing tidak diketahui — tidak bisa guard, izinkan lanjut
    if (estimatedCost === null) return true;

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
        // Picu ekstraksi memori sesi sebelum keluar
        await this.extractAndSaveSessionMemory();
        return true;

      case '/help':
        this.displayHelp();
        break;

      case '/clear':
        const systemPromptForClear = await this.promptBuilder.buildSystemPrompt('chat');
        this.messages = [{ role: 'system', content: systemPromptForClear }];
        console.clear();
        await this.displayWelcome();
        break;

      case '/compact':
        const before = this.tokenManager.countMessageTokens(this.messages);
        const compactMeta = await this.modelManager.getModel(this.currentModelId);
        this.messages = await this.compactor.compactMessages(this.messages, this.currentMode, compactMeta?.context_length);
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

      case '/run': {
        const commandText = args.join(' ').trim();
        if (!commandText) {
          Renderer.printStatus('Penggunaan: /run <command>', 'error');
          console.log('');
          break;
        }

        await this.terminalCommand.run(commandText);
        break;
      }

      case '/terminal': {
        const subCommand = args[0]?.toLowerCase();
        if (subCommand === 'detect') {
          await this.terminalCommand.detect();
        } else {
          Renderer.printStatus('Penggunaan: /terminal detect', 'error');
          console.log('');
        }
        break;
      }

      case '/feedback': {
        const val = args[0]?.toLowerCase();
        if (val === 'on' || val === 'off') {
          const enabled = val === 'on';
          await this.configManager.setFlag('feedback', enabled);
          Renderer.printStatus(
            `Rating bar ${enabled ? chalk.green('diaktifkan') : chalk.dim('dinonaktifkan')}. Berlaku mulai response berikutnya.`,
            'success'
          );
          console.log('');
        } else {
          const current = await this.configManager.getFlag('feedback').catch(() => undefined);
          console.log(chalk.cyan(`\n  Feedback saat ini: ${current ? chalk.green('on') : chalk.dim('off')}`) +
            chalk.dim('  (gunakan /feedback on | off)\n'));
        }
        break;
      }

      case '/agent': {
        const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) {
          Renderer.printStatus('Tidak ada task sebelumnya yang bisa dijalankan oleh agent.', 'error');
          console.log('');
          break;
        }

        const apiKey = await this.configManager.getApiKey();
        if (!apiKey) {
          Renderer.printStatus('API Key tidak ditemukan.', 'error');
          console.log('');
          break;
        }

        console.log('');
        Renderer.printStatus('Memulai Agent Mode untuk task sebelumnya...', 'info');
        console.log(chalk.dim(`Task: "${lastUserMsg.content}"\n`));

        try {
          const agentState = await this.agentLoop.run(lastUserMsg.content, apiKey, {
            maxSteps: 10,
            mode: this.currentMode,
            modelId: this.currentModelId,
            permission: 'workspace',
            dryRun: false,
            verbose: false,
          });

          if (agentState.filesChanged.length > 0 || agentState.commandsRun.length > 0) {
            const summary = [
              `[Agent selesai]`,
              agentState.filesChanged.length > 0
                ? `Files dibuat/diubah: ${agentState.filesChanged.join(', ')}`
                : '',
              agentState.commandsRun.length > 0
                ? `Commands dijalankan: ${agentState.commandsRun.join(', ')}`
                : '',
            ].filter(Boolean).join('\n');

            this.messages.push({
              role: 'user',
              content: `${summary}\n\nAgent telah menyelesaikan task. Apakah ada hal lain yang perlu disesuaikan atau langkah selanjutnya?`,
            });
          }
        } catch (err: any) {
          Renderer.printStatus(`Agent error: ${err.message}`, 'error');
        }
        break;
      }

      case '/memory': {
        const sub = args[0]?.toLowerCase();

        if (sub === 'review') {
          const entries = await this.memoryManager.listMemoryEntries(20);
          if (entries.length === 0) {
            Renderer.printStatus('Belum ada memory entries. Gunakan /memory save <teks> untuk menyimpan.', 'info');
            console.log('');
            break;
          }
          console.log(chalk.cyan('\nMemory Entries (20 terbaru):'));
          const rows = entries.map(e => [
            String(e.id),
            chalk.yellow(e.type),
            e.scope,
            e.source,
            chalk.dim(e.confidence.toFixed(2)),
            e.content.slice(0, 45).replace(/\n/g, ' ') + (e.content.length > 45 ? '...' : ''),
            chalk.dim(new Date(e.timestamp).toLocaleDateString('id-ID')),
          ]);
          Renderer.renderTable(['ID', 'Type', 'Scope', 'Source', 'Conf', 'Content', 'Tanggal'], rows);
          console.log('');

        } else if (sub === 'save') {
          const text = args.slice(1).join(' ').trim();
          if (!text) {
            Renderer.printStatus('Penggunaan: /memory save <teks>', 'error');
            console.log('');
            break;
          }
          await this.memoryManager.saveMemoryEntry({
            type:       'preference',
            content:    text,
            timestamp:  Date.now(),
            scope:      'user',
            source:     'manual',
            confidence: 1.0,
          });
          Renderer.printStatus('Memory disimpan.', 'success');
          console.log('');

        } else if (sub === 'forget') {
          const idStr = args[1];
          const id = idStr ? parseInt(idStr, 10) : NaN;
          if (isNaN(id)) {
            Renderer.printStatus('Penggunaan: /memory forget <id>  (lihat ID via /memory review)', 'error');
            console.log('');
            break;
          }
          // Konfirmasi sebelum hapus
          const confirmPrompt = new Confirm({
            name: 'ok',
            message: `Hapus memory entry ID ${id}?`,
          });
          let confirmed = false;
          try { confirmed = await confirmPrompt.run(); } catch { /* user cancel */ }
          if (!confirmed) {
            Renderer.printStatus('Dibatalkan.', 'info');
            console.log('');
            break;
          }
          const deleted = await this.memoryManager.deleteMemoryEntry(id);
          if (deleted) {
            Renderer.printStatus(`Memory ID ${id} berhasil dihapus.`, 'success');
          } else {
            Renderer.printStatus(`Memory ID ${id} tidak ditemukan.`, 'error');
          }
          console.log('');

        } else if (sub === 'auto') {
          const val = args[1]?.toLowerCase();
          if (val === 'on') {
            await this.configManager.setFlag('memoryAutoExtract', true);
            this.memoryAutoOn = true;
            Renderer.printStatus(
              `Auto-memory ${chalk.green('diaktifkan')}. Memory preferensi akan diekstrak otomatis saat /exit.`,
              'success'
            );
            console.log('');
          } else if (val === 'off') {
            await this.configManager.setFlag('memoryAutoExtract', false);
            this.memoryAutoOn = false;
            Renderer.printStatus(
              `Auto-memory ${chalk.dim('dinonaktifkan')}.`,
              'success'
            );
            console.log('');
          } else {
            const current = await this.configManager.getFlag('memoryAutoExtract').catch(() => true);
            console.log(
              chalk.cyan(`\n  Auto-memory: ${current ? chalk.green('on') : chalk.dim('off')}`) +
              chalk.dim('  (gunakan /memory auto on | off)\n')
            );
          }

        } else {
          console.log(chalk.cyan('\nPerintah /memory:'));
          console.log(chalk.dim('  /memory review          ') + chalk.white('Tampilkan 20 memory entries terakhir'));
          console.log(chalk.dim('  /memory save <teks>     ') + chalk.white('Simpan memory manual'));
          console.log(chalk.dim('  /memory forget <id>     ') + chalk.white('Hapus memory berdasarkan ID'));
          console.log(chalk.dim('  /memory auto on|off     ') + chalk.white('Aktifkan/nonaktifkan auto-extraction saat /exit'));
          console.log(chalk.dim('  /memory auto            ') + chalk.white('Lihat status auto-extraction'));
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

  private async displayWelcome() {
    Renderer.renderBanner('1.0.0');

    // Ambil nama project dari config atau fallback ke nama folder
    const projectName = this.projectName ||
      require('path').basename(process.cwd());

    // Cek apakah memory aktif (.nanocli ada)
    const memActive = await require('fs-extra').pathExists(
      require('path').join(process.cwd(), '.nanocli')
    );

    Renderer.renderSessionInfo({
      project:      projectName,
      mode:         this.currentMode,
      modelId:      this.currentModelId,
      searchMode:   this.currentSearchMode,
      memoryActive: memActive,
    });
  }

  private hasAgentIntent(userInput: string, responseText: string): boolean {
    const codeBlockCount = (responseText.match(/```/g) ?? []).length / 2;
    if (codeBlockCount < 1) return false;

    const userLower = userInput.toLowerCase();
    const responseLower = responseText.toLowerCase();

    const intentKeywords = [
      'buat file', 'membuat file', 'create file', 'write to', 'writing to', 'save to', 'simpan ke', 
      'tulis ke', 'modify file', 'edit file', 'update file', 'perbarui file', 'tambahkan ke file', 
      'add to file', 'file baru', 'new file', 'buat code', 'buat kode', 'tulis kode',
      'setup file', 'inisialisasi file', 'create a file'
    ];

    const hasKeyword = intentKeywords.some(kw => userLower.includes(kw) || responseLower.includes(kw));
    
    const fileIndicators = [
      'simpan di', 'simpan sebagai', 'save as', 'save in', 'tulis di', 'path:', 'file path', 
      'berikut adalah isi', 'berikut kode', 'buat class', 'buat fungsi'
    ];
    const hasIndicator = fileIndicators.some(ind => responseLower.includes(ind));

    return responseText.length > 1000 && (hasKeyword || hasIndicator);
  }

  private displayHelp() {
    Renderer.renderHelpMenu();
  }

  // ─── Memory Extraction ──────────────────────────────────────────────────

  /**
   * Ekstrak preferensi dari riwayat sesi dan simpan ke SQLite.
   *
   * Dipicu oleh:
   * - /exit dan /quit (normal exit)
   * - SIGINT handler (Ctrl+C)
   *
   * Guard:
   * - Tidak berjalan jika flag memoryAutoExtract = false
   * - Tidak berjalan jika client belum init atau < 2 pesan
   * - Timeout 12 detik — jika habis, exit tetap normal
   * - Deduplication: skip kandidat yang mirip dengan entry existing
   * - Conflict detection: tampilkan warning jika ada preferensi bertentangan
   */
  private async extractAndSaveSessionMemory(): Promise<void> {
    try {
      // 1. Cek flag
      const enabled = await this.configManager.getFlag('memoryAutoExtract').catch(() => true);
      if (!enabled) return;

      // 2. Cek client dan minimum konten
      if (!this.client) return;
      const chatMessages = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      if (chatMessages.length < 2) return;

      // P1-06: Quiet extraction — tidak tampilkan loading message agar exit terasa bersih.
      // Proses berjalan di background, user hanya melihat ringkasan akhir.

      // 3. Jalankan extractor
      const fastModelId = await this.configManager.getModelForMode('fast');

      const extractor = new MemoryExtractor();
      const candidates = await extractor.extract({
        client:   this.client,
        modelId:  fastModelId,
        messages: this.messages,
      });

      if (candidates.length === 0) return; // Tidak ada kandidat — exit tanpa noise

      // 4. Ambil existing entries untuk deduplication
      const existing = await this.memoryManager.listMemoryEntries(100);
      const existingNormalized = existing.map(e =>
        e.content.toLowerCase().replace(/\s+/g, ' ').trim()
      );

      let saved = 0;
      let conflicts = 0;

      for (const candidate of candidates) {
        const candidateNorm = candidate.content.toLowerCase().replace(/\s+/g, ' ').trim();

        // Deduplication check
        const isDuplicate = existingNormalized.some(ex => {
          if (Math.abs(ex.length - candidateNorm.length) > 100) return false;
          const shorter = ex.length < candidateNorm.length ? ex : candidateNorm;
          const longer  = ex.length < candidateNorm.length ? candidateNorm : ex;
          return longer.includes(shorter) ||
                 (shorter.length > 20 && longer.includes(shorter.slice(0, Math.floor(shorter.length * 0.8))));
        });

        if (isDuplicate) continue; // Skip duplikat tanpa noise

        // Conflict detection (silent — hanya increment counter)
        const sameTypeScopeEntries = existing.filter(
          e => e.type === candidate.type && e.scope === (candidate.scope ?? 'project')
        );
        if (sameTypeScopeEntries.length > 0) {
          const topicWords = candidateNorm.split(' ').filter(w => w.length > 4).slice(0, 3);
          const possibleConflict = sameTypeScopeEntries.some(e =>
            topicWords.some(word => e.content.toLowerCase().includes(word))
          );
          if (possibleConflict) conflicts++;
        }

        // Simpan ke SQLite
        await this.memoryManager.saveMemoryEntry({
          type:       candidate.type,
          content:    candidate.content,
          timestamp:  Date.now(),
          scope:      candidate.scope,
          source:     'chat_extractor',
          confidence: candidate.confidence,
        });
        saved++;
      }

      // Ringkasan satu baris — hanya jika ada yang disimpan
      if (saved > 0) {
        const conflictNote = conflicts > 0 ? ` (${conflicts} potensi konflik — cek /memory review)` : '';
        Renderer.printStatus(`Memory: ${saved} entri baru disimpan.${conflictNote}`, 'success');
      }

    } catch (err: any) {
      // Quiet error — tidak tampilkan stack trace saat exit
      Renderer.printStatus(`[Memory] Extraction gagal: ${err?.message ?? 'unknown error'}`, 'warn');
    }
  }

}
