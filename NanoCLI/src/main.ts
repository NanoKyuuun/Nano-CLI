#!/usr/bin/env node
import { run } from './cli';
import chalk from 'chalk';

// ARCH-02 fix: global error handler agar uncaught exception tidak crash dengan stack trace mentah.
// User akan melihat pesan yang informatif alih-alih tumpukan error Node.js.
run().catch((err: any) => {
  const message = err?.message ?? String(err);
  console.error(chalk.red('\n  ✗ Fatal Error:'), message);
  if (process.env.DEBUG) {
    console.error(err); // Tampilkan full stack trace hanya di mode debug
  }
  process.exit(1);
});
