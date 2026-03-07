#!/usr/bin/env node
// engine/cli.ts — CLI entry point for omni-link

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from './cli-app.js';

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const exitCode = await runCli(argv);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  return exitCode;
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  void main();
}
