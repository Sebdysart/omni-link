#!/usr/bin/env node
// engine/cli.ts — CLI entry point for omni-link

import { scan, impactFromUncommitted, health, evolve } from './index.js';
import { loadConfig, resolveConfigPath } from './config.js';

const USAGE = `
omni-link — Multi-repo AI ecosystem plugin for Claude Code

Usage:
  omni-link <command> [options]

Commands:
  scan      Full scan: repos -> graph -> context digest (JSON to stdout)
  impact    Analyze cross-repo impact of uncommitted changes
  health    Compute per-repo and ecosystem health scores
  evolve    Generate evolution suggestions (gaps, bottlenecks, upgrades)

Options:
  --config <path>   Path to .omni-link.json config file
                    (auto-detects from cwd or ~/.claude/ if omitted)
  --help            Show this help message

Examples:
  omni-link scan
  omni-link scan --config ./my-config.json
  omni-link health --config /path/to/.omni-link.json
  omni-link evolve
`.trim();

function parseArgs(argv: string[]): { command: string | undefined; configPath: string | undefined } {
  let command: string | undefined;
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    }

    if (arg === '--config' && i + 1 < argv.length) {
      configPath = argv[i + 1];
      i++; // skip next arg
      continue;
    }

    // First positional argument is the command
    if (!arg.startsWith('-') && !command) {
      command = arg;
    }
  }

  return { command, configPath };
}

function resolveConfig(configPath: string | undefined) {
  const resolved = configPath ?? resolveConfigPath(process.cwd());

  if (!resolved) {
    console.error('Error: No config file found.');
    console.error('Place .omni-link.json in the current directory or ~/.claude/omni-link.json');
    console.error('Or pass --config <path>');
    process.exit(1);
  }

  return loadConfig(resolved);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }

  const { command, configPath } = parseArgs(args);

  if (!command) {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case 'scan': {
      const config = resolveConfig(configPath);
      const result = scan(config);
      console.log(JSON.stringify(result.context.digest, null, 2));
      break;
    }

    case 'impact': {
      const config = resolveConfig(configPath);
      const result = impactFromUncommitted(config);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'health': {
      const config = resolveConfig(configPath);
      const result = health(config);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'evolve': {
      const config = resolveConfig(configPath);
      const result = evolve(config);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('');
      console.log(USAGE);
      process.exit(1);
  }
}

main();
