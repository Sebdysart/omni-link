import { describe, it, expect } from 'vitest';
import { findBottlenecks } from '../../engine/evolution/bottleneck-finder.js';
import type { BottleneckFinding } from '../../engine/evolution/bottleneck-finder.js';
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
    health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('findBottlenecks', () => {
  describe('missing pagination detection', () => {
    it('flags list routes without pagination indicators', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/routes/users.ts', line: 10, outputType: 'UserList' },
            { method: 'GET', path: '/api/posts', handler: 'getPosts', file: 'src/routes/posts.ts', line: 5, outputType: 'PostList' },
          ],
          procedures: [],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const paginationFindings = findings.filter(f => f.kind === 'missing-pagination');

      expect(paginationFindings.length).toBeGreaterThan(0);
      expect(paginationFindings[0].repo).toBe('backend');
      expect(paginationFindings[0].severity).toBe('high');
    });

    it('does not flag routes with pagination in handler name', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users', handler: 'getUsersPaginated', file: 'src/routes/users.ts', line: 10, outputType: 'PaginatedUserList' },
          ],
          procedures: [],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const paginationFindings = findings.filter(f => f.kind === 'missing-pagination');
      expect(paginationFindings).toHaveLength(0);
    });

    it('does not flag single-resource GET routes', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users/:id', handler: 'getUser', file: 'src/routes/users.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const paginationFindings = findings.filter(f => f.kind === 'missing-pagination');
      expect(paginationFindings).toHaveLength(0);
    });

    it('flags list procedures without pagination', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [],
          procedures: [
            { name: 'listUsers', kind: 'query', file: 'src/routers/user.ts', line: 10, outputType: 'UserArray' },
          ],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const paginationFindings = findings.filter(f => f.kind === 'missing-pagination');
      expect(paginationFindings.length).toBeGreaterThan(0);
    });
  });

  describe('no caching detection', () => {
    it('flags multiple GET routes on same resource without caching patterns', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/products', handler: 'getProducts', file: 'src/routes/products.ts', line: 5 },
            { method: 'GET', path: '/api/products/:id', handler: 'getProduct', file: 'src/routes/products.ts', line: 15 },
            { method: 'GET', path: '/api/products/:id/reviews', handler: 'getProductReviews', file: 'src/routes/products.ts', line: 25 },
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
      });

      const findings = findBottlenecks([manifest]);
      const cachingFindings = findings.filter(f => f.kind === 'no-caching');

      expect(cachingFindings.length).toBeGreaterThan(0);
      expect(cachingFindings[0].severity).toBe('medium');
    });

    it('does not flag when caching pattern is present', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/products', handler: 'getProducts', file: 'src/routes/products.ts', line: 5 },
            { method: 'GET', path: '/api/products/:id', handler: 'getProduct', file: 'src/routes/products.ts', line: 15 },
          ],
          procedures: [],
          exports: [],
        },
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: ['caching', 'redis'],
          testingPatterns: 'co-located',
        },
      });

      const findings = findBottlenecks([manifest]);
      const cachingFindings = findings.filter(f => f.kind === 'no-caching');
      expect(cachingFindings).toHaveLength(0);
    });
  });

  describe('missing rate limiting detection', () => {
    it('flags POST/PUT/DELETE routes without rate-limiting patterns', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes/users.ts', line: 10 },
            { method: 'DELETE', path: '/api/users/:id', handler: 'deleteUser', file: 'src/routes/users.ts', line: 20 },
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

      const findings = findBottlenecks([manifest]);
      expect(findings.some(f => f.kind === 'no-rate-limiting')).toBe(true);
    });

    it('does not flag when rate-limit dependency is present', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes/users.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: ['rate-limiting'],
          testingPatterns: 'co-located',
        },
        dependencies: {
          internal: [],
          external: [
            { name: 'express-rate-limit', version: '^7.0.0', dev: false },
          ],
        },
      });

      const findings = findBottlenecks([manifest]);
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
      expect(rateLimitFindings).toHaveLength(0);
    });
  });

  describe('rate-limiting kind correctness', () => {
    it('rate-limiting finding uses kind no-rate-limiting (not unbounded-query)', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        conventions: { naming: 'camelCase', fileOrganization: 'feature-based', errorHandling: 'try-catch', patterns: [], testingPatterns: 'co-located' },
        dependencies: { internal: [], external: [] },
      });

      const findings = findBottlenecks([manifest]);
      const rateLimitFinding = findings.find(f => f.description.toLowerCase().includes('rate'));
      expect(rateLimitFinding).toBeDefined();
      expect(rateLimitFinding!.kind).toBe('no-rate-limiting');
    });

    it('flags mutation procedures without rate-limiting patterns', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [],
          procedures: [
            { name: 'createUser', kind: 'mutation', file: 'src/routers/user.ts', line: 10 },
            { name: 'deletePost', kind: 'mutation', file: 'src/routers/post.ts', line: 20 },
          ],
          exports: [],
        },
        conventions: { naming: 'camelCase', fileOrganization: 'feature-based', errorHandling: 'try-catch', patterns: [], testingPatterns: 'co-located' },
        dependencies: { internal: [], external: [] },
      });

      const findings = findBottlenecks([manifest]);
      expect(findings.some(f => f.kind === 'no-rate-limiting')).toBe(true);
    });
  });

  describe('no-queue detection', () => {
    it('flags repo with 20+ mutation procedures and no queue package', () => {
      const procedures = Array.from({ length: 22 }, (_, i) => ({
        name: `mutation${i}`,
        kind: 'mutation' as const,
        file: `src/routers/router${i}.ts`,
        line: 1,
      }));

      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: { routes: [], procedures, exports: [] },
        dependencies: { internal: [], external: [] },
      });

      const findings = findBottlenecks([manifest]);
      expect(findings.some(f => f.kind === 'no-queue')).toBe(true);
    });

    it('does not flag no-queue when queue package is present', () => {
      const procedures = Array.from({ length: 22 }, (_, i) => ({
        name: `mutation${i}`,
        kind: 'mutation' as const,
        file: `src/routers/router${i}.ts`,
        line: 1,
      }));

      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: { routes: [], procedures, exports: [] },
        dependencies: { internal: [], external: [{ name: 'bullmq', version: '^5.0.0', dev: false }] },
      });

      const findings = findBottlenecks([manifest]);
      expect(findings.some(f => f.kind === 'no-queue')).toBe(false);
    });

    it('does not flag no-queue for fewer than 20 mutation procedures', () => {
      const procedures = Array.from({ length: 15 }, (_, i) => ({
        name: `mutation${i}`,
        kind: 'mutation' as const,
        file: `src/routers/router${i}.ts`,
        line: 1,
      }));

      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: { routes: [], procedures, exports: [] },
        dependencies: { internal: [], external: [] },
      });

      const findings = findBottlenecks([manifest]);
      expect(findings.some(f => f.kind === 'no-queue')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty manifests', () => {
      const findings = findBottlenecks([]);
      expect(findings).toEqual([]);
    });

    it('returns empty array for manifest with no routes', () => {
      const manifest = makeManifest({ repoId: 'empty' });
      const findings = findBottlenecks([manifest]);
      expect(findings).toEqual([]);
    });

    it('handles manifests with proper patterns (clean report)', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'GET', path: '/api/users/:id', handler: 'getUser', file: 'src/routes/users.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: ['caching', 'rate-limiting'],
          testingPatterns: 'co-located',
        },
        dependencies: {
          internal: [],
          external: [{ name: 'express-rate-limit', version: '^7.0.0', dev: false }],
        },
      });

      const findings = findBottlenecks([manifest]);
      expect(findings).toHaveLength(0);
    });
  });
});
