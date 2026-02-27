import { describe, it, expect } from 'vitest';
import type {
  OmniLinkConfig, RepoConfig, RepoManifest, EcosystemGraph,
  ApiBridge, ExportDef, RouteDefinition, TypeDef, SchemaDef,
  CommitSummary, NamingConvention, Mismatch, ImpactPath,
  TypeLineage, HealthScore, EvolutionSuggestion, EcosystemDigest,
} from '../engine/types.js';

describe('core types', () => {
  it('OmniLinkConfig is structurally valid', () => {
    const config: OmniLinkConfig = {
      repos: [{ name: 'test-backend', path: '/tmp/test-backend', language: 'typescript', role: 'backend' }],
      evolution: { aggressiveness: 'aggressive', maxSuggestionsPerSession: 5, categories: ['features', 'performance'] },
      quality: { blockOnFailure: true, requireTestsForNewCode: true, conventionStrictness: 'strict' },
      context: { tokenBudget: 8000, prioritize: 'changed-files-first', includeRecentCommits: 20 },
      cache: { directory: '/tmp/cache', maxAgeDays: 7 },
    };
    expect(config.repos).toHaveLength(1);
    expect(config.repos[0].name).toBe('test-backend');
  });

  it('RepoManifest is structurally valid', () => {
    const manifest: RepoManifest = {
      repoId: 'test', path: '/tmp/test', language: 'typescript',
      gitState: { branch: 'main', headSha: 'abc123', uncommittedChanges: [], recentCommits: [] },
      apiSurface: { routes: [], procedures: [], exports: [] },
      typeRegistry: { types: [], schemas: [], models: [] },
      conventions: { naming: 'camelCase', fileOrganization: 'feature-based', errorHandling: 'try-catch', patterns: [], testingPatterns: 'co-located' },
      dependencies: { internal: [], external: [] },
      health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
    };
    expect(manifest.repoId).toBe('test');
  });

  it('EcosystemGraph is structurally valid', () => {
    const graph: EcosystemGraph = { repos: [], bridges: [], sharedTypes: [], contractMismatches: [], impactPaths: [] };
    expect(graph.bridges).toEqual([]);
  });

  it('ApiBridge captures consumer-provider relationship', () => {
    const bridge: ApiBridge = {
      consumer: { repo: 'ios-app', file: 'Services/API.swift', line: 42 },
      provider: { repo: 'backend', route: 'POST /api/users', handler: 'createUser' },
      contract: {
        inputType: { name: 'CreateUserInput', fields: [{ name: 'email', type: 'string' }], source: { repo: 'backend', file: 'types.ts', line: 10 } },
        outputType: { name: 'User', fields: [{ name: 'id', type: 'string' }], source: { repo: 'backend', file: 'types.ts', line: 20 } },
        matchStatus: 'exact',
      },
    };
    expect(bridge.contract.matchStatus).toBe('exact');
  });
});
