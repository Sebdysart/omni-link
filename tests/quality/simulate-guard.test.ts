import { describe, it, expect } from 'vitest';
import { assertNotSimulateOnly, SimulateOnlyError } from '../../engine/quality/simulate-guard.js';
import type { OmniLinkConfig } from '../../engine/types.js';

function makeConfig(overrides: Partial<OmniLinkConfig> = {}): OmniLinkConfig {
  return {
    repos: [],
    evolution: { aggressiveness: 'moderate', maxSuggestionsPerSession: 5, categories: [] },
    quality: { blockOnFailure: false, requireTestsForNewCode: false, conventionStrictness: 'moderate' },
    context: { tokenBudget: 4000, prioritize: 'changed-files-first', includeRecentCommits: 5 },
    cache: { directory: '.cache', maxAgeDays: 1 },
    ...overrides,
  };
}

describe('assertNotSimulateOnly', () => {
  it('does not throw when simulateOnly is false', () => {
    const config = makeConfig({ simulateOnly: false });
    expect(() => assertNotSimulateOnly(config, 'scan')).not.toThrow();
  });

  it('does not throw when simulateOnly is undefined', () => {
    const config = makeConfig();
    expect(() => assertNotSimulateOnly(config, 'scan')).not.toThrow();
  });

  it('throws SimulateOnlyError when simulateOnly is true', () => {
    const config = makeConfig({ simulateOnly: true });
    expect(() => assertNotSimulateOnly(config, 'scan')).toThrow(SimulateOnlyError);
  });

  it('SimulateOnlyError message includes the operation name', () => {
    const config = makeConfig({ simulateOnly: true });
    try {
      assertNotSimulateOnly(config, 'evolve');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulateOnlyError);
      expect((err as SimulateOnlyError).message).toContain('evolve');
    }
  });

  it('SimulateOnlyError has operation and apply hint', () => {
    const config = makeConfig({ simulateOnly: true });
    try {
      assertNotSimulateOnly(config, 'impact');
    } catch (err) {
      const e = err as SimulateOnlyError;
      expect(e.operation).toBe('impact');
      expect(e.message).toContain('/apply');
    }
  });
});
