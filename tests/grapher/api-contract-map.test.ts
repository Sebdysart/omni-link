import { describe, it, expect } from 'vitest';
import { mapApiContracts, compareTypes } from '../../engine/grapher/api-contract-map.js';
import type { RepoManifest, TypeDef } from '../../engine/types.js';

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

// ─── compareTypes ───────────────────────────────────────────────────────────

describe('compareTypes', () => {
  it('returns exact when all fields match', () => {
    const provider: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'name', type: 'string' },
      ],
      source: { repo: 'backend', file: 'types.ts', line: 1 },
    };
    const consumer: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'name', type: 'string' },
      ],
      source: { repo: 'ios-app', file: 'User.swift', line: 1 },
    };

    expect(compareTypes(provider, consumer)).toBe('exact');
  });

  it('returns compatible when consumer is a subset of provider', () => {
    const provider: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'createdAt', type: 'string' },
      ],
      source: { repo: 'backend', file: 'types.ts', line: 1 },
    };
    const consumer: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
      ],
      source: { repo: 'ios-app', file: 'User.swift', line: 1 },
    };

    expect(compareTypes(provider, consumer)).toBe('compatible');
  });

  it('returns mismatch when consumer expects field provider does not have', () => {
    const provider: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
      ],
      source: { repo: 'backend', file: 'types.ts', line: 1 },
    };
    const consumer: TypeDef = {
      name: 'User',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'avatar', type: 'string' },
      ],
      source: { repo: 'ios-app', file: 'User.swift', line: 1 },
    };

    expect(compareTypes(provider, consumer)).toBe('mismatch');
  });

  it('returns exact for empty field sets', () => {
    const provider: TypeDef = {
      name: 'Empty',
      fields: [],
      source: { repo: 'a', file: 'a.ts', line: 1 },
    };
    const consumer: TypeDef = {
      name: 'Empty',
      fields: [],
      source: { repo: 'b', file: 'b.ts', line: 1 },
    };

    expect(compareTypes(provider, consumer)).toBe('exact');
  });
});

// ─── mapApiContracts ────────────────────────────────────────────────────────

describe('mapApiContracts', () => {
  it('detects API bridges between provider routes and consumer URL references', () => {
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
            inputType: 'GetUsersInput',
            outputType: 'UserListResponse',
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
        exports: [],
      },
      typeRegistry: {
        types: [
          {
            name: 'UserListResponse',
            fields: [{ name: 'users', type: 'User[]' }, { name: 'total', type: 'number' }],
            source: { repo: 'backend', file: 'src/types.ts', line: 5 },
          },
          {
            name: 'User',
            fields: [{ name: 'id', type: 'string' }, { name: 'email', type: 'string' }],
            source: { repo: 'backend', file: 'src/types.ts', line: 15 },
          },
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
            name: 'UserListResponse',
            fields: [{ name: 'users', type: '[User]' }, { name: 'total', type: 'Int' }],
            source: { repo: 'ios-app', file: 'Models/UserListResponse.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const bridges = mapApiContracts([backend, ios]);

    expect(bridges.length).toBeGreaterThan(0);

    const usersBridge = bridges.find(
      b => b.provider.route === 'GET /api/users' && b.consumer.repo === 'ios-app'
    );
    expect(usersBridge).toBeDefined();
    expect(usersBridge!.provider.repo).toBe('backend');
    expect(usersBridge!.provider.handler).toBe('getUsers');
    expect(usersBridge!.consumer.file).toBe('Services/UserService.swift');
  });

  it('detects bridges via tRPC procedure names', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [],
        procedures: [
          {
            name: 'user.getProfile',
            kind: 'query',
            file: 'src/routers/user.ts',
            line: 20,
            inputType: 'GetProfileInput',
            outputType: 'UserProfile',
          },
        ],
        exports: [],
      },
      typeRegistry: {
        types: [
          {
            name: 'UserProfile',
            fields: [{ name: 'id', type: 'string' }, { name: 'bio', type: 'string' }],
            source: { repo: 'backend', file: 'src/types.ts', line: 30 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const frontend = makeManifest({
      repoId: 'frontend',
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [
          {
            name: 'useGetProfile',
            kind: 'function',
            signature: 'function useGetProfile(): user.getProfile query',
            file: 'src/hooks/useProfile.ts',
            line: 5,
          },
        ],
      },
      typeRegistry: {
        types: [
          {
            name: 'UserProfile',
            fields: [{ name: 'id', type: 'string' }, { name: 'bio', type: 'string' }],
            source: { repo: 'frontend', file: 'src/types.ts', line: 10 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const bridges = mapApiContracts([backend, frontend]);
    const profileBridge = bridges.find(
      b => b.provider.route.includes('user.getProfile') && b.consumer.repo === 'frontend'
    );
    expect(profileBridge).toBeDefined();
  });

  it('detects bridges when iOS consumer has call-site exports (URL path strings)', () => {
    const backend = makeManifest({
      repoId: 'backend',
      apiSurface: {
        routes: [
          {
            method: 'GET',
            path: '/api/posts',
            handler: 'getPosts',
            file: 'src/routes/posts.ts',
            line: 5,
          },
        ],
        procedures: [],
        exports: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      apiSurface: {
        routes: [],
        procedures: [],
        // These simulate what extractSwiftApiCallSites() produces:
        exports: [
          {
            name: '/api/posts',
            kind: 'constant' as const,
            signature: '/api/posts',
            file: 'Services/PostService.swift',
            line: 8,
          },
        ],
      },
    });

    const bridges = mapApiContracts([backend, ios]);
    expect(bridges.length).toBeGreaterThan(0);
    const bridge = bridges.find(b => b.provider.route === 'GET /api/posts');
    expect(bridge).toBeDefined();
    expect(bridge!.consumer.repo).toBe('ios-app');
    expect(bridge!.consumer.file).toBe('Services/PostService.swift');
  });

  it('returns empty bridges when no routes or procedures', () => {
    const repoA = makeManifest({ repoId: 'repo-a' });
    const repoB = makeManifest({ repoId: 'repo-b' });
    const bridges = mapApiContracts([repoA, repoB]);
    expect(bridges).toEqual([]);
  });

  it('marks match status correctly based on type comparison', () => {
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
              { name: 'page', type: 'number' },
            ],
            source: { repo: 'backend', file: 'types.ts', line: 1 },
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
            ],
            source: { repo: 'mobile', file: 'Models/ItemList.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const bridges = mapApiContracts([backend, consumer]);
    const bridge = bridges.find(b => b.provider.route === 'GET /api/items');
    expect(bridge).toBeDefined();
    // Consumer has subset of provider fields => compatible
    expect(bridge!.contract.matchStatus).toBe('compatible');
  });
});
