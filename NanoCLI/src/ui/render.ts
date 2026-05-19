import { marked } from 'marked';
const TerminalRenderer = require('marked-terminal');
import chalk from 'chalk';
import Table from 'cli-table3';

// Configure marked to use terminal renderer
const renderer = typeof TerminalRenderer === 'function' 
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
      href: chalk.blue.underline
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
      href: chalk.blue.underline
    });

marked.setOptions({ renderer });

export class Renderer {
  /**
   * Merender teks Markdown ke format terminal yang cantik.
   */
  static renderMarkdown(text: string): string {
    return marked.parse(text).trim();
  }

  /**
   * Menampilkan tabel data dengan rapi.
   */
  static renderTable(head: string[], rows: any[][]) {
    const table = new Table({
      head: head.map(h => chalk.cyan.bold(h)),
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      }
    });

    table.push(...rows);
    console.log(table.toString());
  }

  /**
   * Menampilkan status proses (spinner/loading stub).
   */
  static printStatus(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const icons = {
      info: chalk.blue('ℹ'),
      success: chalk.green('✔'),
      warn: chalk.yellow('⚠'),
      error: chalk.red('✖')
    };
    console.log(`${icons[type]} ${message}`);
  }

  /**
   * Menampilkan kotak informasi (seperti welcome screen).
   */
  static renderBox(title: string, lines: string[], color: string = 'cyan') {
    const chalkColor = (chalk as any)[color] || chalk.cyan;
    const width = Math.max(title.length, ...lines.map(l => l.length)) + 4;
    
    console.log(chalkColor(`┌${'─'.repeat(width - 2)}┐`));
    console.log(chalkColor(`│ ${chalk.bold(title).padEnd(width - 3)} │`));
    console.log(chalkColor(`├${'─'.repeat(width - 2)}┤`));
    lines.forEach(line => {
      console.log(chalkColor(`│ ${line.padEnd(width - 4)} │`));
    });
    console.log(chalkColor(`└${'─'.repeat(width - 2)}┘`));
  }
}
