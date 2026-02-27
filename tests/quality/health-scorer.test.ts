import { describe, it, expect } from 'vitest';
import { scoreHealth, scoreEcosystemHealth } from '../../engine/quality/health-scorer.js';
import type { RepoManifest, EcosystemGraph } from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<RepoManifest> = {}): RepoManifest {
  return {
    repoId: overrides.repoId ?? 'test-repo',
    path: overrides.path ?? '/repos/test-repo',
    language: overrides.language ?? 'typescript',
    gitState: {
      branch: 'main',
      headSha: 'head123',
      uncommittedChanges: [],
      recentCommits: [],
      ...overrides.gitState,
    },
    apiSurface: {
      routes: [],
      procedures: [],
      exports: [],
      ...overrides.apiSurface,
    },
    typeRegistry: {
      types: [],
      schemas: [],
      models: [],
      ...overrides.typeRegistry,
    },
    conventions: {
      naming: 'camelCase',
      fileOrganization: 'feature-based',
      errorHandling: 'try-catch',
      patterns: [],
      testingPatterns: 'co-located',
      ...overrides.conventions,
    },
    dependencies: {
      internal: [],
      external: [],
      ...overrides.dependencies,
    },
    health: {
      testCoverage: null,
      lintErrors: 0,
      typeErrors: 0,
      todoCount: 0,
      deadCode: [],
      ...overrides.health,
    },
  };
}

function makeGraph(repos: RepoManifest[]): EcosystemGraph {
  return {
    repos,
    bridges: [],
    sharedTypes: [],
    contractMismatches: [],
    impactPaths: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scoreHealth', () => {
  it('returns a perfect score for a healthy repo', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: 85,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
      dependencies: {
        internal: [
          { from: 'src/index.ts', to: 'src/utils.ts', imports: ['helper'] },
          { from: 'src/app.ts', to: 'src/utils.ts', imports: ['helper'] },
          { from: 'tests/utils.test.ts', to: 'src/utils.ts', imports: ['helper'] },
        ],
        external: [],
      },
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'helper', kind: 'function', signature: 'function helper()', file: 'src/utils.ts', line: 1 },
          { name: 'main', kind: 'function', signature: 'function main()', file: 'src/index.ts', line: 1 },
        ],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('penalizes high TODO count', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: 80,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 20,
        deadCode: [],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.todoScore).toBeLessThan(100);
    expect(result.overall).toBeLessThan(90);
  });

  it('penalizes dead code', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: 80,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: ['unusedHelper', 'deprecatedFunction', 'oldParser'],
      },
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'unusedHelper', kind: 'function', signature: 'function unusedHelper()', file: 'src/old.ts', line: 1 },
          { name: 'deprecatedFunction', kind: 'function', signature: 'function deprecatedFunction()', file: 'src/old.ts', line: 10 },
          { name: 'oldParser', kind: 'function', signature: 'function oldParser()', file: 'src/old.ts', line: 20 },
          { name: 'usedHelper', kind: 'function', signature: 'function usedHelper()', file: 'src/utils.ts', line: 1 },
        ],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.deadCodeScore).toBeLessThan(100);
  });

  it('penalizes missing test coverage', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: null,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.testScore).toBeLessThan(100);
  });

  it('rewards high test coverage', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: 95,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.testScore).toBeGreaterThanOrEqual(90);
  });

  it('penalizes lint and type errors', () => {
    const manifest = makeManifest({
      health: {
        testCoverage: 80,
        lintErrors: 15,
        typeErrors: 5,
        todoCount: 0,
        deadCode: [],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.qualityScore).toBeLessThan(100);
    expect(result.overall).toBeLessThan(90);
  });

  it('returns score between 0 and 100', () => {
    // Worst case scenario
    const manifest = makeManifest({
      health: {
        testCoverage: 0,
        lintErrors: 100,
        typeErrors: 50,
        todoCount: 50,
        deadCode: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      },
    });

    const result = scoreHealth(manifest);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });
});

describe('scoreEcosystemHealth', () => {
  it('calculates per-repo and overall scores for multiple repos', () => {
    const repoA = makeManifest({
      repoId: 'backend',
      health: {
        testCoverage: 80,
        lintErrors: 2,
        typeErrors: 0,
        todoCount: 3,
        deadCode: [],
      },
    });

    const repoB = makeManifest({
      repoId: 'frontend',
      health: {
        testCoverage: 60,
        lintErrors: 5,
        typeErrors: 1,
        todoCount: 8,
        deadCode: ['oldComponent'],
      },
    });

    const graph = makeGraph([repoA, repoB]);
    const result = scoreEcosystemHealth(graph);

    expect(result.perRepo['backend']).toBeDefined();
    expect(result.perRepo['frontend']).toBeDefined();
    expect(result.perRepo['backend'].overall).toBeGreaterThanOrEqual(0);
    expect(result.perRepo['frontend'].overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);

    // Backend should score higher (fewer issues)
    expect(result.perRepo['backend'].overall).toBeGreaterThan(result.perRepo['frontend'].overall);
  });

  it('handles a single repo ecosystem', () => {
    const repo = makeManifest({
      repoId: 'mono',
      health: {
        testCoverage: 70,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 2,
        deadCode: [],
      },
    });

    const graph = makeGraph([repo]);
    const result = scoreEcosystemHealth(graph);

    expect(result.perRepo['mono']).toBeDefined();
    expect(result.overall).toBe(result.perRepo['mono'].overall);
  });

  it('handles empty ecosystem', () => {
    const graph = makeGraph([]);
    const result = scoreEcosystemHealth(graph);

    expect(Object.keys(result.perRepo)).toHaveLength(0);
    expect(result.overall).toBe(0);
  });

  it('overall score is the average of per-repo scores', () => {
    const repoA = makeManifest({
      repoId: 'a',
      health: {
        testCoverage: 90,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
    });

    const repoB = makeManifest({
      repoId: 'b',
      health: {
        testCoverage: 90,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
    });

    const graph = makeGraph([repoA, repoB]);
    const result = scoreEcosystemHealth(graph);

    // Both repos have same config, so overall should equal per-repo score
    const expectedOverall = Math.round(
      (result.perRepo['a'].overall + result.perRepo['b'].overall) / 2,
    );
    expect(result.overall).toBe(expectedOverall);
  });
});
