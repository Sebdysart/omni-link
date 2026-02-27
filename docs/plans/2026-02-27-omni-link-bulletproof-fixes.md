# omni-link Bulletproof Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 10 evidence-backed fixes to make omni-link error-free and production-grade, covering severity bugs, false negatives in benchmarks, missing detector implementations, type inference gaps, incremental caching, and CI/CD.

**Architecture:** All changes are backwards-compatible (additive fields, extended unions, new optional params). Every fix follows the existing patterns: pure functions, manifest-level analysis, vitest for tests, TypeScript strict mode.

**Tech Stack:** TypeScript 5.7, Node.js ESM, tree-sitter (native), vitest 3, tsc Node16 module resolution.

**Working directory:** `/Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/`

**Test command:** `cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test`

**Lint command:** `cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint`

---

## Task 1: Fix impact severity — cross-repo `implementation-change` should be `warning` not `breaking`

**Files:**
- Modify: `engine/grapher/impact-analyzer.ts:189-193`
- Test: `tests/grapher/impact-analyzer.test.ts` (append new test)

**Step 1: Write the failing test** (append to the end of the `describe('analyzeImpact')` block in `tests/grapher/impact-analyzer.test.ts`, before the final `}`):

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep -A5 "implementation-change"
```
Expected: FAIL — `expected 'breaking' to be 'warning'`

**Step 3: Write the fix** — change `assessCrossRepoSeverity` in `engine/grapher/impact-analyzer.ts`:

Find this code (line ~192):
```typescript
  if (change.includes('implementation-change') || change.includes('implementation change')) return 'breaking';
```
Replace with:
```typescript
  if (change.includes('implementation-change') || change.includes('implementation change')) return 'warning';
```

**Step 4: Run tests to verify pass**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```
Expected: all tests pass.

**Step 5: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/grapher/impact-analyzer.ts tests/grapher/impact-analyzer.test.ts && git commit -m "fix: cross-repo implementation-change severity is warning not breaking"
```

---

## Task 2: Framework-aware benchmarks (Hono, Fastify false negatives)

**Files:**
- Modify: `engine/evolution/competitive-benchmarker.ts`
- Test: `tests/evolution/competitive-benchmarker.test.ts` (append new tests)

**Root cause:** Package checks use full package names like `express-rate-limit`; Hono uses `@hono/rate-limiter`. Fix: switch to keyword-substring matching.

**Step 1: Write failing tests** (append to `tests/evolution/competitive-benchmarker.test.ts` before the final `}`):

```typescript
  describe('framework-aware detection (Hono/Fastify)', () => {
    it('recognizes @hono/rate-limiter as rate limiting', () => {
      const manifest = makeManifest({
        repoId: 'hono-backend',
        apiSurface: {
          routes: [{ method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/index.ts', line: 1 }],
          procedures: [], exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: '@hono/rate-limiter', version: '^0.4.0', dev: false }],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const rl = results.find(r => r.practice.toLowerCase().includes('rate limit'));
      expect(rl).toBeDefined();
      expect(rl!.status).toBe('present');
    });

    it('recognizes hono-rate-limiter as rate limiting', () => {
      const manifest = makeManifest({
        repoId: 'hono-backend',
        apiSurface: {
          routes: [{ method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/index.ts', line: 1 }],
          procedures: [], exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: 'hono-rate-limiter', version: '^0.1.0', dev: false }],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const rl = results.find(r => r.practice.toLowerCase().includes('rate limit'));
      expect(rl!.status).toBe('present');
    });

    it('recognizes @fastify/helmet as security headers', () => {
      const manifest = makeManifest({
        repoId: 'fastify-backend',
        apiSurface: {
          routes: [{ method: 'GET', path: '/api/data', handler: 'getData', file: 'src/index.ts', line: 1 }],
          procedures: [], exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: '@fastify/helmet', version: '^11.0.0', dev: false }],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const sec = results.find(r =>
        r.practice.toLowerCase().includes('security header') || r.practice.toLowerCase().includes('helmet')
      );
      expect(sec).toBeDefined();
      expect(sec!.status).toBe('present');
    });

    it('recognizes consola as structured logging', () => {
      const manifest = makeManifest({
        repoId: 'hono-backend',
        apiSurface: {
          routes: [{ method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/index.ts', line: 1 }],
          procedures: [], exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: 'consola', version: '^3.0.0', dev: false }],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const log = results.find(r => r.practice.toLowerCase().includes('logging'));
      expect(log).toBeDefined();
      expect(log!.status).toBe('present');
    });

    it('recognizes @hono/cors as CORS configuration', () => {
      const manifest = makeManifest({
        repoId: 'hono-backend',
        apiSurface: {
          routes: [{ method: 'GET', path: '/api/users', handler: 'getUsers', file: 'src/index.ts', line: 1 }],
          procedures: [], exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: '@hono/cors', version: '^0.0.12', dev: false }],
        },
      });

      const results = benchmarkAgainstBestPractices([manifest]);
      const cors = results.find(r => r.practice.toLowerCase().includes('cors'));
      expect(cors).toBeDefined();
      expect(cors!.status).toBe('present');
    });
  });
```

**Step 2: Run to confirm failures**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|framework-aware"
```

**Step 3: Rewrite the package detection constants and checkers** in `engine/evolution/competitive-benchmarker.ts`:

Replace the `RATE_LIMIT_PACKAGES` constant and the `checkRateLimiting` function body:

```typescript
// Replace:
const RATE_LIMIT_PACKAGES = ['express-rate-limit', 'rate-limiter-flexible', 'bottleneck', 'p-throttle'];
const RATE_LIMIT_PATTERNS = ['rate-limit', 'rate_limit', 'ratelimit', 'throttle'];

function checkRateLimiting(manifest: RepoManifest): BenchmarkResult | null {
  // Only check if the repo has routes
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    RATE_LIMIT_PACKAGES.some(pkg => d.name.toLowerCase().includes(pkg))
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    RATE_LIMIT_PATTERNS.some(rl => p.toLowerCase().includes(rl))
  );

  return {
    practice: 'Rate limiting',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add rate limiting middleware (e.g., express-rate-limit) to protect mutation endpoints from abuse.',
  };
}
```

With:

```typescript
// Keyword-based: matches any package whose name contains one of these substrings.
// Covers: express-rate-limit, rate-limiter-flexible, @hono/rate-limiter, hono-rate-limiter, bottleneck, p-throttle
const RATE_LIMIT_KEYWORDS = ['rate-limit', 'ratelimit', 'rate_limit', 'throttle', 'limiter', 'bottleneck'];
const RATE_LIMIT_PATTERNS = ['rate-limit', 'rate_limit', 'ratelimit', 'throttle'];

function checkRateLimiting(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d => {
    const name = d.name.toLowerCase();
    return RATE_LIMIT_KEYWORDS.some(kw => name.includes(kw));
  });
  const hasPattern = manifest.conventions.patterns.some(p =>
    RATE_LIMIT_PATTERNS.some(rl => p.toLowerCase().includes(rl))
  );

  return {
    practice: 'Rate limiting',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add rate limiting middleware (e.g., express-rate-limit, @hono/rate-limiter) to protect mutation endpoints from abuse.',
  };
}
```

Replace the `HELMET_PACKAGES` constant and `checkSecurityHeaders`:

```typescript
// Replace:
const HELMET_PACKAGES = ['helmet', 'fastify-helmet'];

function checkSecurityHeaders(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    HELMET_PACKAGES.some(pkg => d.name.toLowerCase() === pkg)
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    p.toLowerCase().includes('helmet') || p.toLowerCase().includes('security-header')
  );

  return {
    practice: 'Security headers (Helmet)',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add Helmet middleware to set security-related HTTP response headers.',
  };
}
```

With:

```typescript
// Keywords cover: helmet, fastify-helmet, @fastify/helmet, secure-headers, security-headers
const SECURITY_HEADER_KEYWORDS = ['helmet', 'secure-header', 'security-header'];

function checkSecurityHeaders(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d => {
    const name = d.name.toLowerCase();
    return SECURITY_HEADER_KEYWORDS.some(kw => name.includes(kw));
  });
  const hasPattern = manifest.conventions.patterns.some(p =>
    p.toLowerCase().includes('helmet') || p.toLowerCase().includes('security-header')
  );

  return {
    practice: 'Security headers (Helmet)',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add security headers middleware (e.g., helmet, @fastify/helmet, or Hono secureHeaders()) to protect against common attacks.',
  };
}
```

Replace the `LOGGING_PACKAGES` constant:

```typescript
// Replace:
const LOGGING_PACKAGES = ['winston', 'pino', 'bunyan', 'morgan', 'log4js', 'signale'];
```

With:

```typescript
// Covers modern logging libs across frameworks: winston, pino, bunyan, morgan, consola, tslog, roarr
const LOGGING_PACKAGES = ['winston', 'pino', 'bunyan', 'morgan', 'log4js', 'signale', 'consola', 'tslog', 'roarr', 'loglevel'];
```

**Step 4: Run tests to confirm pass**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 5: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/evolution/competitive-benchmarker.ts tests/evolution/competitive-benchmarker.test.ts && git commit -m "fix: framework-aware benchmark detection for Hono, Fastify, consola"
```

---

## Task 3: Implement over-abstraction detector (complete the stub)

**Files:**
- Modify: `engine/quality/slop-detector.ts`
- Test: `tests/quality/slop-detector.test.ts` (append new describe block)

**Step 1: Write failing tests** (append new `describe` block to `tests/quality/slop-detector.test.ts` before the final `}`):

```typescript
  describe('over-abstraction detection', () => {
    it('flags 3+ inheritance relationships in one file', () => {
      const code = `
interface A { id: string; }
interface B extends A { name: string; }
interface C extends B { email: string; }
class D extends C { role: string = 'user'; }
`;
      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overAbstraction = result.issues.filter(i => i.kind === 'over-abstraction');
      expect(overAbstraction.length).toBeGreaterThan(0);
      expect(overAbstraction[0].severity).toBe('warning');
    });

    it('does not flag 2 or fewer inheritance relationships', () => {
      const code = `
interface Base { id: string; }
interface Extended extends Base { name: string; }
class Impl implements Extended {
  id = '';
  name = '';
}
`;
      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overAbstraction = result.issues.filter(i => i.kind === 'over-abstraction');
      // 2 extends/implements is fine
      expect(overAbstraction).toHaveLength(0);
    });

    it('flags when abstract types vastly outnumber concrete classes', () => {
      const code = `
abstract class BaseA { abstract doA(): void; }
abstract class BaseB { abstract doB(): void; }
abstract class BaseC { abstract doC(): void; }
abstract class BaseD { abstract doD(): void; }
class ConcreteImpl extends BaseA {
  doA() { return 'done'; }
}
`;
      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overAbstraction = result.issues.filter(i => i.kind === 'over-abstraction');
      expect(overAbstraction.length).toBeGreaterThan(0);
    });

    it('flags 3+ single-delegation wrapper functions', () => {
      const code = `
export function getUser(id: string) { return userService.getUser(id); }
export function createUser(data: any) { return userService.createUser(data); }
export function deleteUser(id: string) { return userService.deleteUser(id); }
export function updateUser(id: string, data: any) { return userService.updateUser(id, data); }
`;
      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overAbstraction = result.issues.filter(i => i.kind === 'over-abstraction');
      expect(overAbstraction.length).toBeGreaterThan(0);
    });

    it('does not flag normal class hierarchies of depth 1-2', () => {
      const code = `
export class UserService {
  async getUser(id: string) {
    const user = await this.db.findOne({ id });
    if (!user) throw new Error('Not found');
    return user;
  }

  async createUser(data: CreateUserInput) {
    return this.db.insert(data);
  }
}
`;
      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overAbstraction = result.issues.filter(i => i.kind === 'over-abstraction');
      expect(overAbstraction).toHaveLength(0);
    });
  });
```

**Step 2: Run to confirm failures**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|over-abstraction"
```
Expected: tests for `over-abstraction` fail because `detectOverAbstraction` returns `[]`.

**Step 3: Implement `detectOverAbstraction`** in `engine/quality/slop-detector.ts`.

Add this new section BEFORE the `// ─── Main Detector ───` section (before line ~279):

```typescript
// ─── Over-Abstraction Detection ──────────────────────────────────────────────

/**
 * Detect over-engineering patterns: deep inheritance chains, too many abstract types,
 * and files full of single-delegation wrapper functions.
 */
function detectOverAbstraction(code: string): SlopIssue[] {
  const issues: SlopIssue[] = [];

  // Heuristic 1: Deep inheritance chains — 3+ extends/implements in one file
  const inheritanceCount = (code.match(/\b(?:interface|class)\s+\w+[^{]*\bextends\b/g) ?? []).length;
  if (inheritanceCount >= 3) {
    issues.push({
      kind: 'over-abstraction',
      message: `${inheritanceCount} inheritance relationships in one file — consider flattening the hierarchy`,
      line: 1,
      severity: 'warning',
    });
  }

  // Heuristic 2: Abstract types >= 2x concrete classes in one file
  const abstractCount = (code.match(/\b(?:abstract\s+class|interface)\s+\w+/g) ?? []).length;
  // Match 'class Foo' but NOT 'abstract class Foo' (negative lookbehind for 'abstract ')
  const concreteCount = (code.match(/(?<!abstract\s)\bclass\s+\w+/g) ?? []).length;
  if (abstractCount >= 2 && concreteCount > 0 && abstractCount >= concreteCount * 2) {
    issues.push({
      kind: 'over-abstraction',
      message: `${abstractCount} abstract types vs ${concreteCount} concrete classes — possible over-engineering`,
      line: 1,
      severity: 'warning',
    });
  }

  // Heuristic 3: 3+ single-delegation wrapper functions
  // Matches: (export )?(async )?function name(...) { (return )?(await )?obj.method(...); }
  const singleDelegationRe =
    /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)[^{]*\{\s*(?:return\s+)?(?:await\s+)?\w+(?:\.\w+)+\s*\([^)]*\)\s*;?\s*\}/g;
  const wrapperCount = (code.match(singleDelegationRe) ?? []).length;
  if (wrapperCount >= 3) {
    issues.push({
      kind: 'over-abstraction',
      message: `${wrapperCount} single-delegation wrapper functions detected — consider removing unnecessary indirection`,
      line: 1,
      severity: 'warning',
    });
  }

  return issues;
}
```

Then update the `detectSlop` main function to call it. Find:

```typescript
  const issues: SlopIssue[] = [
    ...detectPlaceholders(proposedCode),
    ...detectPhantomImports(proposedCode, manifest),
    ...detectDuplicateBlocks(proposedCode),
    ...detectOverCommenting(proposedCode),
  ];
```

Replace with:

```typescript
  const issues: SlopIssue[] = [
    ...detectPlaceholders(proposedCode),
    ...detectPhantomImports(proposedCode, manifest),
    ...detectDuplicateBlocks(proposedCode),
    ...detectOverCommenting(proposedCode),
    ...detectOverAbstraction(proposedCode),
  ];
```

**Step 4: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 5: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/quality/slop-detector.ts tests/quality/slop-detector.test.ts && git commit -m "feat: implement over-abstraction detector in slop-detector"
```

---

## Task 4: Upgrade tree-sitter-swift

**Files:**
- Modify: `package.json:31`

**Step 1: Check available versions and install latest**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm view tree-sitter-swift versions --json 2>&1 | tail -5
```

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm install tree-sitter-swift@latest 2>&1 | tail -3
```

**Step 2: Verify the installed version**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm list tree-sitter-swift
```

**Step 3: Run existing tests to confirm nothing broke**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 4: Commit** (package.json will have been updated by npm install)

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add package.json package-lock.json && git commit -m "chore: upgrade tree-sitter-swift to latest"
```

---

## Task 5: Add focus mode to token pruner

**Files:**
- Modify: `engine/types.ts:26` (extend `OmniLinkConfig.context`)
- Modify: `engine/context/token-pruner.ts:63-67` (update signature + phase 1)
- Modify: `engine/context/index.ts` (pass focus through)
- Test: `tests/context/token-pruner.test.ts` (append new tests)

**Step 1: Write failing tests** — append to `tests/context/token-pruner.test.ts`:

First read what's in that file:
```bash
cat /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/tests/context/token-pruner.test.ts | tail -20
```

Then append these tests before the final `}`:

```typescript
  describe('focus mode', () => {
    it('preserves recent commits when focus=commits even under budget pressure', () => {
      // Build a graph just over budget with commits
      const graph = makeGraph({
        repos: [makeManifest({
          repoId: 'backend',
          gitState: {
            branch: 'main', headSha: 'abc',
            uncommittedChanges: [],
            recentCommits: Array.from({ length: 15 }, (_, i) => ({
              sha: `sha${i}`,
              message: `commit message number ${i} with some details`,
              author: 'dev',
              date: '2026-01-01T00:00:00Z',
              filesChanged: [],
            })),
          },
          // Add enough routes to push over a small budget
          apiSurface: {
            routes: Array.from({ length: 10 }, (_, i) => ({
              method: 'GET', path: `/api/route-${i}`, handler: `handler${i}`,
              file: `src/routes/${i}.ts`, line: 1,
            })),
            procedures: [], exports: [],
          },
        })],
      });

      const budget = 200; // very tight
      const withoutFocus = pruneToTokenBudget(graph, budget, 'changed-files-first');
      const withFocus = pruneToTokenBudget(graph, budget, 'changed-files-first', 'commits');

      // With focus=commits, commits should be preserved longer than without focus
      const commitsWithout = withoutFocus.graph.repos[0]?.gitState.recentCommits.length ?? 0;
      const commitsWith = withFocus.graph.repos[0]?.gitState.recentCommits.length ?? 0;
      expect(commitsWith).toBeGreaterThanOrEqual(commitsWithout);
    });

    it('returns same result for focus=auto as no focus', () => {
      const graph = makeGraph({ repos: [] });
      const result1 = pruneToTokenBudget(graph, 8000, 'changed-files-first');
      const result2 = pruneToTokenBudget(graph, 8000, 'changed-files-first', 'auto');
      expect(result1.tokenEstimate).toBe(result2.tokenEstimate);
    });

    it('accepts undefined focus without error', () => {
      const graph = makeGraph({ repos: [] });
      expect(() => pruneToTokenBudget(graph, 8000, 'changed-files-first', undefined)).not.toThrow();
    });
  });
```

**Step 2: Run to confirm failures** (the `focus` param doesn't exist yet):

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | grep -E "FAIL|focus mode"
```

**Step 3: Add `focus` to types.ts**

In `engine/types.ts`, find:

```typescript
  context: {
    tokenBudget: number;
    prioritize: 'changed-files-first' | 'api-surface-first';
    includeRecentCommits: number;
  };
```

Replace with:

```typescript
  context: {
    tokenBudget: number;
    prioritize: 'changed-files-first' | 'api-surface-first';
    includeRecentCommits: number;
    /** Override which content section is protected longest during pruning. */
    focus?: 'commits' | 'types' | 'api-surface' | 'mismatches' | 'auto';
  };
```

**Step 4: Update `pruneToTokenBudget` signature in `engine/context/token-pruner.ts`**

Find:

```typescript
export function pruneToTokenBudget(
  graph: EcosystemGraph,
  budget: number,
  prioritize: 'changed-files-first' | 'api-surface-first',
): PrunedContext {
```

Replace with:

```typescript
export function pruneToTokenBudget(
  graph: EcosystemGraph,
  budget: number,
  prioritize: 'changed-files-first' | 'api-surface-first',
  focus?: 'commits' | 'types' | 'api-surface' | 'mismatches' | 'auto',
): PrunedContext {
```

Find the Phase 1 comment block (around line 96):

```typescript
  // Phase 1: Trim recent commits (priority 10)
  if (totalTokens > budget) {
    for (const repo of pruned.repos) {
      const commits = repo.gitState.recentCommits;
      while (commits.length > 0 && totalTokens > budget) {
```

Replace with:

```typescript
  // Phase 1: Trim recent commits (priority 10) — skipped when focus=commits
  if (totalTokens > budget && focus !== 'commits') {
    for (const repo of pruned.repos) {
      const commits = repo.gitState.recentCommits;
      while (commits.length > 0 && totalTokens > budget) {
```

Add a final fallback phase after Phase 7 that trims commits only when focus=commits (i.e., last resort):

Find the comment `// Contract mismatches (priority 100) — never trimmed` and add before it:

```typescript
  // Phase 7b: Trim recent commits last (only when focus=commits and still over budget)
  if (totalTokens > budget && focus === 'commits') {
    for (const repo of pruned.repos) {
      const commits = repo.gitState.recentCommits;
      while (commits.length > 0 && totalTokens > budget) {
        const removed = commits.pop()!;
        const savedTokens = estimateTokens(serializeCommit(removed));
        totalTokens -= savedTokens;
        droppedItems.push(`commit:${repo.repoId}:${removed.sha}`);
      }
    }
  }
```

**Step 5: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 6: Run lint**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint 2>&1 | tail -5
```

**Step 7: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/types.ts engine/context/token-pruner.ts tests/context/token-pruner.test.ts && git commit -m "feat: add focus mode to token pruner to protect specific context sections"
```

---

## Task 6: Add type inheritance tracking

**Files:**
- Modify: `engine/types.ts` (add `extends?` to `TypeDef`)
- Modify: `engine/scanner/type-extractor.ts` (extract extends clauses)
- Test: `tests/scanner/type-extractor.test.ts` (append new tests)

**Step 1: Write failing tests** — read the existing test file first:

```bash
head -60 /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/tests/scanner/type-extractor.test.ts
```

Then append new tests for inheritance:

```typescript
  describe('type inheritance extraction', () => {
    it('extracts extends clause from TypeScript interface', () => {
      const source = `
interface Base {
  id: string;
}
interface Extended extends Base {
  name: string;
}
`;
      const types = extractTypes(source, 'src/types.ts', 'typescript', 'backend');
      const extended = types.find(t => t.name === 'Extended');
      expect(extended).toBeDefined();
      expect(extended!.extends).toBeDefined();
      expect(extended!.extends).toContain('Base');
    });

    it('extracts multiple extends from interface', () => {
      const source = `
interface A { a: string; }
interface B { b: string; }
interface C extends A, B { c: string; }
`;
      const types = extractTypes(source, 'src/types.ts', 'typescript', 'backend');
      const c = types.find(t => t.name === 'C');
      expect(c?.extends).toBeDefined();
      expect(c!.extends!.length).toBe(2);
      expect(c!.extends).toContain('A');
      expect(c!.extends).toContain('B');
    });

    it('leaves extends undefined for interfaces with no inheritance', () => {
      const source = `
interface Standalone {
  id: string;
  name: string;
}
`;
      const types = extractTypes(source, 'src/types.ts', 'typescript', 'backend');
      const t = types.find(t => t.name === 'Standalone');
      expect(t).toBeDefined();
      expect(t!.extends).toBeUndefined();
    });
  });
```

**Step 2: Run to confirm failures**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|inheritance"
```

**Step 3: Add `extends?` to `TypeDef` in `engine/types.ts`**

Find:

```typescript
export interface TypeDef {
  name: string;
  fields: TypeField[];
  source: { repo: string; file: string; line: number };
}
```

Replace with:

```typescript
export interface TypeDef {
  name: string;
  fields: TypeField[];
  source: { repo: string; file: string; line: number };
  /** Names of parent interfaces/types this type extends or intersects with. */
  extends?: string[];
}
```

**Step 4: Extract extends in `engine/scanner/type-extractor.ts`**

In `extractTSTypes`, find the interface extraction loop. Locate the block where it pushes a result for an interface (around line 47):

```typescript
    results.push({
      name: nameNode.text,
      fields,
      source: { repo, file, line: iface.startPosition.row + 1 },
    });
```

Replace with:

```typescript
    // Collect inherited type names from extends clause
    const heritageClause = iface.descendantsOfType('extends_type_clause')[0];
    const extendsNames: string[] = [];
    if (heritageClause) {
      const typeIds = heritageClause.descendantsOfType('type_identifier');
      for (const tid of typeIds) {
        extendsNames.push(tid.text);
      }
    }

    results.push({
      name: nameNode.text,
      fields,
      extends: extendsNames.length > 0 ? extendsNames : undefined,
      source: { repo, file, line: iface.startPosition.row + 1 },
    });
```

In the type alias section, find the push for aliases (around line 63):

```typescript
    results.push({
      name: nameNode.text,
      fields,
      source: { repo, file, line: alias.startPosition.row + 1 },
    });
```

Replace with:

```typescript
    // Extract intersection type members (type Foo = Bar & Baz → extends: ['Bar', 'Baz'])
    const intersectionType = alias.descendantsOfType('intersection_type')[0];
    const aliasExtendsNames: string[] = [];
    if (intersectionType) {
      const typeIds = intersectionType.descendantsOfType('type_identifier');
      for (const tid of typeIds) {
        aliasExtendsNames.push(tid.text);
      }
    }

    results.push({
      name: nameNode.text,
      fields,
      extends: aliasExtendsNames.length > 0 ? aliasExtendsNames : undefined,
      source: { repo, file, line: alias.startPosition.row + 1 },
    });
```

**Step 5: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 6: Run lint**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint 2>&1 | tail -5
```

**Step 7: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/types.ts engine/scanner/type-extractor.ts tests/scanner/type-extractor.test.ts && git commit -m "feat: track type inheritance in TypeDef.extends field"
```

---

## Task 7: Wire incremental file-level cache into scanner

**Files:**
- Modify: `engine/scanner/index.ts`
- Modify: `engine/index.ts` (pass CacheManager to scanRepo)
- Test: `tests/scanner/index.test.ts` (append cache hit test)

**Step 1: Write failing test** — append to `tests/scanner/index.test.ts`. First read the file:

```bash
tail -30 /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/tests/scanner/index.test.ts
```

Then append (before the final `}`):

```typescript
  describe('incremental caching', () => {
    it('accepts an optional CacheManager without error', () => {
      // CacheManager is an optional param — passing undefined must work
      const config: RepoConfig = {
        name: 'test-repo',
        path: '/tmp/nonexistent-repo-for-cache-test',
        language: 'typescript',
        role: 'backend',
      };
      // scanRepo with non-existent path returns empty manifest (no files found)
      // The important thing is it doesn't throw when cacheManager is undefined
      expect(() => scanRepo(config, undefined)).not.toThrow();
    });
  });
```

**Step 2: Run to confirm test currently passes** (it should — `undefined` is the default already):

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep "incremental"
```

**Step 3: Update `engine/scanner/index.ts`** to wire cache:

Add at top of file after existing imports:

```typescript
import * as crypto from 'node:crypto';
import { CacheManager } from '../context/cache-manager.js';
import type { FileScanResult } from '../types.js';
```

Change the `scanRepo` signature:

```typescript
// Replace:
export function scanRepo(config: RepoConfig): RepoManifest {

// With:
export function scanRepo(config: RepoConfig, cacheManager?: CacheManager): RepoManifest {
```

Inside `scanRepo`, add a manifest-level cache check RIGHT AFTER `const { name, path: repoPath, language } = config;`:

```typescript
  // ─── Manifest-level cache check ─────────────────────────────────────────
  // If no uncommitted changes and HEAD matches cached manifest, return it directly.
  if (cacheManager) {
    const currentHead = gitExec(repoPath, 'rev-parse HEAD');
    const uncommitted = gitExec(repoPath, 'diff --name-only').trim();
    const staged = gitExec(repoPath, 'diff --cached --name-only').trim();
    if (currentHead && !uncommitted && !staged) {
      const cached = cacheManager.getCachedManifest(name, currentHead);
      if (cached) return cached;
    }
  }
```

Inside the file-parsing loop, find `let source: string;` and surround the parse block with cache logic:

```typescript
    // Replace the existing parse block:
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // Skip files we cannot read
      continue;
    }

    // Relative path from repo root for cleaner file references
    const relPath = path.relative(repoPath, filePath);

    // Extract all dimensions
    const exports = extractExports(source, relPath, lang);
    const routes = extractRoutes(source, relPath, lang);
    const procedures = extractProcedures(source, relPath, lang);
    const types = extractTypes(source, relPath, lang, name);
    const schemas = extractSchemas(source, relPath, lang, name);

    allExports.push(...exports);
    allRoutes.push(...routes);
    allProcedures.push(...procedures);
    allTypes.push(...types);
    allSchemas.push(...schemas);

    // Collect for convention detection
    fileInfos.push({
      path: relPath,
      exports: exports.map((e) => e.name),
    });

    // Collect source snippets for error-handling detection (limit size)
    if (source.length < 50_000) {
      sourceSnippets.push(source);
    }
```

With:

```typescript
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = path.relative(repoPath, filePath);

    // ─── File-level cache check ───────────────────────────────────────────
    if (cacheManager) {
      const fileSha = crypto.createHash('sha1').update(source).digest('hex');
      const cachedFile = cacheManager.getCachedFile(name, relPath, fileSha);
      if (cachedFile) {
        allExports.push(...cachedFile.exports);
        allRoutes.push(...cachedFile.routes);
        allProcedures.push(...cachedFile.procedures);
        allTypes.push(...cachedFile.types);
        allSchemas.push(...cachedFile.schemas);
        fileInfos.push({ path: relPath, exports: cachedFile.exports.map(e => e.name) });
        if (source.length < 50_000) sourceSnippets.push(source);
        continue;
      }

      // Cache miss — parse and store
      const exports = extractExports(source, relPath, lang);
      const routes = extractRoutes(source, relPath, lang);
      const procedures = extractProcedures(source, relPath, lang);
      const types = extractTypes(source, relPath, lang, name);
      const schemas = extractSchemas(source, relPath, lang, name);

      const scanResult: FileScanResult = {
        filePath: relPath, sha: fileSha,
        scannedAt: new Date().toISOString(),
        exports, imports: [], types, schemas, routes, procedures,
      };
      cacheManager.setCachedFile(name, relPath, fileSha, scanResult);

      allExports.push(...exports);
      allRoutes.push(...routes);
      allProcedures.push(...procedures);
      allTypes.push(...types);
      allSchemas.push(...schemas);
      fileInfos.push({ path: relPath, exports: exports.map(e => e.name) });
      if (source.length < 50_000) sourceSnippets.push(source);
      continue;
    }

    // ─── No cache — parse normally ────────────────────────────────────────
    const exports = extractExports(source, relPath, lang);
    const routes = extractRoutes(source, relPath, lang);
    const procedures = extractProcedures(source, relPath, lang);
    const types = extractTypes(source, relPath, lang, name);
    const schemas = extractSchemas(source, relPath, lang, name);

    allExports.push(...exports);
    allRoutes.push(...routes);
    allProcedures.push(...procedures);
    allTypes.push(...types);
    allSchemas.push(...schemas);
    fileInfos.push({ path: relPath, exports: exports.map((e) => e.name) });
    if (source.length < 50_000) sourceSnippets.push(source);
```

**Step 4: Update `engine/index.ts`** to pass CacheManager to scanRepo:

Add import at top:

```typescript
import { CacheManager } from './context/cache-manager.js';
```

In the `scan` function, replace:

```typescript
  const manifests = config.repos.map((repo) => scanRepo(repo));
```

With:

```typescript
  const cache = config.cache ? new CacheManager(config.cache.directory) : undefined;
  const manifests = config.repos.map((repo) => scanRepo(repo, cache));
  // Store clean manifests in manifest-level cache
  if (cache) {
    for (const manifest of manifests) {
      if (manifest.gitState.uncommittedChanges.length === 0 && manifest.gitState.headSha) {
        cache.setCachedManifest(manifest.repoId, manifest.gitState.headSha, manifest);
      }
    }
  }
```

Do the same for `impact`, `health`, `evolve`, `qualityCheck` — each calls `config.repos.map((repo) => scanRepo(repo))`:

For all other pipeline functions (`impact`, `health`, `evolve`, `qualityCheck`), replace `config.repos.map((repo) => scanRepo(repo))` with:

```typescript
config.repos.map((repo) => scanRepo(repo, config.cache ? new CacheManager(config.cache.directory) : undefined))
```

**Step 5: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 6: Run lint**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint 2>&1 | tail -5
```

**Step 7: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/scanner/index.ts engine/index.ts tests/scanner/index.test.ts && git commit -m "feat: wire incremental file-level and manifest-level cache into scanner"
```

---

## Task 8: Expand bottleneck finder — fix kind bug + add procedure rate-limit check + no-queue detector

**Files:**
- Modify: `engine/evolution/bottleneck-finder.ts`
- Test: `tests/evolution/bottleneck-finder.test.ts` (append new tests)

**Root cause:** `detectMissingRateLimiting` returns `kind: 'unbounded-query'` (semantically wrong), doesn't check mutation procedures, and there's no background-queue detector.

**Step 1: Write failing tests** (append to `tests/evolution/bottleneck-finder.test.ts`):

```typescript
  describe('rate limiting kind correctness', () => {
    it('uses no-rate-limiting kind (not unbounded-query) for missing rate limit', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [
            { method: 'POST', path: '/api/users', handler: 'createUser', file: 'src/routes/users.ts', line: 10 },
          ],
          procedures: [],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
      expect(rateLimitFindings.length).toBeGreaterThan(0);
      expect(rateLimitFindings[0].severity).toBe('high');
    });
  });

  describe('mutation procedure rate limiting detection', () => {
    it('flags mutation procedures without rate-limiting middleware', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [],
          procedures: [
            { name: 'createUser', kind: 'mutation', file: 'src/routers/user.ts', line: 10 },
            { name: 'deleteUser', kind: 'mutation', file: 'src/routers/user.ts', line: 20 },
          ],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
      expect(rateLimitFindings.length).toBeGreaterThan(0);
    });

    it('does not flag procedures when rate-limiting package is present', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [],
          procedures: [
            { name: 'createUser', kind: 'mutation', file: 'src/routers/user.ts', line: 10 },
          ],
          exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: '@hono/rate-limiter', version: '^0.1.0', dev: false }],
        },
      });

      const findings = findBottlenecks([manifest]);
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
      expect(rateLimitFindings).toHaveLength(0);
    });
  });

  describe('no background queue detection', () => {
    it('flags repo with 20+ mutation procedures and no queue package', () => {
      const procedures = Array.from({ length: 22 }, (_, i) => ({
        name: `doOperation${i}`,
        kind: 'mutation' as const,
        file: 'src/routers/ops.ts',
        line: i * 5 + 1,
      }));

      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: { routes: [], procedures, exports: [] },
        dependencies: { internal: [], external: [] },
      });

      const findings = findBottlenecks([manifest]);
      const queueFindings = findings.filter(f => f.kind === 'no-queue');
      expect(queueFindings.length).toBeGreaterThan(0);
      expect(queueFindings[0].severity).toBe('medium');
    });

    it('does not flag when bullmq is in dependencies', () => {
      const procedures = Array.from({ length: 25 }, (_, i) => ({
        name: `doOp${i}`,
        kind: 'mutation' as const,
        file: 'src/routers/ops.ts',
        line: i + 1,
      }));

      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: { routes: [], procedures, exports: [] },
        dependencies: {
          internal: [],
          external: [{ name: 'bullmq', version: '^5.0.0', dev: false }],
        },
      });

      const findings = findBottlenecks([manifest]);
      const queueFindings = findings.filter(f => f.kind === 'no-queue');
      expect(queueFindings).toHaveLength(0);
    });

    it('does not flag repo with fewer than 20 mutation procedures', () => {
      const manifest = makeManifest({
        repoId: 'backend',
        apiSurface: {
          routes: [],
          procedures: [
            { name: 'createUser', kind: 'mutation', file: 'src/routers/user.ts', line: 1 },
            { name: 'updateUser', kind: 'mutation', file: 'src/routers/user.ts', line: 10 },
          ],
          exports: [],
        },
      });

      const findings = findBottlenecks([manifest]);
      const queueFindings = findings.filter(f => f.kind === 'no-queue');
      expect(queueFindings).toHaveLength(0);
    });
  });
```

**Step 2: Run to confirm failures**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|no-rate-limiting|no-queue"
```

**Step 3: Update `engine/evolution/bottleneck-finder.ts`**

Update the `BottleneckFinding` type union:

```typescript
// Replace:
export interface BottleneckFinding {
  kind: 'missing-pagination' | 'unbounded-query' | 'no-caching' | 'sync-in-async';

// With:
export interface BottleneckFinding {
  kind: 'missing-pagination' | 'unbounded-query' | 'no-caching' | 'sync-in-async' | 'no-rate-limiting' | 'no-queue';
```

Fix `detectMissingRateLimiting` to use correct kind and also check procedures:

```typescript
// Replace the entire detectMissingRateLimiting function:
function detectMissingRateLimiting(manifest: RepoManifest): BottleneckFinding[] {
  const findings: BottleneckFinding[] = [];

  if (hasRateLimiting(manifest)) return [];

  const mutationRoutes = manifest.apiSurface.routes.filter(r => {
    const method = r.method.toUpperCase();
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  });

  const mutationProcs = manifest.apiSurface.procedures.filter(p => p.kind === 'mutation');

  const hasMutations = mutationRoutes.length > 0 || mutationProcs.length > 0;
  if (!hasMutations) return [];

  const firstMutation = mutationRoutes[0] ?? mutationProcs[0];
  const totalMutations = mutationRoutes.length + mutationProcs.length;

  findings.push({
    kind: 'no-rate-limiting',
    description: `${totalMutations} mutation operation(s) found but no rate-limiting middleware detected`,
    repo: manifest.repoId,
    file: firstMutation.file,
    line: firstMutation.line,
    severity: 'high',
  });

  return findings;
}
```

Add new `detectNoQueue` function before the `// ─── Main Entry Point ───` comment:

```typescript
const QUEUE_PACKAGES = ['bullmq', 'bull', 'bee-queue', 'agenda', 'node-schedule', 'pg-boss', 'amqplib', 'kafkajs'];
const QUEUE_THRESHOLD = 20; // mutation procedure count above which a queue becomes recommended

function detectNoQueue(manifest: RepoManifest): BottleneckFinding[] {
  const hasQueue = manifest.dependencies.external.some(d =>
    QUEUE_PACKAGES.some(pkg => d.name.toLowerCase().includes(pkg))
  );
  if (hasQueue) return [];

  const mutationProcs = manifest.apiSurface.procedures.filter(p => p.kind === 'mutation');
  if (mutationProcs.length <= QUEUE_THRESHOLD) return [];

  return [{
    kind: 'no-queue',
    description: `${mutationProcs.length} mutation procedures with no background queue — consider offloading heavy operations to a job queue`,
    repo: manifest.repoId,
    file: mutationProcs[0].file,
    line: mutationProcs[0].line,
    severity: 'medium',
  }];
}
```

Add `detectNoQueue` to the `findBottlenecks` main function:

```typescript
// Replace:
    findings.push(
      ...detectMissingPagination(manifest),
      ...detectNoCaching(manifest),
      ...detectMissingRateLimiting(manifest),
    );

// With:
    findings.push(
      ...detectMissingPagination(manifest),
      ...detectNoCaching(manifest),
      ...detectMissingRateLimiting(manifest),
      ...detectNoQueue(manifest),
    );
```

Also update the existing test that checks `f.kind === 'sync-in-async'` or `'unbounded-query'` for rate limiting — locate in test file and update to `'no-rate-limiting'`:

In `tests/evolution/bottleneck-finder.test.ts`, find:
```typescript
      const rateLimitFindings = findings.filter(f => f.kind === 'sync-in-async');
```
Replace with:
```typescript
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
```

Also find the other check:
```typescript
      const rateLimitFindings = findings.filter(f =>
        f.kind === 'unbounded-query' && f.description.toLowerCase().includes('rate')
      );
```
Replace with:
```typescript
      const rateLimitFindings = findings.filter(f => f.kind === 'no-rate-limiting');
```

**Step 4: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 5: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/evolution/bottleneck-finder.ts tests/evolution/bottleneck-finder.test.ts && git commit -m "fix: use correct no-rate-limiting kind, extend to procedures, add no-queue detector"
```

---

## Task 9: Add GraphQL schema/resolver extraction

**Files:**
- Modify: `package.json` (add `tree-sitter-graphql`)
- Modify: `engine/scanner/tree-sitter.ts` (register graphql parser)
- Modify: `engine/scanner/api-extractor.ts` (add `extractGraphQLOperations`)
- Modify: `engine/scanner/index.ts` (call GraphQL extractor for `.graphql`/`.gql` files — add those extensions)
- Test: `tests/scanner/api-extractor.test.ts` (append GraphQL tests)

**Step 1: Install tree-sitter-graphql**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm install tree-sitter-graphql 2>&1 | tail -5
```

Verify:
```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm list tree-sitter-graphql
```

**Step 2: Write failing tests** (append to `tests/scanner/api-extractor.test.ts`):

```typescript
describe('extractGraphQLOperations', () => {
  it('extracts query operations from GraphQL SDL', () => {
    const source = `
type Query {
  getUser(id: ID!): User
  listUsers(limit: Int, offset: Int): [User!]!
}

type Mutation {
  createUser(name: String!, email: String!): User
  deleteUser(id: ID!): Boolean
}

type User {
  id: ID!
  name: String!
  email: String!
}
`;
    const procs = extractGraphQLOperations(source, 'src/schema.graphql', 'graphql');

    const queries = procs.filter(p => p.kind === 'query');
    const mutations = procs.filter(p => p.kind === 'mutation');

    expect(queries.length).toBe(2);
    expect(mutations.length).toBe(2);
    expect(queries.map(q => q.name)).toContain('getUser');
    expect(queries.map(q => q.name)).toContain('listUsers');
    expect(mutations.map(m => m.name)).toContain('createUser');
  });

  it('extracts subscription operations', () => {
    const source = `
type Subscription {
  messageReceived(roomId: ID!): Message
}
type Message { id: ID! }
`;
    const procs = extractGraphQLOperations(source, 'src/schema.graphql', 'graphql');
    const subs = procs.filter(p => p.kind === 'subscription');
    expect(subs.length).toBe(1);
    expect(subs[0].name).toBe('messageReceived');
  });

  it('returns empty array for non-GraphQL language', () => {
    const procs = extractGraphQLOperations('type Foo {}', 'src/types.ts', 'typescript');
    expect(procs).toHaveLength(0);
  });
});
```

**Step 3: Register graphql in `engine/scanner/tree-sitter.ts`**

Find the `LANGUAGE_MAP` object and add:

```typescript
  // Add inside LANGUAGE_MAP after 'java':
  graphql: () => require('tree-sitter-graphql'),
```

Find `EXTENSION_MAP` and add:

```typescript
  // Add:
  '.graphql': 'graphql',
  '.gql': 'graphql',
```

Find `getSupportedLanguages` return type (it should auto-include from the map). No change needed if derived from map keys.

**Step 4: Add `extractGraphQLOperations` to `engine/scanner/api-extractor.ts`**

Add before the final export (at the end of the file):

```typescript
// ─── GraphQL Operations ──────────────────────────────────────────────────────

/**
 * Extract Query, Mutation, and Subscription fields from a GraphQL SDL schema.
 * Maps them to ProcedureDef with kind = 'query' | 'mutation' | 'subscription'.
 *
 * Uses regex-based extraction (no separate GraphQL AST walker needed) for
 * maximum compatibility across tree-sitter-graphql versions.
 */
export function extractGraphQLOperations(
  source: string,
  file: string,
  language: string,
): ProcedureDef[] {
  if (language !== 'graphql') return [];

  const results: ProcedureDef[] = [];
  const lines = source.split('\n');

  // State machine: track which root type we're inside
  type RootType = 'query' | 'mutation' | 'subscription' | null;
  let currentType: RootType = null;
  let braceDepth = 0;
  let typeStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect root type declarations: "type Query {" / "type Mutation {" / "type Subscription {"
    const typeMatch = trimmed.match(/^type\s+(Query|Mutation|Subscription)\s*\{?/i);
    if (typeMatch) {
      const typeName = typeMatch[1].toLowerCase() as RootType;
      currentType = typeName === 'query' ? 'query' : typeName === 'mutation' ? 'mutation' : 'subscription';
      typeStartLine = i + 1;
      braceDepth = trimmed.endsWith('{') ? 1 : 0;
      continue;
    }

    if (currentType === null) continue;

    // Track brace depth
    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;
    braceDepth += opens - closes;

    if (braceDepth <= 0) {
      currentType = null;
      continue;
    }

    // At depth 1 inside the root type, extract field names
    if (braceDepth === 1 && trimmed && !trimmed.startsWith('#')) {
      // Match: fieldName(args): ReturnType or fieldName: ReturnType
      const fieldMatch = trimmed.match(/^(\w+)\s*(?:\([^)]*\))?\s*:/);
      if (fieldMatch) {
        results.push({
          name: fieldMatch[1],
          kind: currentType,
          file,
          line: i + 1,
        });
      }
    }
  }

  return results;
}
```

**Step 5: Run tests**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1 | tail -5
```

**Step 6: Run lint**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint 2>&1 | tail -5
```

**Step 7: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add engine/scanner/tree-sitter.ts engine/scanner/api-extractor.ts package.json package-lock.json tests/scanner/api-extractor.test.ts && git commit -m "feat: add GraphQL schema/resolver extraction via extractGraphQLOperations"
```

---

## Task 10: Add CI/CD GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Check if `.github` directory exists**

```bash
ls /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/.github 2>&1
```

**Step 2: Create workflow file**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  push:
    branches: [main, 'feat/**', 'fix/**', 'chore/**']
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint, Test & Build
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: ['20', '22']

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check (tsc --noEmit)
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

**Step 3: Verify the workflow syntax is valid**

```bash
cat /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0/.github/workflows/ci.yml
```

**Step 4: Run the full test suite one final time to confirm everything passes**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test 2>&1
```

Expected: all tests pass, no failures.

**Step 5: Run lint**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run lint 2>&1
```

Expected: no errors.

**Step 6: Build**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm run build 2>&1 | tail -10
```

Expected: clean build, no errors.

**Step 7: Commit**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && git add .github/workflows/ci.yml && git commit -m "ci: add GitHub Actions workflow for lint, test, build on Node 20 and 22"
```

---

## Final Verification

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0 && npm test && npm run lint && npm run build && echo "ALL CLEAR"
```

Expected output ends with: `ALL CLEAR`

## Commit Summary

After all 10 tasks, the git log should show:

```
fix: cross-repo implementation-change severity is warning not breaking
fix: framework-aware benchmark detection for Hono, Fastify, consola
feat: implement over-abstraction detector in slop-detector
chore: upgrade tree-sitter-swift to latest
feat: add focus mode to token pruner to protect specific context sections
feat: track type inheritance in TypeDef.extends field
feat: wire incremental file-level and manifest-level cache into scanner
fix: use correct no-rate-limiting kind, extend to procedures, add no-queue detector
feat: add GraphQL schema/resolver extraction via extractGraphQLOperations
ci: add GitHub Actions workflow for lint, test, build on Node 20 and 22
```
