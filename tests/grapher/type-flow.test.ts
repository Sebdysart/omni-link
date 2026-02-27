import { describe, it, expect } from 'vitest';
import { mapTypeFlows } from '../../engine/grapher/type-flow.js';
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

// ─── mapTypeFlows ───────────────────────────────────────────────────────────

describe('mapTypeFlows', () => {
  it('finds exact name matches across repos (case-insensitive)', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: 'string' },
              { name: 'name', type: 'string' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'String' },
              { name: 'email', type: 'String' },
              { name: 'name', type: 'String' },
            ],
            source: { repo: 'ios-app', file: 'Models/User.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, ios]);

    const userLineage = lineages.find(l => l.concept === 'User');
    expect(userLineage).toBeDefined();
    expect(userLineage!.instances).toHaveLength(2);
    expect(userLineage!.instances.map(i => i.repo).sort()).toEqual(['backend', 'ios-app']);
    expect(userLineage!.alignment).toBe('aligned');
  });

  it('matches DTO/Model/Entity suffix-stripped names', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: 'string' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      typeRegistry: {
        types: [
          {
            name: 'UserDTO',
            fields: [
              { name: 'id', type: 'String' },
              { name: 'email', type: 'String' },
            ],
            source: { repo: 'ios-app', file: 'Models/UserDTO.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, ios]);

    const userLineage = lineages.find(l => l.concept === 'User');
    expect(userLineage).toBeDefined();
    expect(userLineage!.instances).toHaveLength(2);
    expect(userLineage!.alignment).toBe('aligned');
  });

  it('matches via field similarity (Jaccard > 0.5)', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'TaskPayload',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'description', type: 'string' },
              { name: 'dueDate', type: 'string' },
              { name: 'priority', type: 'number' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 10 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const frontend = makeManifest({
      repoId: 'frontend',
      typeRegistry: {
        types: [
          {
            name: 'TaskFormData',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'description', type: 'string' },
              { name: 'dueDate', type: 'string' },
            ],
            source: { repo: 'frontend', file: 'src/types.ts', line: 5 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, frontend]);

    // Should match despite different names due to high field overlap
    const taskLineage = lineages.find(l =>
      l.instances.some(i => i.type.name === 'TaskPayload') &&
      l.instances.some(i => i.type.name === 'TaskFormData')
    );
    expect(taskLineage).toBeDefined();
  });

  it('marks diverged alignment when fields differ significantly', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: 'string' },
              { name: 'name', type: 'string' },
              { name: 'createdAt', type: 'string' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'String' },
              { name: 'email', type: 'String' },
              { name: 'avatar', type: 'String' },
              { name: 'bio', type: 'String' },
            ],
            source: { repo: 'ios-app', file: 'Models/User.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, ios]);
    const userLineage = lineages.find(l => l.concept === 'User');
    expect(userLineage).toBeDefined();
    expect(userLineage!.alignment).toBe('diverged');
  });

  it('marks subset alignment when one type is a strict subset', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: 'string' },
              { name: 'name', type: 'string' },
              { name: 'createdAt', type: 'string' },
            ],
            source: { repo: 'backend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      typeRegistry: {
        types: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'String' },
              { name: 'email', type: 'String' },
            ],
            source: { repo: 'ios-app', file: 'Models/User.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, ios]);
    const userLineage = lineages.find(l => l.concept === 'User');
    expect(userLineage).toBeDefined();
    expect(userLineage!.alignment).toBe('subset');
  });

  it('returns empty array for single repo', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          { name: 'User', fields: [{ name: 'id', type: 'string' }], source: { repo: 'backend', file: 'types.ts', line: 1 } },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend]);
    expect(lineages).toEqual([]);
  });

  it('does not match types with very different field sets and different names', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [
          {
            name: 'AuthConfig',
            fields: [
              { name: 'jwtSecret', type: 'string' },
              { name: 'expiresIn', type: 'number' },
            ],
            source: { repo: 'backend', file: 'src/config.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const ios = makeManifest({
      repoId: 'ios-app',
      language: 'swift',
      typeRegistry: {
        types: [
          {
            name: 'UserProfile',
            fields: [
              { name: 'displayName', type: 'String' },
              { name: 'avatarUrl', type: 'String' },
            ],
            source: { repo: 'ios-app', file: 'Models/Profile.swift', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, ios]);
    expect(lineages).toEqual([]);
  });

  it('includes schema types in lineage matching', () => {
    const backend = makeManifest({
      repoId: 'backend',
      typeRegistry: {
        types: [],
        schemas: [
          {
            name: 'TaskSchema',
            kind: 'zod',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'status', type: 'string' },
            ],
            source: { repo: 'backend', file: 'src/schemas.ts', line: 1 },
          },
        ],
        models: [],
      },
    });

    const frontend = makeManifest({
      repoId: 'frontend',
      typeRegistry: {
        types: [
          {
            name: 'Task',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'status', type: 'string' },
            ],
            source: { repo: 'frontend', file: 'src/types.ts', line: 1 },
          },
        ],
        schemas: [],
        models: [],
      },
    });

    const lineages = mapTypeFlows([backend, frontend]);
    // "TaskSchema" with suffix stripped -> "Task" matches frontend "Task"
    const taskLineage = lineages.find(l => l.concept === 'Task');
    expect(taskLineage).toBeDefined();
    expect(taskLineage!.instances).toHaveLength(2);
  });
});
