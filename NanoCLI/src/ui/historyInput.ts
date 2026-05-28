const { Input } = require('enquirer');

export class HistoryInput extends (Input as any) {
  private historyList: string[];
  private historyIndex: number;
  private tempInput: string;

  constructor(options: any) {
    super(options);
    this.historyList = options.history || [];
    this.historyIndex = this.historyList.length;
    this.tempInput = '';
  }

  up() {
    if (this.historyList.length === 0) {
      return this.alert();
    }
    if (this.historyIndex > 0) {
      if (this.historyIndex === this.historyList.length) {
        this.tempInput = this.input;
      }
      this.historyIndex--;
      this.input = this.historyList[this.historyIndex] || '';
      this.cursor = this.input.length;
      return this.render();
    }
    return this.alert();
  }

  down() {
    if (this.historyIndex < this.historyList.length) {
      this.historyIndex++;
      if (this.historyIndex === this.historyList.length) {
        this.input = this.tempInput;
      } else {
        this.input = this.historyList[this.historyIndex] || '';
      }
      this.cursor = this.input.length;
      return this.render();
    }
    return this.alert();
  }
}
