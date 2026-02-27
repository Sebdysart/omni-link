import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheManager } from '../../engine/context/cache-manager.js';
import type { FileScanResult, RepoManifest } from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

function makeScanResult(overrides: Partial<FileScanResult> = {}): FileScanResult {
  return {
    filePath: overrides.filePath ?? 'src/index.ts',
    sha: overrides.sha ?? 'abc123def456',
    scannedAt: overrides.scannedAt ?? new Date().toISOString(),
    exports: overrides.exports ?? [],
    imports: overrides.imports ?? [],
    types: overrides.types ?? [],
    schemas: overrides.schemas ?? [],
    routes: overrides.routes ?? [],
    procedures: overrides.procedures ?? [],
  };
}

function makeManifest(overrides: Partial<RepoManifest> = {}): RepoManifest {
  return {
    repoId: overrides.repoId ?? 'test-repo',
    path: overrides.path ?? '/repos/test-repo',
    language: overrides.language ?? 'typescript',
    gitState: {
      branch: 'main',
      headSha: 'head123',
      uncommittedChanges: [],
      recentCommits: [],
      ...overrides.gitState,
    },
    apiSurface: {
      routes: [],
      procedures: [],
      exports: [],
      ...overrides.apiSurface,
    },
    typeRegistry: {
      types: [],
      schemas: [],
      models: [],
      ...overrides.typeRegistry,
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
      internal: [],
      external: [],
      ...overrides.dependencies,
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-link-cache-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CacheManager', () => {
  describe('file caching', () => {
    it('returns null for uncached file', () => {
      const cache = new CacheManager(tmpDir);
      const result = cache.getCachedFile('my-repo', 'src/index.ts', 'sha-abc');
      expect(result).toBeNull();
    });

    it('stores and retrieves a cached file scan result', () => {
      const cache = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-abc', filePath: 'src/index.ts' });

      cache.setCachedFile('my-repo', 'src/index.ts', 'sha-abc', scanResult);
      const retrieved = cache.getCachedFile('my-repo', 'src/index.ts', 'sha-abc');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.sha).toBe('sha-abc');
      expect(retrieved!.filePath).toBe('src/index.ts');
    });

    it('returns null when SHA does not match', () => {
      const cache = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-abc' });

      cache.setCachedFile('my-repo', 'src/index.ts', 'sha-abc', scanResult);
      const retrieved = cache.getCachedFile('my-repo', 'src/index.ts', 'sha-different');

      expect(retrieved).toBeNull();
    });

    it('persists cache across CacheManager instances', () => {
      const cache1 = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-persist' });
      cache1.setCachedFile('repo-a', 'file.ts', 'sha-persist', scanResult);

      const cache2 = new CacheManager(tmpDir);
      const retrieved = cache2.getCachedFile('repo-a', 'file.ts', 'sha-persist');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.sha).toBe('sha-persist');
    });

    it('caches files from multiple repos independently', () => {
      const cache = new CacheManager(tmpDir);
      const resultA = makeScanResult({ sha: 'sha-a', filePath: 'a.ts' });
      const resultB = makeScanResult({ sha: 'sha-b', filePath: 'b.ts' });

      cache.setCachedFile('repo-a', 'a.ts', 'sha-a', resultA);
      cache.setCachedFile('repo-b', 'b.ts', 'sha-b', resultB);

      expect(cache.getCachedFile('repo-a', 'a.ts', 'sha-a')!.filePath).toBe('a.ts');
      expect(cache.getCachedFile('repo-b', 'b.ts', 'sha-b')!.filePath).toBe('b.ts');
      expect(cache.getCachedFile('repo-a', 'b.ts', 'sha-b')).toBeNull();
    });
  });

  describe('manifest caching', () => {
    it('returns null for uncached manifest', () => {
      const cache = new CacheManager(tmpDir);
      const result = cache.getCachedManifest('repo-a', 'head-abc');
      expect(result).toBeNull();
    });

    it('stores and retrieves a cached manifest', () => {
      const cache = new CacheManager(tmpDir);
      const manifest = makeManifest({ repoId: 'repo-a' });

      cache.setCachedManifest('repo-a', 'head-abc', manifest);
      const retrieved = cache.getCachedManifest('repo-a', 'head-abc');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.repoId).toBe('repo-a');
    });

    it('returns null when headSha does not match', () => {
      const cache = new CacheManager(tmpDir);
      const manifest = makeManifest({ repoId: 'repo-a' });

      cache.setCachedManifest('repo-a', 'head-abc', manifest);
      const retrieved = cache.getCachedManifest('repo-a', 'head-different');

      expect(retrieved).toBeNull();
    });
  });

  describe('invalidateRepo', () => {
    it('clears all cached data for a repo', () => {
      const cache = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-x' });
      const manifest = makeManifest({ repoId: 'repo-kill' });

      cache.setCachedFile('repo-kill', 'file.ts', 'sha-x', scanResult);
      cache.setCachedManifest('repo-kill', 'head-x', manifest);

      cache.invalidateRepo('repo-kill');

      expect(cache.getCachedFile('repo-kill', 'file.ts', 'sha-x')).toBeNull();
      expect(cache.getCachedManifest('repo-kill', 'head-x')).toBeNull();
    });

    it('does not affect other repos', () => {
      const cache = new CacheManager(tmpDir);
      const resultA = makeScanResult({ sha: 'sha-a' });
      const resultB = makeScanResult({ sha: 'sha-b' });

      cache.setCachedFile('repo-a', 'a.ts', 'sha-a', resultA);
      cache.setCachedFile('repo-b', 'b.ts', 'sha-b', resultB);

      cache.invalidateRepo('repo-a');

      expect(cache.getCachedFile('repo-a', 'a.ts', 'sha-a')).toBeNull();
      expect(cache.getCachedFile('repo-b', 'b.ts', 'sha-b')).not.toBeNull();
    });

    it('handles invalidation of non-existent repo gracefully', () => {
      const cache = new CacheManager(tmpDir);
      expect(() => cache.invalidateRepo('no-such-repo')).not.toThrow();
    });
  });

  describe('pruneOld', () => {
    it('removes files older than maxAgeDays', () => {
      const cache = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-old' });

      cache.setCachedFile('repo-a', 'old.ts', 'sha-old', scanResult);

      // Manually backdate the file
      const repoDir = path.join(tmpDir, 'repo-a', 'files');
      const files = fs.readdirSync(repoDir);
      for (const file of files) {
        const filePath = path.join(repoDir, file);
        const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
        fs.utimesSync(filePath, oldDate, oldDate);
      }

      cache.pruneOld(7);

      expect(cache.getCachedFile('repo-a', 'old.ts', 'sha-old')).toBeNull();
    });

    it('keeps files newer than maxAgeDays', () => {
      const cache = new CacheManager(tmpDir);
      const scanResult = makeScanResult({ sha: 'sha-new' });

      cache.setCachedFile('repo-a', 'new.ts', 'sha-new', scanResult);

      cache.pruneOld(7);

      expect(cache.getCachedFile('repo-a', 'new.ts', 'sha-new')).not.toBeNull();
    });

    it('prunes old manifest files too', () => {
      const cache = new CacheManager(tmpDir);
      const manifest = makeManifest({ repoId: 'repo-a' });

      cache.setCachedManifest('repo-a', 'head-old', manifest);

      // Backdate the manifest file
      const repoDir = path.join(tmpDir, 'repo-a');
      const files = fs.readdirSync(repoDir).filter(f => f.startsWith('manifest-'));
      for (const file of files) {
        const filePath = path.join(repoDir, file);
        const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        fs.utimesSync(filePath, oldDate, oldDate);
      }

      cache.pruneOld(7);

      expect(cache.getCachedManifest('repo-a', 'head-old')).toBeNull();
    });
  });
});
