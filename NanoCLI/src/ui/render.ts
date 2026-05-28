import { marked } from 'marked';
const TerminalRenderer = require('marked-terminal');
import chalk from 'chalk';
import Table from 'cli-table3';

// ─── Marked renderer (terminal) ──────────────────────────────────────────────

const _renderer = typeof TerminalRenderer === 'function'
  ? new TerminalRenderer({
      code: chalk.yellow,
      blockquote: chalk.gray.italic,
      html: chalk.gray,
      heading: chalk.cyan.bold,
      firstHeading: chalk.magenta.underline.bold,
      hr: chalk.reset,
      listitem: chalk.white,
      table: chalk.reset,
      paragraph: chalk.white,
      strong: chalk.bold,
      em: chalk.italic,
      codespan: chalk.yellow.bgBlack,
      del: chalk.dim.strikethrough,
      link: chalk.blue,
      href: chalk.blue.underline,
    })
  : new TerminalRenderer.default({
      code: chalk.yellow,
      blockquote: chalk.gray.italic,
      html: chalk.gray,
      heading: chalk.cyan.bold,
      firstHeading: chalk.magenta.underline.bold,
      hr: chalk.reset,
      listitem: chalk.white,
      table: chalk.reset,
      paragraph: chalk.white,
      strong: chalk.bold,
      em: chalk.italic,
      codespan: chalk.yellow.bgBlack,
      del: chalk.dim.strikethrough,
      link: chalk.blue,
      href: chalk.blue.underline,
    });

marked.setOptions({ renderer: _renderer });

// ─── Mode icons & colors ──────────────────────────────────────────────────────

const MODE_ICON: Record<string, string> = {
  fast: '⚡',
  normal: '◆',
  high: '▲',
  'extra-high': '◉',
};

const MODE_COLOR: Record<string, chalk.Chalk> = {
  fast:         chalk.green,
  normal:       chalk.cyan,
  high:         chalk.yellow,
  'extra-high': chalk.magenta,
};

// ─── ASCII banner ─────────────────────────────────────────────────────────────

const BANNER_LINES = [
  ' ███╗   ██╗ █████╗ ███╗   ██╗ ██████╗  ██████╗██╗     ██╗',
  ' ████╗  ██║██╔══██╗████╗  ██║██╔═══██╗██╔════╝██║     ██║',
  ' ██╔██╗ ██║███████║██╔██╗ ██║██║   ██║██║     ██║     ██║',
  ' ██║╚██╗██║██╔══██║██║╚██╗██║██║   ██║██║     ██║     ██║',
  ' ██║ ╚████║██║  ██║██║ ╚████║╚██████╔╝╚██████╗███████╗██║',
  ' ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝╚══════╝╚═╝',
];

export class Renderer {

  // ─── Markdown ─────────────────────────────────────────────────────────────

  /**
   * Render teks Markdown ke format terminal.
   */
  static renderMarkdown(text: string): string {
    return (marked.parse(text) as string).trim();
  }

  // ─── Banner ───────────────────────────────────────────────────────────────

  /**
   * Tampilkan ASCII art banner NanoCLI.
   */
  static renderBanner(version: string = '1.0.0'): void {
    console.log('');
    for (const line of BANNER_LINES) {
      console.log(chalk.cyan.bold(line));
    }
    console.log('');
    console.log(
      chalk.dim('  Terminal-first AI Coding Agent') +
      chalk.dim('  ·  ') +
      chalk.dim(`v${version}`)
    );
    console.log('');
  }

  // ─── Session info box ─────────────────────────────────────────────────────

  /**
   * Tampilkan kotak info sesi saat chat dimulai.
   */
  static renderSessionInfo(info: {
    project: string;
    mode: string;
    modelId: string;
    searchMode?: string;
    memoryActive?: boolean;
  }): void {
    const modeColor = MODE_COLOR[info.mode] ?? chalk.cyan;
    const modeIcon  = MODE_ICON[info.mode] ?? '◆';
    const modelShort = info.modelId.split('/').pop() ?? info.modelId;

    const W = 60;
    const divider = chalk.dim('─'.repeat(W));
    const edge    = chalk.dim('│');

    const row = (label: string, value: string) => {
      const left  = chalk.dim(label.padEnd(10));
      const right = value;
      const raw   = `  ${label.padEnd(10)}  ${right}`;
      const pad   = ' '.repeat(Math.max(0, W - raw.length - 2));
      return `  ${edge}  ${left}  ${right}${pad}${edge}`;
    };

    console.log(`  ${chalk.dim('┌' + '─'.repeat(W - 2) + '┐')}`);
    console.log(`  ${edge}${' '.repeat(W - 2)}${edge}`);
    console.log(row('Project',  chalk.white.bold(info.project || 'Unknown')));
    console.log(row('Mode',     modeColor(`${modeIcon}  ${info.mode}`) + chalk.dim(`  ·  `) + chalk.dim(modelShort)));
    console.log(row('Search',   chalk.dim(info.searchMode ?? 'auto')));
    console.log(row('Memory',   info.memoryActive ? chalk.green('✓ active') : chalk.dim('—')));
    console.log(`  ${edge}${' '.repeat(W - 2)}${edge}`);
    console.log(`  ${chalk.dim('└' + '─'.repeat(W - 2) + '┘')}`);
    console.log('');

    console.log(
      chalk.dim('  Shortcuts: ') +
      ['/help', '/mode', '/model', '/run', '/file', '/exit']
        .map(s => chalk.cyan(s))
        .join(chalk.dim(' · '))
    );
    console.log(chalk.dim('  ' + '─'.repeat(W - 2)));
    console.log('');
  }

  // ─── Response frame ───────────────────────────────────────────────────────

  /**
   * Cetak header response sebelum streaming dimulai.
   */
  static renderResponseStart(): void {
    const label = chalk.cyan.bold('NanoCLI');
    const line  = chalk.dim('─'.repeat(48));
    process.stdout.write(`\n  ${chalk.dim('──')} ${label} ${line}\n\n`);
  }

  /**
   * Cetak footer response setelah streaming selesai.
   * Menampilkan timing dan estimasi biaya.
   */
  static renderResponseEnd(durationMs: number, costUsd?: number): void {
    const timing = `${(durationMs / 1000).toFixed(1)}s`;
    const cost   = (costUsd && costUsd > 0) ? chalk.dim(` · $${costUsd.toFixed(4)}`) : '';
    const info   = chalk.dim(timing) + cost;
    const W      = 54;
    const lineW  = Math.max(0, W - timing.length - (costUsd ? 10 : 0));
    process.stdout.write(`\n  ${chalk.dim('─'.repeat(lineW))} ${info}\n\n`);
  }

  // ─── Status messages ──────────────────────────────────────────────────────

  /**
   * Tampilkan pesan status dengan icon dan indent.
   */
  static printStatus(
    message: string,
    type: 'info' | 'success' | 'warn' | 'error' = 'info'
  ): void {
    const icons: Record<string, string> = {
      info:    chalk.blue('ℹ'),
      success: chalk.green('✓'),
      warn:    chalk.yellow('⚡'),
      error:   chalk.red('✖'),
    };
    console.log(`  ${icons[type]}  ${message}`);
  }

  // ─── Help menu ────────────────────────────────────────────────────────────

  /**
   * Tampilkan help menu yang dikelompokkan per kategori.
   */
  static renderHelpMenu(): void {
    const W    = 60;
    const edge = chalk.dim('│');
    const top  = chalk.dim('┌' + '─'.repeat(W - 2) + '┐');
    const bot  = chalk.dim('└' + '─'.repeat(W - 2) + '┘');
    const sep  = chalk.dim('│' + ' '.repeat(W - 2) + '│');

    const section = (title: string) => {
      const t = chalk.dim.bold(title);
      const pad = ' '.repeat(Math.max(0, W - title.length - 4));
      console.log(`  ${edge}  ${t}${pad}${edge}`);
    };

    const entry = (cmd: string, desc: string) => {
      const c = chalk.cyan(cmd.padEnd(20));
      const d = chalk.dim(desc);
      const raw = `  ${cmd.padEnd(20)}  ${desc}`;
      const pad = ' '.repeat(Math.max(0, W - raw.length - 2));
      console.log(`  ${edge}  ${c}  ${d}${pad}${edge}`);
    };

    console.log('');
    console.log(`  ${top}`);
    console.log(sep);

    section('NAVIGATION');
    entry('/exit, /quit',    'Keluar dari sesi chat');
    entry('/clear',          'Reset percakapan');
    entry('/help',           'Tampilkan menu ini');
    console.log(sep);

    section('CONTEXT & FILES');
    entry('/file <path>',    'Muat file/folder ke konteks');
    entry('/ls [path]',      'Lihat isi folder');
    entry('/context show',   'Ringkasan konteks aktif');
    console.log(sep);

    section('MODEL & MODE');
    entry('/mode <name>',    'fast · normal · high · extra-high');
    entry('/model [id]',     'Ganti model (picker jika ID kosong)');
    entry('/search <mode>',  'on · off · auto · deep');
    entry('/tokens',         'Statistik token sesi ini');
    entry('/compact',        'Ringkas konteks secara manual');
    console.log(sep);

    section('TERMINAL');
    entry('/run <command>',  'Jalankan command dengan approval');
    entry('/terminal detect','Deteksi shell yang tersedia');
    console.log(sep);

    console.log(`  ${bot}`);
    console.log('');
  }

  // ─── Table ────────────────────────────────────────────────────────────────

  /**
   * Tampilkan tabel data yang rapi.
   */
  static renderTable(head: string[], rows: any[][]): void {
    const table = new Table({
      head: head.map(h => chalk.cyan.bold(h)),
      chars: {
        top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
        right: '│', 'right-mid': '┤', middle: '│',
      },
      style: { 'padding-left': 1, 'padding-right': 1 },
    });
    table.push(...rows);
    console.log(table.toString());
  }

  // ─── Box (legacy — masih dipakai di beberapa tempat) ─────────────────────

  /**
   * Tampilkan kotak informasi sederhana.
   */
  static renderBox(title: string, lines: string[], color: string = 'cyan'): void {
    const chalkColor = (chalk as any)[color] ?? chalk.cyan;
    const width = Math.max(title.length, ...lines.map(l => l.length)) + 6;
    console.log(chalkColor('  ┌' + '─'.repeat(width) + '┐'));
    console.log(chalkColor(`  │  ${chalk.bold(title)}${' '.repeat(width - title.length - 2)}│`));
    console.log(chalkColor('  ├' + '─'.repeat(width) + '┤'));
    for (const line of lines) {
      console.log(chalkColor(`  │  ${line}${' '.repeat(width - line.length - 2)}│`));
    }
    console.log(chalkColor('  └' + '─'.repeat(width) + '┘'));
  }
}
