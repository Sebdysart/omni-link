import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OmniLinkConfig } from './types.js';

export const DEFAULT_CONFIG: Omit<OmniLinkConfig, 'repos'> = {
  evolution: {
    aggressiveness: 'aggressive',
    maxSuggestionsPerSession: 5,
    categories: ['features', 'performance', 'monetization', 'scale', 'security'],
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

export function resolveConfigPath(cwd: string): string | null {
  const localPath = path.join(cwd, '.omni-link.json');
  if (fs.existsSync(localPath)) return localPath;

  const globalPath = path.join(os.homedir(), '.claude', 'omni-link.json');
  if (fs.existsSync(globalPath)) return globalPath;

  return null;
}

export function validateConfig(
  raw: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const repos = raw.repos as Array<Record<string, unknown>> | undefined;

  if (!repos || !Array.isArray(repos) || repos.length === 0) {
    errors.push('repos: must have at least 1 repo');
  } else if (repos.length > 4) {
    errors.push('repos: maximum 4 repos allowed');
  } else {
    for (const [i, repo] of repos.entries()) {
      if (!repo.name) errors.push(`repos[${i}]: missing name`);
      if (!repo.path) errors.push(`repos[${i}]: missing path`);
      if (!repo.language) errors.push(`repos[${i}]: missing language`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadConfig(configPath: string): OmniLinkConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const validation = validateConfig(raw);

  if (!validation.valid) {
    throw new Error(
      `Invalid omni-link config:\n${validation.errors.join('\n')}`,
    );
  }

  return {
    repos: raw.repos,
    evolution: { ...DEFAULT_CONFIG.evolution, ...raw.evolution },
    quality: { ...DEFAULT_CONFIG.quality, ...raw.quality },
    context: { ...DEFAULT_CONFIG.context, ...raw.context },
    cache: { ...DEFAULT_CONFIG.cache, ...raw.cache },
  };
}
