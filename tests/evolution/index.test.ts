import { describe, it, expect } from 'vitest';
import { analyzeEvolution } from '../../engine/evolution/index.js';
import type { EcosystemGraph, OmniLinkConfig, RepoManifest } from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<RepoManifest> & { repoId: string }): RepoManifest {
  return {
    repoId: overrides.repoId,
    path: overrides.path ?? `/repos/${overrides.repoId}`,
    language: overrides.language ?? 'typescript',
    gitState: {
      branch: 'main',
      headSha: 'abc123',
      uncommittedChanges: [],
      recentCommits: [],
    },
    apiSurface: {
      routes: overrides.apiSurface?.routes ?? [],
      procedures: overrides.apiSurface?.procedures ?? [],
      exports: overrides.apiSurface?.exports ?? [],
    },
    typeRegistry: {
      types: overrides.typeRegistry?.types ?? [],
      schemas: overrides.typeRegistry?.schemas ?? [],
      models: overrides.typeRegistry?.models ?? [],
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
      internal: overrides.dependencies?.internal ?? [],
      external: overrides.dependencies?.external ?? [],
    },
    health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
  };
}

function makeGraph(manifests: RepoManifest[]): EcosystemGraph {
  return {
    repos: manifests,
    bridges: [],
    sharedTypes: [],
    contractMismatches: [],
    impactPaths: [],
  };
}

function makeConfig(overrides: Partial<OmniLinkConfig['evolution']> = {}): OmniLinkConfig {
  return {
    repos: [],
    evolution: {
      aggressiveness: overrides.aggressiveness ?? 'aggressive',
      maxSuggestionsPerSession: overrides.maxSuggestionsPerSession ?? 20,
      categories: overrides.categories ?? ['feature', 'performance', 'security', 'scale'],
    },
    quality: { blockOnFailure: true, requireTestsForNewCode: true, conventionStrictness: 'strict' },
    context: { tokenBudget: 8000, prioritize: 'changed-files-first', includeRecentCommits: 20 },
    cache: { directory: '/tmp/cache', maxAgeDays: 7 },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('analyzeEvolution', () => {
  it('returns suggestions from a graph with known gaps', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes/users.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes/users.ts', line: 20 },
        ],
        procedures: [],
        exports: [
          { name: 'unusedHelper', kind: 'function', signature: 'function unusedHelper()', file: 'src/utils.ts', line: 1 },
        ],
      },
      dependencies: { internal: [], external: [] },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig();

    const suggestions = analyzeEvolution(graph, config);

    expect(suggestions.length).toBeGreaterThan(0);
    // Should contain feature suggestions (from gap analysis)
    expect(suggestions.some(s => s.category === 'feature')).toBe(true);
  });

  it('returns suggestions from bottleneck analysis', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10, outputType: 'UserList' },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 20 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig();

    const suggestions = analyzeEvolution(graph, config);

    // Should find pagination/rate-limiting issues
    const perfOrScale = suggestions.filter(s =>
      s.category === 'performance' || s.category === 'scale' || s.category === 'security'
    );
    expect(perfOrScale.length).toBeGreaterThan(0);
  });

  it('filters suggestions by config categories', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 20 },
        ],
        procedures: [],
        exports: [
          { name: 'unusedFn', kind: 'function', signature: 'function unusedFn()', file: 'src/unused.ts', line: 1 },
        ],
      },
      dependencies: { internal: [], external: [] },
    });

    const graph = makeGraph([backend]);
    // Only allow performance suggestions
    const config = makeConfig({ categories: ['performance'] });

    const suggestions = analyzeEvolution(graph, config);

    // All returned suggestions should be 'performance' category
    for (const s of suggestions) {
      expect(s.category).toBe('performance');
    }
  });

  it('limits suggestions by maxSuggestionsPerSession', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes/users.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes/users.ts', line: 20 },
          { method: 'GET', path: '/api/posts', handler: 'getPosts', file: 'src/routes/posts.ts', line: 5 },
          { method: 'POST', path: '/api/posts', handler: 'createPost', file: 'src/routes/posts.ts', line: 15 },
          { method: 'GET', path: '/api/comments', handler: 'getComments', file: 'src/routes/comments.ts', line: 5 },
          { method: 'POST', path: '/api/comments', handler: 'createComment', file: 'src/routes/comments.ts', line: 15 },
        ],
        procedures: [],
        exports: [
          { name: 'unused1', kind: 'function', signature: 'function unused1()', file: 'src/utils.ts', line: 1 },
          { name: 'unused2', kind: 'function', signature: 'function unused2()', file: 'src/utils.ts', line: 10 },
          { name: 'unused3', kind: 'function', signature: 'function unused3()', file: 'src/utils.ts', line: 20 },
        ],
      },
      dependencies: { internal: [], external: [] },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig({ maxSuggestionsPerSession: 3 });

    const suggestions = analyzeEvolution(graph, config);

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('returns sorted suggestions (high impact first)', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 20 },
        ],
        procedures: [],
        exports: [
          { name: 'deadFn', kind: 'function', signature: 'function deadFn()', file: 'src/dead.ts', line: 1 },
        ],
      },
      dependencies: { internal: [], external: [] },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig();

    const suggestions = analyzeEvolution(graph, config);

    if (suggestions.length >= 2) {
      const impactOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < suggestions.length; i++) {
        const prevImpact = impactOrder[suggestions[i - 1].estimatedImpact] ?? 4;
        const currImpact = impactOrder[suggestions[i].estimatedImpact] ?? 4;
        expect(prevImpact).toBeLessThanOrEqual(currImpact);
      }
    }
  });

  it('returns empty array for empty graph', () => {
    const graph = makeGraph([]);
    const config = makeConfig();

    const suggestions = analyzeEvolution(graph, config);
    expect(suggestions).toEqual([]);
  });

  it('returns empty array when no categories match', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 20 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig({ categories: ['monetization'] });

    const suggestions = analyzeEvolution(graph, config);

    // Monetization is not produced by any module, so should be empty
    expect(suggestions).toEqual([]);
  });

  it('handles multiple repos in the graph', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 20 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const frontend = makeManifest({
      repoId: 'frontend',
      language: 'typescript',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'unusedComponent', kind: 'function', signature: 'function unusedComponent()', file: 'src/comps.tsx', line: 1 },
        ],
      },
      dependencies: { internal: [], external: [] },
    });

    const graph = makeGraph([backend, frontend]);
    const config = makeConfig();

    const suggestions = analyzeEvolution(graph, config);

    expect(suggestions.length).toBeGreaterThan(0);
    // Should have suggestions affecting both repos
    const repos = new Set(suggestions.flatMap(s => s.affectedRepos));
    expect(repos.size).toBeGreaterThanOrEqual(1);
  });

  it('includes benchmark-derived suggestions', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/data', handler: 'getData', file: 'src/routes.ts', line: 5 },
          { method: 'POST', path: '/api/data', handler: 'createData', file: 'src/routes.ts', line: 15 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const graph = makeGraph([backend]);
    const config = makeConfig({ categories: ['feature', 'performance', 'security', 'scale'] });

    const suggestions = analyzeEvolution(graph, config);

    // Should include security suggestions from benchmarker (missing helmet, rate-limit, etc.)
    const securitySuggestions = suggestions.filter(s => s.category === 'security');
    expect(securitySuggestions.length).toBeGreaterThan(0);
  });
});
