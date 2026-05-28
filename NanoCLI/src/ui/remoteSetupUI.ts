/**
 * remoteSetupUI.ts
 *
 * Interactive wizard untuk mengonfigurasi mode koneksi NanoCLI:
 *   - Local    : hanya SQLite, zero network
 *   - Share    : anonymous telemetry untuk perkembangan CLI
 *   - Self-host: koneksi ke server RAG sendiri (full fitur)
 */

import chalk from 'chalk';
import { ConfigManager, NanoCLIMode } from '../files/configManager';
import { HomeServerClient } from '../remote/homeServerClient';
import { TelemetryClient, NANOCLI_TELEMETRY_URL } from '../remote/telemetryClient';

const { Select, Input, Confirm, Password } = require('enquirer');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function printHeader(title: string) {
  console.log('\n' + chalk.bold.cyan('┌' + '─'.repeat(56) + '┐'));
  console.log(chalk.bold.cyan('│') + chalk.bold(` NanoCLI — ${title}`.padEnd(56)) + chalk.bold.cyan('│'));
  console.log(chalk.bold.cyan('└' + '─'.repeat(56) + '┘') + '\n');
}

function printBox(lines: string[]) {
  const width = 56;
  console.log(chalk.dim('┌' + '─'.repeat(width) + '┐'));
  for (const line of lines) {
    console.log(chalk.dim('│') + ' ' + line.padEnd(width - 1) + chalk.dim('│'));
  }
  console.log(chalk.dim('└' + '─'.repeat(width) + '┘'));
}

// ─── Setup Guide (Self-host, belum punya server) ─────────────────────────────

function printSelfHostGuide() {
  console.log('\n' + chalk.yellow('  To set up your own NanoCLI server:\n'));
  console.log(chalk.dim('  1. Download server files from the repository:'));
  console.log(chalk.cyan('     https://github.com/yourname/nanocli/tree/main/nanocli-server\n'));
  console.log(chalk.dim('  2. Configure environment:'));
  console.log(chalk.white('     cp .env.example .env'));
  console.log(chalk.white('     nano .env') + chalk.dim('   ← fill DB_PASSWORD & NANOCLI_API_KEY\n'));
  console.log(chalk.dim('  3. Start all services:'));
  console.log(chalk.white('     docker compose up -d\n'));
  console.log(chalk.dim('  4. Pull embedding model:'));
  console.log(chalk.white('     docker compose exec nanocli-ollama ollama pull nomic-embed-text\n'));
  console.log(chalk.dim('  5. Verify server is running:'));
  console.log(chalk.white('     curl http://localhost:8080/health\n'));
  console.log(chalk.dim('  Once your server is ready, run:'));
  console.log(chalk.cyan('     nanocli remote setup\n'));
}

// ─── Main Class ──────────────────────────────────────────────────────────────

export class RemoteSetupUI {
  private configManager: ConfigManager;

  constructor(projectRoot: string = process.cwd()) {
    this.configManager = new ConfigManager(projectRoot);
  }

  async startSetup(): Promise<void> {
    printHeader('Connection Mode Setup');

    const currentMode = await this.configManager.getMode();

    const modeSelect = new Select({
      name: 'mode',
      message: 'How do you want NanoCLI to work?',
      choices: [
        {
          name: 'local',
          message: [
            chalk.bold('Local'),
            chalk.dim('  Only local memory (SQLite). Zero network. Maximum privacy.'),
          ].join('\n       '),
        },
        {
          name: 'share',
          message: [
            chalk.bold('Share'),
            chalk.dim('  Local memory + send anonymous usage stats to improve NanoCLI.'),
            chalk.dim('  Your code and conversations are NEVER sent.'),
          ].join('\n       '),
        },
        {
          name: 'self-host',
          message: [
            chalk.bold('Self-host'),
            chalk.dim('  Connect to your own NanoCLI server for full semantic search'),
            chalk.dim('  and cross-session memory. Your data stays on your server.'),
          ].join('\n       '),
        },
      ],
      hint: currentMode !== 'local' ? `(current: ${currentMode})` : '',
    });

    let selectedMode: NanoCLIMode;
    try {
      selectedMode = await modeSelect.run();
    } catch {
      // User tekan Escape / Ctrl+C
      console.log(chalk.dim('\n  Setup cancelled.\n'));
      return;
    }

    switch (selectedMode) {
      case 'local':
        await this.setupLocal();
        break;
      case 'share':
        await this.setupShare();
        break;
      case 'self-host':
        await this.setupSelfHost();
        break;
    }
  }

  // ─── LOCAL ──────────────────────────────────────────────────────────────────

  private async setupLocal(): Promise<void> {
    await this.configManager.setMode('local');
    console.log('\n' + chalk.green('  ✓ Local mode activated.'));
    console.log(chalk.dim('    Memory stored in: .nanocli/index/memory.sqlite'));
    console.log(chalk.dim('    No network calls will be made.\n'));
  }

  // ─── SHARE ──────────────────────────────────────────────────────────────────

  private async setupShare(): Promise<void> {
    console.log('\n');
    printBox([
      chalk.bold('What will be sent to NanoCLI servers:'),
      '',
      chalk.green('  ✓') + '  Which commands you use (ask, review, debug...)',
      chalk.green('  ✓') + '  Response ratings (good/bad) — rating value only',
      chalk.green('  ✓') + '  Error types — no stack traces',
      chalk.green('  ✓') + '  Model and mode usage statistics',
      chalk.green('  ✓') + '  Response time ranges',
      '',
      chalk.red('  ✗') + '  Your code or file contents',
      chalk.red('  ✗') + '  Your conversations or prompts',
      chalk.red('  ✗') + '  Project names or file paths',
      chalk.red('  ✗') + '  Anything that identifies you personally',
    ]);

    console.log('');

    const consent = new Confirm({
      name: 'consent',
      message: 'I understand and agree to send anonymous usage data',
      initial: false,
    });

    let agreed: boolean;
    try {
      agreed = await consent.run();
    } catch {
      console.log(chalk.dim('\n  Setup cancelled.\n'));
      return;
    }

    if (!agreed) {
      console.log(chalk.yellow('\n  Share mode not activated. No data will be sent.\n'));
      return;
    }

    // Optional: test server reachability
    process.stdout.write(chalk.dim('  Checking telemetry server...'));
    const client = new TelemetryClient(NANOCLI_TELEMETRY_URL);
    const available = await client.isAvailable();

    if (available) {
      process.stdout.write(chalk.green(' ✓\n'));
    } else {
      process.stdout.write(chalk.yellow(' ⚠ (server unreachable, will retry automatically)\n'));
    }

    await this.configManager.setMode('share');
    console.log('\n' + chalk.green('  ✓ Share mode enabled. Thank you for helping improve NanoCLI!'));
    console.log(chalk.dim('    Telemetry server: ' + NANOCLI_TELEMETRY_URL + '\n'));
  }

  // ─── SELF-HOST ───────────────────────────────────────────────────────────────

  private async setupSelfHost(): Promise<void> {
    const hasServerPrompt = new Select({
      name: 'hasServer',
      message: 'Do you already have a NanoCLI server running?',
      choices: [
        { name: 'yes', message: 'Yes, my server is ready' },
        { name: 'no',  message: 'No, I need setup instructions' },
      ],
    });

    let hasServer: string;
    try {
      hasServer = await hasServerPrompt.run();
    } catch {
      console.log(chalk.dim('\n  Setup cancelled.\n'));
      return;
    }

    if (hasServer === 'no') {
      printSelfHostGuide();
      return;
    }

    // ─── Input URL ──────────────────────────────────────────────
    let url: string;
    try {
      url = await new Input({
        name: 'url',
        message: 'Server URL',
        hint: 'e.g. https://nano.yourdomain.com or http://localhost:8080',
        validate: (v: string) =>
          v.startsWith('http') || 'URL must start with http:// or https://',
      }).run();
    } catch {
      console.log(chalk.dim('\n  Setup cancelled.\n'));
      return;
    }

    // ─── Input API Key ──────────────────────────────────────────
    let apiKey: string;
    try {
      apiKey = await new Password({
        name: 'apiKey',
        message: 'API Key (from your server .env NANOCLI_API_KEY)',
        validate: (v: string) =>
          v.trim().length >= 8 || 'API Key must be at least 8 characters',
      }).run();
    } catch {
      console.log(chalk.dim('\n  Setup cancelled.\n'));
      return;
    }

    // ─── Test Connection ────────────────────────────────────────
    process.stdout.write('\n' + chalk.dim('  Testing connection...'));

    const client = new HomeServerClient(url.trim(), apiKey.trim());
    const health = await client.getHealth();

    if (!health) {
      process.stdout.write(chalk.red(' ✗\n\n'));
      console.log(chalk.red('  Cannot reach ' + url.trim()));
      console.log(chalk.dim('  Make sure your server is running and the URL is correct.\n'));

      const retrySelect = new Select({
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'retry',  message: 'Try a different URL or API key' },
          { name: 'save',   message: 'Save anyway and retry connection later' },
          { name: 'cancel', message: 'Cancel setup' },
        ],
      });

      let action: string;
      try {
        action = await retrySelect.run();
      } catch {
        return;
      }

      if (action === 'retry') {
        return this.setupSelfHost();
      } else if (action === 'cancel') {
        return;
      }
      // 'save' → lanjut simpan
    } else {
      process.stdout.write(chalk.green(' ✓\n'));
    }

    // ─── Show Status ────────────────────────────────────────────
    if (health) {
      const statusIcon = health.status === 'ok' ? chalk.green('✓ OK') : chalk.yellow('⚠ Degraded');
      console.log('');
      printBox([
        chalk.bold('Server Status'),
        '',
        `  Status   : ${statusIcon}`,
        `  Database : ${health.database ? chalk.green('✓ Connected') : chalk.red('✗ Not connected')}`,
        `  Ollama   : ${health.ollama ? chalk.green('✓ Ready') : chalk.yellow('✗ Not ready (semantic search disabled)')}`,
        `  Model    : ${chalk.dim(health.embed_model)}`,
        `  URL      : ${chalk.dim(url.trim())}`,
      ]);

      if (!health.ollama) {
        console.log('\n' + chalk.yellow('  To enable semantic search, run on your server:'));
        console.log(chalk.dim('  docker compose exec nanocli-ollama ollama pull ' + health.embed_model));
      }
    }

    // ─── Save Config ────────────────────────────────────────────
    await this.configManager.setMode('self-host');
    await this.configManager.saveRemoteConfig({ url: url.trim(), apiKey: apiKey.trim() });

    console.log('\n' + chalk.green('  ✓ Self-host mode activated!'));
    console.log(chalk.dim('    Your data stays on: ' + url.trim()));
    console.log(chalk.dim('    Run "nanocli remote status" anytime to check connection.\n'));
  }

  // ─── Status Display ──────────────────────────────────────────────────────────

  async showStatus(): Promise<void> {
    printHeader('Connection Status');

    const mode = await this.configManager.getMode();

    switch (mode) {
      case 'local': {
        printBox([
          `  Mode     : ${chalk.bold.white('LOCAL')}`,
          '',
          `  Memory   : .nanocli/index/memory.sqlite`,
          `  Network  : ${chalk.green('None (maximum privacy)')}`,
        ]);
        console.log('');
        break;
      }

      case 'share': {
        process.stdout.write(chalk.dim('  Checking telemetry server...'));
        const client = new TelemetryClient(NANOCLI_TELEMETRY_URL);
        const available = await client.isAvailable();
        process.stdout.write(available ? chalk.green(' ✓\n') : chalk.yellow(' ⚠\n'));

        printBox([
          `  Mode     : ${chalk.bold.white('SHARE')}`,
          '',
          `  Server   : ${chalk.dim(NANOCLI_TELEMETRY_URL)}`,
          `  Reachable: ${available ? chalk.green('Yes') : chalk.yellow('No (will retry)')}`,
          '',
          `  Sends: command stats, feedback ratings, error types`,
          `  Never: code, conversations, file paths`,
        ]);
        console.log('');
        break;
      }

      case 'self-host': {
        const remoteConfig = await this.configManager.getRemoteConfig();
        if (!remoteConfig) {
          console.log(chalk.yellow('  Self-host mode selected but no server configured.'));
          console.log(chalk.dim('  Run: nanocli remote setup\n'));
          break;
        }

        process.stdout.write(chalk.dim('  Connecting to ' + remoteConfig.url + '...'));
        const client = new HomeServerClient(remoteConfig.url, remoteConfig.apiKey);
        const health = await client.getHealth();

        if (!health) {
          process.stdout.write(chalk.red(' ✗\n'));
          printBox([
            `  Mode     : ${chalk.bold.white('SELF-HOST')}`,
            `  Server   : ${chalk.dim(remoteConfig.url)}`,
            `  Status   : ${chalk.red('✗ Unreachable')}`,
          ]);
        } else {
          process.stdout.write(chalk.green(' ✓\n'));
          printBox([
            `  Mode     : ${chalk.bold.white('SELF-HOST')}`,
            '',
            `  Status   : ${health.status === 'ok' ? chalk.green('✓ OK') : chalk.yellow('⚠ Degraded')}`,
            `  Database : ${health.database ? chalk.green('✓') : chalk.red('✗')}`,
            `  Ollama   : ${health.ollama ? chalk.green('✓') : chalk.yellow('✗ (semantic search disabled)')}`,
            `  Model    : ${chalk.dim(health.embed_model)}`,
            `  URL      : ${chalk.dim(remoteConfig.url)}`,
          ]);
        }
        console.log('');
        break;
      }
    }
  }
}
