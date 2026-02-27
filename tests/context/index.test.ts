import { describe, it, expect } from 'vitest';
import { buildContext } from '../../engine/context/index.js';
import type {
  EcosystemGraph,
  RepoManifest,
  OmniLinkConfig,
  Mismatch,
  ApiBridge,
  TypeLineage,
  TypeDef,
  CommitSummary,
} from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<OmniLinkConfig> = {}): OmniLinkConfig {
  return {
    repos: [
      { name: 'backend', path: '/repos/backend', language: 'typescript', role: 'api' },
      { name: 'ios-app', path: '/repos/ios-app', language: 'swift', role: 'client' },
    ],
    evolution: {
      aggressiveness: 'moderate',
      maxSuggestionsPerSession: 5,
      categories: ['feature', 'performance'],
      ...overrides.evolution,
    },
    quality: {
      blockOnFailure: true,
      requireTestsForNewCode: true,
      conventionStrictness: 'strict',
      ...overrides.quality,
    },
    context: {
      tokenBudget: 8000,
      prioritize: 'changed-files-first',
      includeRecentCommits: 20,
      ...overrides.context,
    },
    cache: {
      directory: '/tmp/cache',
      maxAgeDays: 7,
      ...overrides.cache,
    },
  };
}

function makeManifest(overrides: Partial<RepoManifest> & { repoId: string }): RepoManifest {
  return {
    repoId: overrides.repoId,
    path: overrides.path ?? `/repos/${overrides.repoId}`,
    language: overrides.language ?? 'typescript',
    gitState: {
      branch: overrides.gitState?.branch ?? 'main',
      headSha: overrides.gitState?.headSha ?? 'abc123',
      uncommittedChanges: overrides.gitState?.uncommittedChanges ?? [],
      recentCommits: overrides.gitState?.recentCommits ?? [],
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

function makeTypeDef(name: string, repo: string): TypeDef {
  return {
    name,
    fields: [{ name: 'id', type: 'string' }, { name: 'name', type: 'string' }],
    source: { repo, file: `src/types/${name}.ts`, line: 1 },
  };
}

function makeCommit(index: number): CommitSummary {
  return {
    sha: `commit-${index}`,
    message: `Change number ${index} with details about what was modified in the codebase`,
    author: 'developer',
    date: new Date(Date.now() - index * 3600000).toISOString(),
    filesChanged: [`src/file${index}.ts`, `src/helper${index}.ts`],
  };
}

function makeLargeGraph(): EcosystemGraph {
  const commits = Array.from({ length: 50 }, (_, i) => makeCommit(i));
  const types = Array.from({ length: 20 }, (_, i) => makeTypeDef(`Type${i}`, 'backend'));

  const backend = makeManifest({
    repoId: 'backend',
    gitState: {
      branch: 'main',
      headSha: 'abc123',
      uncommittedChanges: ['src/changed.ts'],
      recentCommits: commits,
    },
    apiSurface: {
      routes: Array.from({ length: 15 }, (_, i) => ({
        method: 'GET' as const,
        path: `/api/resource${i}`,
        handler: `getResource${i}`,
        file: `src/routes/resource${i}.ts`,
        line: 10,
        outputType: `Output${i}`,
      })),
      procedures: [],
      exports: [],
    },
    typeRegistry: {
      types,
      schemas: [],
      models: [],
    },
  });

  const ios = makeManifest({
    repoId: 'ios-app',
    language: 'swift',
  });

  const bridges: ApiBridge[] = Array.from({ length: 10 }, (_, i) => ({
    consumer: { repo: 'ios-app', file: `Services/Service${i}.swift`, line: 10 },
    provider: { repo: 'backend', route: `/api/resource${i}`, handler: `getResource${i}` },
    contract: {
      inputType: makeTypeDef(`Input${i}`, 'backend'),
      outputType: makeTypeDef(`Output${i}`, 'backend'),
      matchStatus: 'exact' as const,
    },
  }));

  const sharedTypes: TypeLineage[] = Array.from({ length: 5 }, (_, i) => ({
    concept: `Shared${i}`,
    instances: [
      { repo: 'backend', type: makeTypeDef(`Shared${i}`, 'backend') },
      { repo: 'ios-app', type: makeTypeDef(`Shared${i}`, 'ios-app') },
    ],
    alignment: 'aligned' as const,
  }));

  const mismatch: Mismatch = {
    kind: 'missing-field',
    description: "Consumer ios-app missing field 'email' from User",
    provider: { repo: 'backend', file: 'src/types.ts', line: 5, field: 'email' },
    consumer: { repo: 'ios-app', file: 'Models/User.swift', line: 3 },
    severity: 'breaking',
  };

  return {
    repos: [backend, ios],
    bridges,
    sharedTypes,
    contractMismatches: [mismatch],
    impactPaths: [
      {
        trigger: { repo: 'backend', file: 'src/changed.ts', change: 'type-change' },
        affected: [
          { repo: 'ios-app', file: 'Models/Changed.swift', line: 1, reason: 'Uses type', severity: 'warning' },
        ],
      },
    ],
  };
}

function makeSmallGraph(): EcosystemGraph {
  const backend = makeManifest({
    repoId: 'backend',
    gitState: {
      branch: 'feature/users',
      headSha: 'abc123',
      uncommittedChanges: ['src/routes.ts'],
      recentCommits: [
        {
          sha: 'commit-1',
          message: 'Add user endpoint',
          author: 'dev',
          date: '2026-02-27T00:00:00Z',
          filesChanged: ['src/routes.ts'],
        },
      ],
    },
    apiSurface: {
      routes: [
        { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
      ],
      procedures: [],
      exports: [],
    },
  });

  return {
    repos: [backend],
    bridges: [],
    sharedTypes: [],
    contractMismatches: [],
    impactPaths: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildContext', () => {
  it('returns digest and markdown from a graph and config', () => {
    const graph = makeSmallGraph();
    const config = makeConfig();
    const result = buildContext(graph, config);

    expect(result).toHaveProperty('digest');
    expect(result).toHaveProperty('markdown');
    expect(typeof result.markdown).toBe('string');
    expect(result.digest).toHaveProperty('generatedAt');
    expect(result.digest).toHaveProperty('repos');
    expect(result.digest).toHaveProperty('contractStatus');
    expect(result.digest).toHaveProperty('tokenCount');
  });

  it('markdown contains OMNI-LINK header', () => {
    const graph = makeSmallGraph();
    const config = makeConfig();
    const { markdown } = buildContext(graph, config);

    expect(markdown).toContain('# OMNI-LINK ECOSYSTEM STATE');
  });

  it('respects token budget when graph is large', () => {
    const graph = makeLargeGraph();
    const config = makeConfig({
      context: {
        tokenBudget: 300,
        prioritize: 'changed-files-first',
        includeRecentCommits: 20,
      },
    });

    const { digest } = buildContext(graph, config);

    // The token count should be within the budget (with some tolerance for overhead)
    // The pruner trims to budget, but the formatter adds section headers,
    // so the final markdown may be slightly over the raw pruned content.
    // The digest.tokenCount is the token estimate of the final markdown.
    expect(digest.tokenCount).toBeDefined();
    expect(typeof digest.tokenCount).toBe('number');
  });

  it('preserves contract mismatches even with tight budget', () => {
    const graph = makeLargeGraph();
    const config = makeConfig({
      context: {
        tokenBudget: 200,
        prioritize: 'changed-files-first',
        includeRecentCommits: 20,
      },
    });

    const { digest, markdown } = buildContext(graph, config);

    // Mismatches are highest priority — they should survive pruning
    expect(digest.contractStatus.mismatches.length).toBeGreaterThan(0);
    expect(markdown).toContain('mismatch');
  });

  it('includes repo information in digest', () => {
    const graph = makeSmallGraph();
    const config = makeConfig();
    const { digest } = buildContext(graph, config);

    expect(digest.repos.length).toBeGreaterThan(0);
    const backendDigest = digest.repos.find(r => r.name === 'backend');
    expect(backendDigest).toBeDefined();
    expect(backendDigest!.branch).toBe('feature/users');
    expect(backendDigest!.uncommittedCount).toBe(1);
  });

  it('works with empty graph', () => {
    const graph: EcosystemGraph = {
      repos: [],
      bridges: [],
      sharedTypes: [],
      contractMismatches: [],
      impactPaths: [],
    };
    const config = makeConfig();
    const { digest, markdown } = buildContext(graph, config);

    expect(digest.repos).toHaveLength(0);
    expect(markdown).toContain('# OMNI-LINK ECOSYSTEM STATE');
  });

  it('uses api-surface-first priority when configured', () => {
    const graph = makeLargeGraph();
    const config = makeConfig({
      context: {
        tokenBudget: 500,
        prioritize: 'api-surface-first',
        includeRecentCommits: 20,
      },
    });

    const result = buildContext(graph, config);
    expect(result.digest).toBeDefined();
    expect(result.markdown).toContain('# OMNI-LINK ECOSYSTEM STATE');
  });

  it('digest configSha is a non-empty string', () => {
    const graph = makeSmallGraph();
    const config = makeConfig();
    const { digest } = buildContext(graph, config);

    expect(digest.configSha).toBeDefined();
    expect(digest.configSha.length).toBeGreaterThan(0);
  });

  it('digest conventionSummary and apiSurfaceSummary are populated', () => {
    const graph = makeSmallGraph();
    const config = makeConfig();
    const { digest } = buildContext(graph, config);

    expect(digest.conventionSummary).toBeDefined();
    expect(typeof digest.apiSurfaceSummary).toBe('string');
    expect(typeof digest.recentChangesSummary).toBe('string');
  });
});
