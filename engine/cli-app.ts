import { scan, impactFromUncommitted, health, evolve } from './index.js';
import { loadConfig, resolveConfigPath } from './config.js';
import type { OmniLinkConfig } from './types.js';

export const USAGE = `
omni-link — Multi-repo AI ecosystem plugin for Claude Code

Usage:
  omni-link <command> [options]

Commands:
  scan      Full scan: repos -> graph -> context digest
  impact    Analyze cross-repo impact of uncommitted changes
  health    Compute per-repo and ecosystem health scores
  evolve    Generate evolution suggestions (gaps, bottlenecks, upgrades)

Options:
  --config <path>         Path to .omni-link.json config file
                          (auto-detects from cwd or ~/.claude/ if omitted)
  --format <json|markdown>  Output format for supported commands
  --markdown              Shortcut for --format markdown
  --help                  Show this help message

Examples:
  omni-link scan
  omni-link scan --markdown
  omni-link scan --config ./my-config.json
  omni-link health --config /path/to/.omni-link.json
  omni-link evolve
`.trim();

export interface CliArgs {
  command: string | undefined;
  configPath: string | undefined;
  outputFormat: 'json' | 'markdown';
  help: boolean;
}

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CliDeps {
  scan: typeof scan;
  impactFromUncommitted: typeof impactFromUncommitted;
  health: typeof health;
  evolve: typeof evolve;
  loadConfig: typeof loadConfig;
  resolveConfigPath: typeof resolveConfigPath;
  cwd: () => string;
}

const DEFAULT_IO: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

const DEFAULT_DEPS: CliDeps = {
  scan,
  impactFromUncommitted,
  health,
  evolve,
  loadConfig,
  resolveConfigPath,
  cwd: () => process.cwd(),
};

export function parseArgs(argv: string[]): CliArgs {
  let command: string | undefined;
  let configPath: string | undefined;
  let outputFormat: 'json' | 'markdown' = 'json';
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--markdown') {
      outputFormat = 'markdown';
      continue;
    }

    if (arg === '--format') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --format');
      }
      if (next !== 'json' && next !== 'markdown') {
        throw new Error(`Unsupported format: ${next}`);
      }
      outputFormat = next;
      i++;
      continue;
    }

    if (arg === '--config') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --config');
      }
      configPath = next;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!command) {
      command = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { command, configPath, outputFormat, help };
}

export function resolveCliConfig(
  configPath: string | undefined,
  deps: Pick<CliDeps, 'loadConfig' | 'resolveConfigPath' | 'cwd'> = DEFAULT_DEPS,
): OmniLinkConfig {
  const resolved = configPath ?? deps.resolveConfigPath(deps.cwd());

  if (!resolved) {
    throw new Error(
      'No config file found.\nPlace .omni-link.json in the current directory or ~/.claude/omni-link.json\nOr pass --config <path>',
    );
  }

  return deps.loadConfig(resolved);
}

export async function runCli(
  argv: string[],
  io: CliIo = DEFAULT_IO,
  deps: CliDeps = DEFAULT_DEPS,
): Promise<number> {
  let args: CliArgs;

  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr('');
    io.stdout(USAGE);
    return 1;
  }

  if (args.help || argv.length === 0 || !args.command) {
    io.stdout(USAGE);
    return 0;
  }

  try {
    switch (args.command) {
      case 'scan': {
        const config = resolveCliConfig(args.configPath, deps);
        const result = await deps.scan(config);
        io.stdout(
          args.outputFormat === 'markdown'
            ? result.context.markdown
            : JSON.stringify(result.context.digest, null, 2),
        );
        return 0;
      }

      case 'impact': {
        const config = resolveCliConfig(args.configPath, deps);
        const result = await deps.impactFromUncommitted(config);
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      case 'health': {
        const config = resolveCliConfig(args.configPath, deps);
        const result = await deps.health(config);
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      case 'evolve': {
        const config = resolveCliConfig(args.configPath, deps);
        const result = await deps.evolve(config);
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      default:
        io.stderr(`Unknown command: ${args.command}`);
        io.stderr('');
        io.stdout(USAGE);
        return 1;
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
