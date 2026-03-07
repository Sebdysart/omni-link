import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { evolve, health, qualityCheck, scan } from '../../engine/index.js';

describe('scripts/benchmark-smoke', () => {
  it('runs a reduced benchmark profile against the source engine', async () => {
    const { runBenchmarkSmoke } = await import('../../scripts/benchmark-smoke.mjs');
    const metrics = await runBenchmarkSmoke({
      scratchRoot: path.join(os.tmpdir(), 'omni-link-benchmark-smoke-tests'),
      logger: () => undefined,
      engine: {
        scan,
        health,
        evolve,
        qualityCheck,
      },
      backendRouteCount: 6,
      clientRouteCount: 6,
      goFileCount: 4,
      minimumBridges: 8,
    });

    expect(metrics.bridges).toBeGreaterThanOrEqual(8);
    expect(metrics.tokenCount).toBeGreaterThan(0);
    expect(metrics.goExports).toBeGreaterThan(0);
    expect(metrics.goTypes).toBeGreaterThan(0);
  }, 30000);
});
