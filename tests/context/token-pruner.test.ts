import { describe, it, expect } from 'vitest';
import { pruneToTokenBudget, estimateTokens } from '../../engine/context/token-pruner.js';
import type {
  EcosystemGraph,
  RepoManifest,
  Mismatch,
  ApiBridge,
  TypeLineage,
  ImpactPath,
  TypeDef,
  CommitSummary,
} from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<RepoManifest> & { repoId: string }): RepoManifest {
  return {
    repoId: overrides.repoId,
    path: overrides.path ?? `/repos/${overrides.repoId}`,
    language: overrides.language ?? 'typescript',
    gitState: {
      branch: 'main',
      headSha: 'abc123',
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
      patterns: ['singleton', 'observer'],
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

function makeTypeDef(name: string, repo: string, fieldCount: number = 3): TypeDef {
  const fields = Array.from({ length: fieldCount }, (_, i) => ({
    name: `field${i}`,
    type: 'string',
  }));
  return {
    name,
    fields,
    source: { repo, file: `src/types/${name}.ts`, line: 1 },
  };
}

function makeMismatch(index: number): Mismatch {
  return {
    kind: 'missing-field',
    description: `Mismatch ${index}: consumer missing field 'extra${index}' from provider`,
    provider: { repo: 'backend', file: 'src/types.ts', line: index, field: `extra${index}` },
    consumer: { repo: 'ios-app', file: 'Models/Type.swift', line: index },
    severity: 'breaking',
  };
}

function makeCommit(index: number): CommitSummary {
  return {
    sha: `commit-${index}`,
    message: `Fix something number ${index} with a moderately long commit message to consume tokens`,
    author: 'dev',
    date: new Date(Date.now() - index * 3600000).toISOString(),
    filesChanged: [`src/file${index}.ts`],
  };
}

function makeBridge(index: number): ApiBridge {
  return {
    consumer: { repo: 'ios-app', file: `Services/Service${index}.swift`, line: 10 },
    provider: { repo: 'backend', route: `/api/resource${index}`, handler: `getResource${index}` },
    contract: {
      inputType: makeTypeDef(`Input${index}`, 'backend'),
      outputType: makeTypeDef(`Output${index}`, 'backend'),
      matchStatus: 'exact',
    },
  };
}

function makeImpactPath(index: number): ImpactPath {
  return {
    trigger: { repo: 'backend', file: `src/changed${index}.ts`, change: 'type-change' },
    affected: [
      {
        repo: 'ios-app',
        file: `Models/Affected${index}.swift`,
        line: 5,
        reason: `Uses type from changed${index}.ts`,
        severity: 'warning',
      },
    ],
  };
}

function makeTypeLineage(name: string): TypeLineage {
  return {
    concept: name,
    instances: [
      { repo: 'backend', type: makeTypeDef(name, 'backend', 5) },
      { repo: 'ios-app', type: makeTypeDef(name, 'ios-app', 4) },
    ],
    alignment: 'aligned',
  };
}

function makeGraph(opts: {
  commitCount?: number;
  bridgeCount?: number;
  mismatchCount?: number;
  typeLineageCount?: number;
  impactCount?: number;
  typeCount?: number;
} = {}): EcosystemGraph {
  const {
    commitCount = 5,
    bridgeCount = 3,
    mismatchCount = 1,
    typeLineageCount = 2,
    impactCount = 2,
    typeCount = 3,
  } = opts;

  const commits = Array.from({ length: commitCount }, (_, i) => makeCommit(i));
  const types = Array.from({ length: typeCount }, (_, i) => makeTypeDef(`Type${i}`, 'backend', 5));

  const backend = makeManifest({
    repoId: 'backend',
    gitState: {
      branch: 'main',
      headSha: 'abc123',
      uncommittedChanges: ['src/changed0.ts', 'src/changed1.ts'],
      recentCommits: commits,
    },
    apiSurface: {
      routes: Array.from({ length: bridgeCount }, (_, i) => ({
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

  return {
    repos: [backend, ios],
    bridges: Array.from({ length: bridgeCount }, (_, i) => makeBridge(i)),
    sharedTypes: Array.from({ length: typeLineageCount }, (_, i) => makeTypeLineage(`SharedType${i}`)),
    contractMismatches: Array.from({ length: mismatchCount }, (_, i) => makeMismatch(i)),
    impactPaths: Array.from({ length: impactCount }, (_, i) => makeImpactPath(i)),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates tokens as content.length / 4', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up for partial tokens', () => {
    expect(estimateTokens('abcde')).toBe(2); // 5 / 4 = 1.25 -> ceil -> 2
  });
});

describe('pruneToTokenBudget', () => {
  it('returns a PrunedContext with valid structure', () => {
    const graph = makeGraph();
    const result = pruneToTokenBudget(graph, 100000, 'changed-files-first');

    expect(result).toHaveProperty('graph');
    expect(result).toHaveProperty('droppedItems');
    expect(result).toHaveProperty('tokenEstimate');
    expect(result.graph.repos).toBeDefined();
    expect(Array.isArray(result.droppedItems)).toBe(true);
    expect(typeof result.tokenEstimate).toBe('number');
  });

  it('fits within token budget', () => {
    const graph = makeGraph({
      commitCount: 50,
      bridgeCount: 20,
      mismatchCount: 5,
      typeLineageCount: 10,
      typeCount: 20,
      impactCount: 10,
    });

    const result = pruneToTokenBudget(graph, 500, 'changed-files-first');

    expect(result.tokenEstimate).toBeLessThanOrEqual(500);
  });

  it('always keeps contract mismatches (highest priority)', () => {
    const graph = makeGraph({
      commitCount: 50,
      bridgeCount: 20,
      mismatchCount: 2,
      typeLineageCount: 10,
      typeCount: 20,
      impactCount: 10,
    });

    // Even with a very tight budget, mismatches should be preserved
    const result = pruneToTokenBudget(graph, 200, 'changed-files-first');

    expect(result.graph.contractMismatches.length).toBeGreaterThan(0);
  });

  it('trims recent commits first (lowest priority) in changed-files-first mode', () => {
    const graph = makeGraph({ commitCount: 30 });
    const originalCommitCount = graph.repos[0].gitState.recentCommits.length;

    const result = pruneToTokenBudget(graph, 300, 'changed-files-first');

    // Commits should be reduced or dropped
    const resultCommitCount = result.graph.repos.reduce(
      (sum, r) => sum + r.gitState.recentCommits.length,
      0,
    );

    if (result.droppedItems.length > 0) {
      expect(resultCommitCount).toBeLessThan(originalCommitCount);
    }
  });

  it('with large budget, keeps everything and drops nothing', () => {
    const graph = makeGraph();
    const result = pruneToTokenBudget(graph, 1_000_000, 'changed-files-first');

    expect(result.droppedItems).toHaveLength(0);
    expect(result.graph.repos).toHaveLength(graph.repos.length);
    expect(result.graph.bridges).toHaveLength(graph.bridges.length);
    expect(result.graph.sharedTypes).toHaveLength(graph.sharedTypes.length);
    expect(result.graph.contractMismatches).toHaveLength(graph.contractMismatches.length);
  });

  it('works with api-surface-first priority mode', () => {
    const graph = makeGraph({
      commitCount: 30,
      bridgeCount: 10,
      typeCount: 10,
    });

    const result = pruneToTokenBudget(graph, 500, 'api-surface-first');

    expect(result.tokenEstimate).toBeLessThanOrEqual(500);
    expect(result.graph).toBeDefined();
  });

  it('handles empty graph gracefully', () => {
    const graph: EcosystemGraph = {
      repos: [],
      bridges: [],
      sharedTypes: [],
      contractMismatches: [],
      impactPaths: [],
    };

    const result = pruneToTokenBudget(graph, 100, 'changed-files-first');

    expect(result.tokenEstimate).toBe(0);
    expect(result.droppedItems).toHaveLength(0);
  });
});

// ─── focus mode tests ─────────────────────────────────────────────────────────

describe('focus mode', () => {
  it("focus 'commits' preserves recent commits over types when budget is tight", () => {
    // Build a graph with both recentCommits and types — enough content to force pruning
    const graph = makeGraph({
      commitCount: 30,
      typeCount: 30,
      bridgeCount: 0,
      mismatchCount: 0,
      typeLineageCount: 0,
      impactCount: 0,
    });

    // Tight budget that forces pruning of some content
    const withFocus = pruneToTokenBudget(graph, 200, 'changed-files-first', 'commits');
    const withoutFocus = pruneToTokenBudget(graph, 200, 'changed-files-first');

    const focusDroppedCommits = withFocus.droppedItems.filter(d => d.startsWith('commit:')).length;
    const focusDroppedTypes = withFocus.droppedItems.filter(d => d.startsWith('type:')).length;

    const defaultDroppedCommits = withoutFocus.droppedItems.filter(d => d.startsWith('commit:')).length;
    const defaultDroppedTypes = withoutFocus.droppedItems.filter(d => d.startsWith('type:')).length;

    // focus='commits': commits should be preserved — fewer commits dropped than in default
    expect(focusDroppedCommits).toBeLessThanOrEqual(defaultDroppedCommits);

    // focus='commits' should compensate by dropping more types
    expect(focusDroppedTypes).toBeGreaterThanOrEqual(defaultDroppedTypes);

    // The pruned graph with focus should have at least as many commits as without focus
    const focusRemainingCommits = withFocus.graph.repos.reduce(
      (sum, r) => sum + r.gitState.recentCommits.length, 0,
    );
    const defaultRemainingCommits = withoutFocus.graph.repos.reduce(
      (sum, r) => sum + r.gitState.recentCommits.length, 0,
    );
    expect(focusRemainingCommits).toBeGreaterThanOrEqual(defaultRemainingCommits);
  });

  it("focus 'api-surface' preserves routes over commits when budget is tight", () => {
    // Build a graph with both routes and commits
    const graph = makeGraph({
      commitCount: 30,
      bridgeCount: 15,
      typeCount: 0,
      mismatchCount: 0,
      typeLineageCount: 0,
      impactCount: 0,
    });

    // Tight budget forces pruning
    const withFocus = pruneToTokenBudget(graph, 200, 'changed-files-first', 'api-surface');
    const withoutFocus = pruneToTokenBudget(graph, 200, 'changed-files-first');

    const focusDroppedRoutes = withFocus.droppedItems.filter(d => d.startsWith('route:')).length;
    const defaultDroppedRoutes = withoutFocus.droppedItems.filter(d => d.startsWith('route:')).length;

    // focus='api-surface': routes should be preserved — fewer or equal routes dropped vs default
    expect(focusDroppedRoutes).toBeLessThanOrEqual(defaultDroppedRoutes);

    // With focus='api-surface', remaining routes should be >= default remaining routes
    const focusRemainingRoutes = withFocus.graph.repos.reduce(
      (sum, r) => sum + r.apiSurface.routes.length, 0,
    );
    const defaultRemainingRoutes = withoutFocus.graph.repos.reduce(
      (sum, r) => sum + r.apiSurface.routes.length, 0,
    );
    expect(focusRemainingRoutes).toBeGreaterThanOrEqual(defaultRemainingRoutes);
  });

  it('no focus parameter preserves existing behavior', () => {
    const graph = makeGraph({
      commitCount: 20,
      typeCount: 10,
      bridgeCount: 5,
      mismatchCount: 1,
      typeLineageCount: 2,
      impactCount: 2,
    });

    // Without focus: should work correctly with large budget (drops nothing)
    const largeResult = pruneToTokenBudget(graph, 999999, 'changed-files-first');
    expect(largeResult.droppedItems).toHaveLength(0);
    expect(largeResult.graph.repos[0].gitState.recentCommits).toHaveLength(20);
    expect(largeResult.graph.repos[0].typeRegistry.types).toHaveLength(10);

    // Without focus: with tight budget, commits are trimmed first (default behavior)
    const tightResult = pruneToTokenBudget(graph, 150, 'changed-files-first');
    expect(tightResult.tokenEstimate).toBeLessThanOrEqual(150);

    // Calling with undefined focus explicitly should also match default behavior
    const undefinedFocusResult = pruneToTokenBudget(graph, 150, 'changed-files-first', undefined);
    expect(undefinedFocusResult.tokenEstimate).toBeLessThanOrEqual(150);
    expect(undefinedFocusResult.droppedItems).toEqual(tightResult.droppedItems);
  });
});
