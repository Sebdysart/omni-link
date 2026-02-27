import { describe, it, expect } from 'vitest';
import { buildInternalDeps, detectCrossRepoDeps } from '../../engine/grapher/dependency-graph.js';
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
    },
    dependencies: {
      internal: overrides.dependencies?.internal ?? [],
      external: overrides.dependencies?.external ?? [],
    },
    health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
  };
}

// ─── buildInternalDeps ──────────────────────────────────────────────────────

describe('buildInternalDeps', () => {
  it('builds internal dependencies from exports that reference other files', () => {
    const manifest = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'createUser', kind: 'function', signature: 'createUser(): void', file: 'src/routes/users.ts', line: 5 },
          { name: 'UserSchema', kind: 'type', signature: 'type UserSchema', file: 'src/types/user.ts', line: 1 },
          { name: 'db', kind: 'constant', signature: 'const db', file: 'src/db/index.ts', line: 1 },
        ],
      },
      dependencies: {
        internal: [
          { from: 'src/routes/users.ts', to: 'src/types/user.ts', imports: ['UserSchema'] },
          { from: 'src/routes/users.ts', to: 'src/db/index.ts', imports: ['db'] },
        ],
        external: [],
      },
    });

    const deps = buildInternalDeps(manifest);

    // Should preserve existing internal deps
    expect(deps).toHaveLength(2);
    expect(deps[0]).toEqual({ from: 'src/routes/users.ts', to: 'src/types/user.ts', imports: ['UserSchema'] });
    expect(deps[1]).toEqual({ from: 'src/routes/users.ts', to: 'src/db/index.ts', imports: ['db'] });
  });

  it('infers dependencies from export/type cross-references within a repo', () => {
    const manifest = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'createUser', kind: 'function', signature: 'function createUser(input: UserInput): User', file: 'src/handlers/user.ts', line: 10 },
          { name: 'UserInput', kind: 'type', signature: 'type UserInput', file: 'src/types/user.ts', line: 1 },
          { name: 'User', kind: 'type', signature: 'type User', file: 'src/types/user.ts', line: 5 },
        ],
      },
    });

    const deps = buildInternalDeps(manifest);

    // Should infer that user.ts handler references types from types/user.ts
    const handlerDep = deps.find(d => d.from === 'src/handlers/user.ts' && d.to === 'src/types/user.ts');
    expect(handlerDep).toBeDefined();
    expect(handlerDep!.imports).toContain('UserInput');
    expect(handlerDep!.imports).toContain('User');
  });

  it('does not create self-referencing dependencies', () => {
    const manifest = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'createUser', kind: 'function', signature: 'function createUser(): User', file: 'src/user.ts', line: 1 },
          { name: 'User', kind: 'type', signature: 'type User', file: 'src/user.ts', line: 5 },
        ],
      },
    });

    const deps = buildInternalDeps(manifest);
    const selfRef = deps.find(d => d.from === d.to);
    expect(selfRef).toBeUndefined();
  });

  it('returns empty array for manifest with no deps and no cross-file refs', () => {
    const manifest = makeManifest({
      repoId: 'empty',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'hello', kind: 'function', signature: 'function hello(): void', file: 'src/hello.ts', line: 1 },
        ],
      },
    });

    const deps = buildInternalDeps(manifest);
    expect(deps).toEqual([]);
  });
});

// ─── detectCrossRepoDeps ────────────────────────────────────────────────────

describe('detectCrossRepoDeps', () => {
  it('detects cross-repo deps via shared type names', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 5 },
        ],
        procedures: [],
        exports: [
          { name: 'UserResponse', kind: 'type', signature: 'type UserResponse', file: 'src/types.ts', line: 1 },
        ],
      },
      typeRegistry: {
        types: [
          { name: 'UserResponse', fields: [{ name: 'id', type: 'string' }], source: { repo: 'backend', file: 'src/types.ts', line: 1 } },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'UserResponse', kind: 'type', signature: 'struct UserResponse', file: 'Models/UserResponse.swift', line: 1 },
          { name: 'fetchUsers', kind: 'function', signature: 'func fetchUsers() -> [UserResponse]', file: 'Services/API.swift', line: 10 },
        ],
      },
      typeRegistry: {
        types: [
          { name: 'UserResponse', fields: [{ name: 'id', type: 'String' }], source: { repo: 'ios-app', file: 'Models/UserResponse.swift', line: 1 } },
        ],
        schemas: [],
        models: [],
      },
    });

    const crossDeps = detectCrossRepoDeps([backend, ios]);

    // Should detect that ios-app references patterns from backend
    expect(crossDeps.length).toBeGreaterThan(0);

    // Check that there's a dep linking the two repos
    const link = crossDeps.find(
      d => (d.from === 'backend' && d.to === 'ios-app') || (d.from === 'ios-app' && d.to === 'backend')
    );
    expect(link).toBeDefined();
    expect(link!.references.length).toBeGreaterThan(0);
  });

  it('detects cross-repo deps via URL patterns in exports', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          { method: 'POST', path: '/api/tasks', handler: 'createTask', file: 'src/routes.ts', line: 10 },
        ],
        procedures: [],
        exports: [],
      },
    });

    const frontend = makeManifest({
      repoId: 'frontend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'API_TASKS_URL', kind: 'constant', signature: 'const API_TASKS_URL = "/api/tasks"', file: 'src/api.ts', line: 3 },
        ],
      },
    });

    const crossDeps = detectCrossRepoDeps([backend, frontend]);
    const link = crossDeps.find(d => d.from === 'frontend' && d.to === 'backend');
    expect(link).toBeDefined();
    expect(link!.references).toContain('/api/tasks');
  });

  it('returns empty array when repos share nothing', () => {
    const repoA = makeManifest({
      repoId: 'repo-a',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'Alpha', kind: 'function', signature: 'function Alpha()', file: 'a.ts', line: 1 },
        ],
      },
    });
    const repoB = makeManifest({
      repoId: 'repo-b',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          { name: 'Beta', kind: 'function', signature: 'function Beta()', file: 'b.ts', line: 1 },
        ],
      },
    });

    const crossDeps = detectCrossRepoDeps([repoA, repoB]);
    expect(crossDeps).toEqual([]);
  });

  it('handles single repo (no cross-repo deps possible)', () => {
    const single = makeManifest({ repoId: 'solo' });
    const crossDeps = detectCrossRepoDeps([single]);
    expect(crossDeps).toEqual([]);
  });
});
