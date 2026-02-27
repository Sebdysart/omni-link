import { describe, it, expect } from 'vitest';
import { analyzeImpact } from '../../engine/grapher/impact-analyzer.js';
import type { EcosystemGraph, RepoManifest, ApiBridge, TypeLineage } from '../../engine/types.js';

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
    },
    dependencies: {
      internal: overrides.dependencies?.internal ?? [],
      external: overrides.dependencies?.external ?? [],
    },
    health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
  };
}

function makeGraph(overrides: Partial<EcosystemGraph> = {}): EcosystemGraph {
  return {
    repos: overrides.repos ?? [],
    bridges: overrides.bridges ?? [],
    sharedTypes: overrides.sharedTypes ?? [],
    contractMismatches: overrides.contractMismatches ?? [],
    impactPaths: overrides.impactPaths ?? [],
  };
}

// ─── analyzeImpact ──────────────────────────────────────────────────────────

describe('analyzeImpact', () => {
  it('traces impact through internal dependencies', () => {
    const backend = makeManifest({
      repoId: 'backend',
      dependencies: {
        internal: [
          { from: 'src/routes/users.ts', to: 'src/types/user.ts', imports: ['User', 'CreateUserInput'] },
          { from: 'src/services/user-service.ts', to: 'src/types/user.ts', imports: ['User'] },
        ],
        external: [],
      },
    });

    const graph = makeGraph({ repos: [backend] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/types/user.ts', change: 'type-change' },
    ]);

    expect(impacts).toHaveLength(1);
    expect(impacts[0].trigger.file).toBe('src/types/user.ts');
    expect(impacts[0].trigger.change).toBe('type-change');
    expect(impacts[0].affected.length).toBeGreaterThanOrEqual(2);

    const affectedFiles = impacts[0].affected.map(a => a.file);
    expect(affectedFiles).toContain('src/routes/users.ts');
    expect(affectedFiles).toContain('src/services/user-service.ts');
  });

  it('traces impact across repos via API bridges', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes/users.ts', line: 10 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
    });

    const bridge: ApiBridge = {
      consumer: { repo: 'ios-app', file: 'Services/UserService.swift', line: 15 },
      provider: { repo: 'backend', route: 'GET /api/users', handler: 'getUsers' },
      contract: {
        inputType: { name: 'void', fields: [], source: { repo: 'backend', file: 'types.ts', line: 0 } },
        outputType: { name: 'UserList', fields: [{ name: 'users', type: 'User[]' }], source: { repo: 'backend', file: 'types.ts', line: 5 } },
        matchStatus: 'exact',
      },
    };

    const graph = makeGraph({
      repos: [backend, ios],
      bridges: [bridge],
    });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/routes/users.ts', change: 'route-change' },
    ]);

    expect(impacts).toHaveLength(1);

    // Should include cross-repo impact
    const crossRepoAffected = impacts[0].affected.find(a => a.repo === 'ios-app');
    expect(crossRepoAffected).toBeDefined();
    expect(crossRepoAffected!.file).toBe('Services/UserService.swift');
    expect(crossRepoAffected!.severity).toBe('breaking');
  });

  it('assigns breaking severity for type changes', () => {
    const backend = makeManifest({
      repoId: 'backend',
      dependencies: {
        internal: [
          { from: 'src/handlers/user.ts', to: 'src/types/user.ts', imports: ['User'] },
        ],
        external: [],
      },
    });

    const graph = makeGraph({ repos: [backend] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/types/user.ts', change: 'type-change' },
    ]);

    expect(impacts).toHaveLength(1);
    const affected = impacts[0].affected.find(a => a.file === 'src/handlers/user.ts');
    expect(affected).toBeDefined();
    expect(affected!.severity).toBe('breaking');
  });

  it('assigns warning severity for implementation changes', () => {
    const backend = makeManifest({
      repoId: 'backend',
      dependencies: {
        internal: [
          { from: 'src/handlers/user.ts', to: 'src/services/user-service.ts', imports: ['UserService'] },
        ],
        external: [],
      },
    });

    const graph = makeGraph({ repos: [backend] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/services/user-service.ts', change: 'implementation-change' },
    ]);

    expect(impacts).toHaveLength(1);
    const affected = impacts[0].affected.find(a => a.file === 'src/handlers/user.ts');
    expect(affected).toBeDefined();
    expect(affected!.severity).toBe('warning');
  });

  it('returns empty impact paths for changes with no dependents', () => {
    const backend = makeManifest({ repoId: 'backend' });
    const graph = makeGraph({ repos: [backend] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/standalone.ts', change: 'implementation-change' },
    ]);

    expect(impacts).toHaveLength(1);
    expect(impacts[0].affected).toEqual([]);
  });

  it('handles empty changed files list', () => {
    const graph = makeGraph();
    const impacts = analyzeImpact(graph, []);
    expect(impacts).toEqual([]);
  });

  it('traces transitive dependencies (A -> B -> C: change C affects A)', () => {
    const backend = makeManifest({
      repoId: 'backend',
      dependencies: {
        internal: [
          { from: 'src/routes.ts', to: 'src/service.ts', imports: ['service'] },
          { from: 'src/service.ts', to: 'src/model.ts', imports: ['Model'] },
        ],
        external: [],
      },
    });

    const graph = makeGraph({ repos: [backend] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/model.ts', change: 'type-change' },
    ]);

    expect(impacts).toHaveLength(1);
    const affectedFiles = impacts[0].affected.map(a => a.file);
    // Direct dependent
    expect(affectedFiles).toContain('src/service.ts');
    // Transitive dependent
    expect(affectedFiles).toContain('src/routes.ts');
  });

  it('assigns warning (not breaking) severity for cross-repo implementation-change', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes/users.ts', line: 10 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const ios = makeManifest({ repoId: 'ios-app', language: 'swift' });

    const bridge: ApiBridge = {
      consumer: { repo: 'ios-app', file: 'Services/UserService.swift', line: 15 },
      provider: { repo: 'backend', route: 'GET /api/users', handler: 'getUsers' },
      contract: {
        inputType: { name: 'void', fields: [], source: { repo: 'backend', file: 'types.ts', line: 0 } },
        outputType: { name: 'UserList', fields: [], source: { repo: 'backend', file: 'types.ts', line: 5 } },
        matchStatus: 'exact',
      },
    };

    const graph = makeGraph({ repos: [backend, ios], bridges: [bridge] });

    const impacts = analyzeImpact(graph, [
      { repo: 'backend', file: 'src/routes/users.ts', change: 'implementation-change' },
    ]);

    const crossRepoAffected = impacts[0]?.affected.find(a => a.repo === 'ios-app');
    expect(crossRepoAffected).toBeDefined();
    // Implementation-only change cannot break consumers — must be 'warning', not 'breaking'
    expect(crossRepoAffected!.severity).toBe('warning');
  });
});
