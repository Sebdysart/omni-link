import { describe, it, expect } from 'vitest';
import { benchmarkAgainstBestPractices } from '../../engine/evolution/competitive-benchmarker.js';
import type { BenchmarkResult } from '../../engine/evolution/competitive-benchmarker.js';
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('benchmarkAgainstBestPractices', () => {
  describe('TS/Node backend checks', () => {
    it('flags missing rate limiting for backend repo', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
        dependencies: {
          internal: [],
          external: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const rateLimitResult = results.find(r => r.practice.toLowerCase().includes('rate limit'));

      expect(rateLimitResult).toBeDefined();
      expect(rateLimitResult!.status).toBe('missing');
      expect(rateLimitResult!.repo).toBe('backend');
    });

    it('marks rate limiting as present when dependency exists', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        dependencies: {
          internal: [],
          external: [
            { name: 'express-rate-limit', version: '^7.0.0', dev: false },
          ],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const rateLimitResult = results.find(r => r.practice.toLowerCase().includes('rate limit'));

      expect(rateLimitResult).toBeDefined();
      expect(rateLimitResult!.status).toBe('present');
    });

    it('flags missing security headers for backend', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/data', handler: 'getData', file: 'src/routes.ts', line: 5 },
          ],
          procedures: [],
          exports: [],
        },
        dependencies: {
          internal: [],
          external: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const securityResult = results.find(r =>
        r.practice.toLowerCase().includes('security header') || r.practice.toLowerCase().includes('helmet')
      );

      expect(securityResult).toBeDefined();
      expect(securityResult!.status).toBe('missing');
    });

    it('marks security headers present when helmet is a dependency', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/data', handler: 'getData', file: 'src/routes.ts', line: 5 },
          ],
          procedures: [],
          exports: [],
        },
        dependencies: {
          internal: [],
          external: [
            { name: 'helmet', version: '^7.0.0', dev: false },
          ],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const securityResult = results.find(r =>
        r.practice.toLowerCase().includes('security header') || r.practice.toLowerCase().includes('helmet')
      );

      expect(securityResult).toBeDefined();
      expect(securityResult!.status).toBe('present');
    });

    it('flags missing request validation', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        typeRegistry: {
          types: [],
          schemas: [],
          models: [],
        },
        dependencies: {
          internal: [],
          external: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const validationResult = results.find(r => r.practice.toLowerCase().includes('validation'));

      expect(validationResult).toBeDefined();
      expect(validationResult!.status).toBe('missing');
    });
  });

  describe('general best practices', () => {
    it('flags missing health check endpoint', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const healthResult = results.find(r => r.practice.toLowerCase().includes('health check'));

      expect(healthResult).toBeDefined();
      expect(healthResult!.status).toBe('missing');
    });

    it('marks health check as present when /health route exists', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/health', handler: 'healthCheck', file: 'src/routes.ts', line: 1 },
            { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const healthResult = results.find(r => r.practice.toLowerCase().includes('health check'));

      expect(healthResult).toBeDefined();
      expect(healthResult!.status).toBe('present');
    });

    it('flags missing pagination on list endpoints', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes.ts', line: 10 },
            { method: 'GET', path: '/api/posts', handler: 'getPosts', file: 'src/routes.ts', line: 20 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const paginationResult = results.find(r => r.practice.toLowerCase().includes('pagination'));

      expect(paginationResult).toBeDefined();
      expect(paginationResult!.status).toBe('missing');
    });
  });

  describe('comprehensive manifest', () => {
    it('reports mostly present for well-configured backend', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/health', handler: 'healthCheck', file: 'src/routes.ts', line: 1 },
            { method: 'GET', path: '/api/v1/users', handler: 'getUsersPaginated', file: 'src/routes.ts', line: 10, outputType: 'PaginatedUserList' },
            { method: 'POST', path: '/api/v1/users', handler: 'createUser', file: 'src/routes.ts', line: 20, inputType: 'CreateUserInput' },
          ],
          procedures: [],
          exports: [
            { name: 'errorHandler', kind: 'function', signature: 'function errorHandler()', file: 'src/middleware.ts', line: 1 },
          ],
        },
        typeRegistry: {
          types: [],
          schemas: [
            { name: 'CreateUserInput', kind: 'zod', fields: [], source: { repo: 'backend', file: 'src/schemas.ts', line: 1 } },
          ],
          models: [],
        },
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'middleware',
          patterns: ['rate-limiting', 'caching', 'cors', 'logging'],
          testingPatterns: 'co-located',
        },
        dependencies: {
          internal: [],
          external: [
            { name: 'helmet', version: '^7.0.0', dev: false },
            { name: 'express-rate-limit', version: '^7.0.0', dev: false },
            { name: 'cors', version: '^2.8.0', dev: false },
            { name: 'zod', version: '^3.0.0', dev: false },
            { name: 'winston', version: '^3.0.0', dev: false },
          ],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const presentCount = results.filter(r => r.status === 'present').length;
      const totalCount = results.length;

      // Should be mostly present
      expect(presentCount / totalCount).toBeGreaterThan(0.5);
    });
  });

  describe('each result has required fields', () => {
    it('all benchmark results have practice, status, repo, category, suggestion', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        language: 'typescript',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/data', handler: 'getData', file: 'src/routes.ts', line: 5 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.practice).toBeTruthy();
        expect(['present', 'missing', 'partial']).toContain(r.status);
        expect(r.repo).toBe('backend');
        expect(r.category).toBeTruthy();
        expect(r.suggestion).toBeTruthy();
      }
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty manifests', () => {
      const results = benchmarkAgainstBestPractices([]);
      expect(results).toEqual([]);
    });

    it('handles manifest with no routes at all', () => {
      const manifest = makeManifest({
        repoId: 'lib',
        language: 'typescript',
      });

      // Library with no routes should still get some general checks
      const results = benchmarkAgainstBestPractices([manifest]);
      // May be empty if no routes trigger no backend checks
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
