import { describe, it, expect } from 'vitest';
import { checkReferences } from '../../engine/quality/reference-checker.js';
import type { RepoManifest } from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkReferences', () => {
  describe('import path validation', () => {
    it('passes when import path resolves to a known file', () => {
      const code = `import { UserService } from './services/user-service.js';

export function getUser() {
  return UserService.find();
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [],
          exports: [
            {
              name: 'UserService',
              kind: 'class',
              signature: 'class UserService',
              file: 'src/services/user-service.ts',
              line: 1,
            },
          ],
        },
        dependencies: {
          internal: [
            {
              from: 'src/index.ts',
              to: 'src/services/user-service.ts',
              imports: ['UserService'],
            },
          ],
          external: [],
        },
      });

      const result = checkReferences(code, 'src/index.ts', manifest);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects import from a non-existent file', () => {
      const code = `import { FooService } from './services/foo-service.js';

export function doFoo() {
  return FooService.run();
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [],
          exports: [
            {
              name: 'UserService',
              kind: 'class',
              signature: 'class UserService',
              file: 'src/services/user-service.ts',
              line: 1,
            },
          ],
        },
        dependencies: {
          internal: [],
          external: [],
        },
      });

      const result = checkReferences(code, 'src/index.ts', manifest);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      const fileViolation = result.violations.find(v => v.kind === 'missing-file');
      expect(fileViolation).toBeDefined();
      expect(fileViolation!.message).toContain('foo-service');
      expect(fileViolation!.line).toBe(1);
    });
  });

  describe('export name validation', () => {
    it('detects import of non-existent export from a known file', () => {
      const code = `import { NonExistentThing } from './services/user-service.js';

export function run() {
  return NonExistentThing.go();
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [],
          exports: [
            {
              name: 'UserService',
              kind: 'class',
              signature: 'class UserService',
              file: 'src/services/user-service.ts',
              line: 1,
            },
          ],
        },
        dependencies: {
          internal: [
            {
              from: 'src/other.ts',
              to: 'src/services/user-service.ts',
              imports: ['UserService'],
            },
          ],
          external: [],
        },
      });

      const result = checkReferences(code, 'src/index.ts', manifest);
      expect(result.valid).toBe(false);

      const exportViolation = result.violations.find(v => v.kind === 'missing-export');
      expect(exportViolation).toBeDefined();
      expect(exportViolation!.message).toContain('NonExistentThing');
    });

    it('passes when imported name exists in the file exports', () => {
      const code = `import { UserService } from './services/user-service.js';`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [],
          exports: [
            {
              name: 'UserService',
              kind: 'class',
              signature: 'class UserService',
              file: 'src/services/user-service.ts',
              line: 1,
            },
          ],
        },
        dependencies: {
          internal: [
            {
              from: 'src/handler.ts',
              to: 'src/services/user-service.ts',
              imports: ['UserService'],
            },
          ],
          external: [],
        },
      });

      const result = checkReferences(code, 'src/handler.ts', manifest);
      expect(result.valid).toBe(true);
    });
  });

  describe('route validation', () => {
    it('detects fetch/axios call to unknown route', () => {
      const code = `import axios from 'axios';

export async function fetchData() {
  const res = await axios.get('/api/v1/nonexistent');
  return res.data;
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [
            {
              method: 'GET',
              path: '/api/v1/users',
              handler: 'getUsers',
              file: 'src/routes/users.ts',
              line: 10,
            },
          ],
          procedures: [],
          exports: [],
        },
        dependencies: {
          internal: [],
          external: [{ name: 'axios', version: '^1.0.0', dev: false }],
        },
      });

      const result = checkReferences(code, 'src/client.ts', manifest);
      expect(result.valid).toBe(false);

      const routeViolation = result.violations.find(v => v.kind === 'unknown-route');
      expect(routeViolation).toBeDefined();
      expect(routeViolation!.message).toContain('/api/v1/nonexistent');
    });

    it('passes when fetch call matches a known route', () => {
      const code = `export async function fetchUsers() {
  const res = await fetch('/api/v1/users');
  return res.json();
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [
            {
              method: 'GET',
              path: '/api/v1/users',
              handler: 'getUsers',
              file: 'src/routes/users.ts',
              line: 10,
            },
          ],
          procedures: [],
          exports: [],
        },
      });

      const result = checkReferences(code, 'src/client.ts', manifest);
      const routeViolations = result.violations.filter(v => v.kind === 'unknown-route');
      expect(routeViolations).toHaveLength(0);
    });
  });

  describe('procedure validation', () => {
    it('detects call to unknown tRPC procedure', () => {
      const code = `export async function loadData(trpc: any) {
  const result = await trpc.nonExistentProcedure.query();
  return result;
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [
            {
              name: 'getUser',
              kind: 'query',
              file: 'src/routers/user.ts',
              line: 15,
            },
          ],
          exports: [],
        },
      });

      const result = checkReferences(code, 'src/client.ts', manifest);
      expect(result.valid).toBe(false);

      const procViolation = result.violations.find(v => v.kind === 'unknown-procedure');
      expect(procViolation).toBeDefined();
      expect(procViolation!.message).toContain('nonExistentProcedure');
    });

    it('passes when procedure name matches a known procedure', () => {
      const code = `export async function loadUser(trpc: any) {
  const result = await trpc.getUser.query();
  return result;
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [
            {
              name: 'getUser',
              kind: 'query',
              file: 'src/routers/user.ts',
              line: 15,
            },
          ],
          exports: [],
        },
      });

      const result = checkReferences(code, 'src/client.ts', manifest);
      const procViolations = result.violations.filter(v => v.kind === 'unknown-procedure');
      expect(procViolations).toHaveLength(0);
    });
  });

  describe('external package imports', () => {
    it('does not flag known external packages', () => {
      const code = `import express from 'express';
import { z } from 'zod';`;

      const manifest = makeManifest({
        dependencies: {
          internal: [],
          external: [
            { name: 'express', version: '^4.18.0', dev: false },
            { name: 'zod', version: '^3.0.0', dev: false },
          ],
        },
      });

      const result = checkReferences(code, 'src/app.ts', manifest);
      expect(result.valid).toBe(true);
    });

    it('does not flag Node.js built-in modules', () => {
      const code = `import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'node:http';`;

      const manifest = makeManifest();

      const result = checkReferences(code, 'src/utils.ts', manifest);
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles code with no imports gracefully', () => {
      const code = `export function add(a: number, b: number) {
  return a + b;
}`;

      const manifest = makeManifest();

      const result = checkReferences(code, 'src/math.ts', manifest);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('handles type-only imports', () => {
      const code = `import type { User } from './models/user.js';

export function greet(user: User): string {
  return \`Hello \${user.name}\`;
}`;

      const manifest = makeManifest({
        apiSurface: {
          routes: [],
          procedures: [],
          exports: [
            {
              name: 'User',
              kind: 'interface',
              signature: 'interface User',
              file: 'src/models/user.ts',
              line: 1,
            },
          ],
        },
        dependencies: {
          internal: [
            {
              from: 'src/greet.ts',
              to: 'src/models/user.ts',
              imports: ['User'],
            },
          ],
          external: [],
        },
      });

      const result = checkReferences(code, 'src/greet.ts', manifest);
      expect(result.valid).toBe(true);
    });
  });
});
