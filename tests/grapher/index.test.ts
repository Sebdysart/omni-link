import { describe, it, expect } from 'vitest';
import { buildEcosystemGraph } from '../../engine/grapher/index.js';
import type { RepoManifest } from '../../engine/types.js';

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

// ─── buildEcosystemGraph ────────────────────────────────────────────────────

describe('buildEcosystemGraph', () => {
  it('assembles a complete EcosystemGraph from two manifests', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          {
            method: 'GET',
            path: '/api/users',
            handler: 'getUsers',
            file: 'src/routes/users.ts',
            line: 10,
            outputType: 'UserList',
          },
          {
            method: 'POST',
            path: '/api/users',
            handler: 'createUser',
            file: 'src/routes/users.ts',
            line: 25,
            inputType: 'CreateUserInput',
            outputType: 'User',
          },
        ],
        procedures: [],
        exports: [
          { name: 'getUsers', kind: 'function', signature: 'function getUsers(): UserList', file: 'src/routes/users.ts', line: 10 },
          { name: 'UserList', kind: 'type', signature: 'type UserList', file: 'src/types/user.ts', line: 1 },
        ],
      },
      typeRegistry: {
        types: [
          {
            name: 'UserList',
            fields: [{ name: 'users', type: 'User[]' }, { name: 'total', type: 'number' }],
            source: { repo: 'backend', file: 'src/types/user.ts', line: 1 },
          },
          {
            name: 'User',
            fields: [{ name: 'id', type: 'string' }, { name: 'email', type: 'string' }, { name: 'name', type: 'string' }],
            source: { repo: 'backend', file: 'src/types/user.ts', line: 10 },
          },
        ],
        schemas: [],
        models: [],
      },
      dependencies: {
        internal: [
          { from: 'src/routes/users.ts', to: 'src/types/user.ts', imports: ['UserList', 'User'] },
        ],
        external: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          {
            name: 'fetchUsers',
            kind: 'function',
            signature: 'func fetchUsers() -> GET /api/users',
            file: 'Services/UserService.swift',
            line: 15,
          },
        ],
      },
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [{ name: 'id', type: 'String' }, { name: 'email', type: 'String' }],
            source: { repo: 'ios-app', file: 'Models/User.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const graph = buildEcosystemGraph([backend, ios]);

    // Basic structure validation
    expect(graph.repos).toHaveLength(2);
    expect(graph.repos.map(r => r.repoId).sort()).toEqual(['backend', 'ios-app']);

    // Should have bridges (backend routes referenced by iOS)
    expect(graph.bridges.length).toBeGreaterThan(0);

    // Should have shared types (User exists in both repos)
    expect(graph.sharedTypes.length).toBeGreaterThan(0);
    const userLineage = graph.sharedTypes.find(l => l.concept === 'User');
    expect(userLineage).toBeDefined();
    expect(userLineage!.instances).toHaveLength(2);

    // Contract mismatches should be populated
    expect(graph.contractMismatches).toBeDefined();

    // Impact paths should be populated
    expect(graph.impactPaths).toBeDefined();
  });

  it('handles empty manifests gracefully', () => {
    const empty1 = makeManifest({ repoId: 'empty-a' });
    const empty2 = makeManifest({ repoId: 'empty-b' });

    const graph = buildEcosystemGraph([empty1, empty2]);

    expect(graph.repos).toHaveLength(2);
    expect(graph.bridges).toEqual([]);
    expect(graph.sharedTypes).toEqual([]);
    expect(graph.contractMismatches).toEqual([]);
    expect(graph.impactPaths).toEqual([]);
  });

  it('handles single manifest', () => {
    const single = makeManifest({
      repoId: 'solo',
      apiSurface: {
        routes: [{ method: 'GET', path: '/api/health', handler: 'healthCheck', file: 'src/routes.ts', line: 1 }],
        procedures: [],
        exports: [],
      },
    });

    const graph = buildEcosystemGraph([single]);

    expect(graph.repos).toHaveLength(1);
    expect(graph.bridges).toEqual([]);
    expect(graph.sharedTypes).toEqual([]);
  });

  it('detects contract mismatches in bridges', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          {
            method: 'GET',
            path: '/api/items',
            handler: 'getItems',
            file: 'src/routes.ts',
            line: 5,
            outputType: 'ItemList',
          },
        ],
        procedures: [],
        exports: [],
      },
      typeRegistry: {
        types: [
          {
            name: 'ItemList',
            fields: [
              { name: 'items', type: 'Item[]' },
              { name: 'total', type: 'number' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const consumer = makeManifest({
      repoId: 'mobile',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          {
            name: 'loadItems',
            kind: 'function',
            signature: 'func loadItems() -> GET /api/items',
            file: 'Services/ItemService.swift',
            line: 10,
          },
        ],
      },
      typeRegistry: {
        types: [
          {
            name: 'ItemList',
            fields: [
              { name: 'items', type: '[Item]' },
              { name: 'total', type: 'Int' },
              { name: 'extraField', type: 'String' },
            ],
            source: { repo: 'mobile', file: 'Models/ItemList.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const graph = buildEcosystemGraph([backend, consumer]);

    // Should have a bridge with mismatch status (consumer has extraField)
    const mismatchBridge = graph.bridges.find(b => b.contract.matchStatus === 'mismatch');
    expect(mismatchBridge).toBeDefined();

    // Should populate contractMismatches
    expect(graph.contractMismatches.length).toBeGreaterThan(0);
    const extraFieldMismatch = graph.contractMismatches.find(m => m.kind === 'extra-field');
    expect(extraFieldMismatch).toBeDefined();
  });

  it('populates internal deps within each manifest', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'handleRequest', kind: 'function', signature: 'function handleRequest(input: RequestInput): Response', file: 'src/handler.ts', line: 1 },
          { name: 'RequestInput', kind: 'type', signature: 'type RequestInput', file: 'src/types.ts', line: 1 },
          { name: 'Response', kind: 'type', signature: 'type Response', file: 'src/types.ts', line: 10 },
        ],
      },
    });

    const graph = buildEcosystemGraph([backend]);

    // Internal deps should be populated on the manifest within the graph
    const backendRepo = graph.repos.find(r => r.repoId === 'backend');
    expect(backendRepo).toBeDefined();
    expect(backendRepo!.dependencies.internal.length).toBeGreaterThan(0);
  });

  it('generates impact paths for repos with uncommitted changes', () => {
    const backend = makeManifest({
      repoId: 'backend',
      gitState: {
        branch: 'main',
        headSha: 'abc123',
        uncommittedChanges: ['src/types/user.ts'],
        recentCommits: [],
      },
      dependencies: {
        internal: [
          { from: 'src/routes/users.ts', to: 'src/types/user.ts', imports: ['User'] },
        ],
        external: [],
      },
    });

    const graph = buildEcosystemGraph([backend]);

    expect(graph.impactPaths.length).toBeGreaterThan(0);
    const impact = graph.impactPaths.find(p => p.trigger.file === 'src/types/user.ts');
    expect(impact).toBeDefined();
    expect(impact!.affected.length).toBeGreaterThan(0);
  });
});
