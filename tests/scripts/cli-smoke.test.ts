import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, resolveConfigPath } from '../../engine/config.js';
import { runCli } from '../../engine/cli-app.js';
import { evolve, health, impactFromUncommitted, scan } from '../../engine/index.js';
import type { CliDeps, CliIo } from '../../engine/cli-app.js';

function createSourceCliExecutor(repoRoot: string) {
  const deps: CliDeps = {
    scan,
    impactFromUncommitted,
    health,
    evolve,
    loadConfig,
    resolveConfigPath,
    cwd: () => repoRoot,
  };

  return async (args: string[]): Promise<string> => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io: CliIo = {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    };

    const exitCode = await runCli(args, io, deps);
    if (exitCode !== 0) {
      throw new Error(stderr.join('\n') || `CLI exited with code ${exitCode}`);
    }

    return stdout.join('\n');
  };
}

describe('scripts/cli-smoke', () => {
  it('runs against the source CLI and returns smoke metrics', async () => {
    const { runCliSmoke } = await import('../../scripts/cli-smoke.mjs');
    const metrics = await runCliSmoke({
      scratchRoot: path.join(os.tmpdir(), 'omni-link-cli-smoke-tests'),
      executeCli: createSourceCliExecutor(process.cwd()),
      logger: () => undefined,
    });

    expect(metrics.repos).toBe(2);
    expect(metrics.tokenCount).toBeGreaterThan(0);
    expect(metrics.markdownLength).toBeGreaterThan(0);
    expect(metrics.overallHealth).toBeGreaterThan(0);
    expect(metrics.evolutionSuggestions).toBeGreaterThanOrEqual(0);
    expect(metrics.impactPaths).toBeGreaterThanOrEqual(0);
  }, 30000);
});
