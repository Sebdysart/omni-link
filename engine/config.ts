import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OmniLinkConfig } from './types.js';
import { parseConfig, safeParseConfig } from './config-validator.js';

export const DEFAULT_CONFIG: Omit<OmniLinkConfig, 'repos'> = {
  evolution: {
    aggressiveness: 'aggressive',
    maxSuggestionsPerSession: 5,
    categories: ['feature', 'performance', 'monetization', 'scale', 'security'],
  },
  quality: {
    blockOnFailure: true,
    requireTestsForNewCode: true,
    conventionStrictness: 'strict',
  },
  context: {
    tokenBudget: 8000,
    prioritize: 'changed-files-first',
    includeRecentCommits: 20,
  },
  cache: {
    directory: path.join(os.homedir(), '.claude', 'omni-link-cache'),
    maxAgeDays: 7,
  },
};

export function resolveConfigPath(cwd: string, homeDir: string = os.homedir()): string | null {
  const localPath = path.join(cwd, '.omni-link.json');
  if (fs.existsSync(localPath)) return localPath;

  const globalPath = path.join(homeDir, '.claude', 'omni-link.json');
  if (fs.existsSync(globalPath)) return globalPath;

  return null;
}

export function validateConfig(raw: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const result = safeParseConfig(raw);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => {
    if (issue.path.length === 1 && issue.path[0] === 'repos') {
      if (issue.code === 'too_small') {
        return 'repos: must have at least 1 repo';
      }
      if (issue.code === 'too_big') {
        return 'repos: maximum 10 repos allowed';
      }
    }

    const pathLabel = issue.path.length > 0 ? issue.path.join('.') : 'config';
    return `${pathLabel}: ${issue.message}`;
  });

  return { valid: false, errors };
}

export function loadConfig(configPath: string): OmniLinkConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const merged = {
    ...raw,
    evolution: { ...DEFAULT_CONFIG.evolution, ...raw.evolution },
    quality: { ...DEFAULT_CONFIG.quality, ...raw.quality },
    context: { ...DEFAULT_CONFIG.context, ...raw.context },
    cache: { ...DEFAULT_CONFIG.cache, ...raw.cache },
  };

  return parseConfig(merged);
}
