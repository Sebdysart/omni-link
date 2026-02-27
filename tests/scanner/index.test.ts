import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanRepo } from '../../engine/scanner/index.js';
import type { RepoConfig, RepoManifest } from '../../engine/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('scanRepo orchestrator', () => {
  let tmpDir: string;
  let config: RepoConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-link-scanner-'));

    // Initialize a git repo with some commits
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });

    // Create a few TypeScript source files
    fs.mkdirSync(path.join(tmpDir, 'src', 'services'), { recursive: true });

    // File 1: exports a function and an interface
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'services', 'user-service.ts'),
      `export interface UserInput {
  name: string;
  email: string;
}

export function createUser(input: UserInput): void {
  // implementation
}

export const USER_LIMIT = 100;
`,
    );

    // File 2: exports a type and a route
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'router.ts'),
      `import { Hono } from 'hono';

export type ApiResponse = {
  success: boolean;
  data?: unknown;
};

const app = new Hono();
app.get('/api/users', (c) => c.json({ users: [] }));
app.post('/api/users', (c) => c.json({ created: true }));

export default app;
`,
    );

    // File 3: a types file with a zod schema
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'schemas.ts'),
      `import { z } from 'zod';

export const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().optional(),
});

export type User = z.infer<typeof userSchema>;
`,
    );

    // Add a package.json for dependency extraction
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-repo',
        dependencies: { hono: '^4.0.0', zod: '^3.22.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
    );

    // Commit everything
    execSync('git add -A', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

    config = {
      name: 'test-repo',
      path: tmpDir,
      language: 'typescript',
      role: 'backend',
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a complete RepoManifest with correct structure', () => {
    const manifest = scanRepo(config);

    // Basic identity
    expect(manifest.repoId).toBe('test-repo');
    expect(manifest.path).toBe(tmpDir);
    expect(manifest.language).toBe('typescript');
  });

  it('extracts git state correctly', () => {
    const manifest = scanRepo(config);

    expect(manifest.gitState.branch).toBeTruthy();
    expect(manifest.gitState.headSha).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.gitState.uncommittedChanges).toEqual([]);
    expect(manifest.gitState.recentCommits.length).toBeGreaterThanOrEqual(1);
    expect(manifest.gitState.recentCommits[0].message).toBe('initial commit');
  });

  it('detects uncommitted changes', () => {
    // Modify a file without committing
    fs.writeFileSync(path.join(tmpDir, 'src', 'schemas.ts'), '// modified\n');

    const manifest = scanRepo(config);
    expect(manifest.gitState.uncommittedChanges.length).toBeGreaterThan(0);
  });

  it('extracts exports from all files', () => {
    const manifest = scanRepo(config);
    const exportNames = manifest.apiSurface.exports.map((e) => e.name);

    // From user-service.ts
    expect(exportNames).toContain('UserInput');
    expect(exportNames).toContain('createUser');
    expect(exportNames).toContain('USER_LIMIT');

    // From router.ts
    expect(exportNames).toContain('ApiResponse');
  });

  it('extracts routes', () => {
    const manifest = scanRepo(config);

    expect(manifest.apiSurface.routes.length).toBeGreaterThanOrEqual(2);
    const paths = manifest.apiSurface.routes.map((r) => r.path);
    expect(paths).toContain('/api/users');
  });

  it('extracts types and schemas', () => {
    const manifest = scanRepo(config);

    // Types (interfaces + type aliases)
    const typeNames = manifest.typeRegistry.types.map((t) => t.name);
    expect(typeNames).toContain('UserInput');
    expect(typeNames).toContain('ApiResponse');

    // Schemas (zod)
    const schemaNames = manifest.typeRegistry.schemas.map((s) => s.name);
    expect(schemaNames).toContain('userSchema');
  });

  it('extracts external dependencies from package.json', () => {
    const manifest = scanRepo(config);

    const depNames = manifest.dependencies.external.map((d) => d.name);
    expect(depNames).toContain('hono');
    expect(depNames).toContain('zod');
    expect(depNames).toContain('vitest');

    const vitest = manifest.dependencies.external.find((d) => d.name === 'vitest');
    expect(vitest?.dev).toBe(true);

    const hono = manifest.dependencies.external.find((d) => d.name === 'hono');
    expect(hono?.dev).toBe(false);
  });

  it('detects conventions', () => {
    const manifest = scanRepo(config);

    expect(manifest.conventions.naming).toBeTruthy();
    expect(manifest.conventions.fileOrganization).toBeTruthy();
    expect(manifest.conventions.patterns).toBeInstanceOf(Array);
    expect(typeof manifest.conventions.testingPatterns).toBe('string');
  });

  it('initializes health with defaults', () => {
    const manifest = scanRepo(config);

    expect(manifest.health).toBeDefined();
    expect(manifest.health.testCoverage).toBeNull();
    expect(manifest.health.lintErrors).toBe(0);
    expect(manifest.health.typeErrors).toBe(0);
  });

  it('skips node_modules and .git directories', () => {
    // Create a file inside node_modules that would be picked up otherwise
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'node_modules', 'some-pkg', 'index.ts'),
      'export const shouldNotAppear = true;',
    );

    const manifest = scanRepo(config);
    const allFiles = manifest.apiSurface.exports.map((e) => e.file);
    const hasNodeModules = allFiles.some((f) => f.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });
});
