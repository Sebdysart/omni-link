import { describe, it, expect } from 'vitest';
import { detectSlop } from '../../engine/quality/slop-detector.js';
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

describe('detectSlop', () => {
  describe('placeholder detection', () => {
    it('detects TODO comments', () => {
      const code = `export function processPayment(amount: number) {
  // TODO: implement payment processing
  return false;
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(false);

      const placeholders = result.issues.filter(i => i.kind === 'placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
      expect(placeholders[0].line).toBe(2);
      expect(placeholders[0].severity).toBe('error');
    });

    it('detects FIXME comments', () => {
      const code = `export function getUser() {
  // FIXME: this is broken
  return null;
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(false);

      const placeholders = result.issues.filter(i => i.kind === 'placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it('detects "not implemented" throw', () => {
      const code = `export function calculate() {
  throw new Error("not implemented");
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(false);

      const placeholders = result.issues.filter(i => i.kind === 'placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it('detects console.log placeholder', () => {
      const code = `export function doWork() {
  console.log("implement this");
  return undefined;
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(false);

      const placeholders = result.issues.filter(i => i.kind === 'placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
    });
  });

  describe('phantom import detection', () => {
    it('detects imports from packages not in dependencies', () => {
      const code = `import { magicFunction } from 'phantom-package';

export function run() {
  return magicFunction();
}`;

      const manifest = makeManifest({
        dependencies: {
          internal: [],
          external: [
            { name: 'express', version: '^4.18.0', dev: false },
          ],
        },
      });

      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(false);

      const phantoms = result.issues.filter(i => i.kind === 'phantom-import');
      expect(phantoms.length).toBeGreaterThan(0);
      expect(phantoms[0].message).toContain('phantom-package');
      expect(phantoms[0].severity).toBe('error');
    });

    it('does not flag known dependencies', () => {
      const code = `import express from 'express';
import { z } from 'zod';

const app = express();`;

      const manifest = makeManifest({
        dependencies: {
          internal: [],
          external: [
            { name: 'express', version: '^4.18.0', dev: false },
            { name: 'zod', version: '^3.0.0', dev: false },
          ],
        },
      });

      const result = detectSlop(code, manifest);
      const phantoms = result.issues.filter(i => i.kind === 'phantom-import');
      expect(phantoms).toHaveLength(0);
    });

    it('does not flag Node.js built-in modules', () => {
      const code = `import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      const phantoms = result.issues.filter(i => i.kind === 'phantom-import');
      expect(phantoms).toHaveLength(0);
    });

    it('does not flag relative imports', () => {
      const code = `import { helper } from './utils/helper.js';
import { config } from '../config.js';`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      const phantoms = result.issues.filter(i => i.kind === 'phantom-import');
      expect(phantoms).toHaveLength(0);
    });
  });

  describe('duplicate block detection', () => {
    it('detects near-duplicate code blocks (3+ lines repeated)', () => {
      const code = `export function processA() {
  const data = fetchData();
  const result = transform(data);
  return validate(result);
}

export function processB() {
  const data = fetchData();
  const result = transform(data);
  return validate(result);
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const duplicates = result.issues.filter(i => i.kind === 'duplicate-block');
      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].severity).toBe('warning');
    });

    it('does not flag non-duplicate code', () => {
      const code = `export function add(a: number, b: number) {
  return a + b;
}

export function subtract(a: number, b: number) {
  return a - b;
}

export function multiply(a: number, b: number) {
  return a * b;
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const duplicates = result.issues.filter(i => i.kind === 'duplicate-block');
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('over-commenting detection', () => {
    it('flags file with comment-to-code ratio > 0.5', () => {
      const code = `// This function adds two numbers
// It takes two parameters
// a: the first number
// b: the second number
// Returns the sum
export function add(a: number, b: number) {
  // Add them together
  // Return the result
  return a + b;
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overCommented = result.issues.filter(i => i.kind === 'over-commenting');
      expect(overCommented.length).toBeGreaterThan(0);
      expect(overCommented[0].severity).toBe('warning');
    });

    it('does not flag normally commented code', () => {
      const code = `// UserService handles user operations
export class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getUser(id: string) {
    return this.db.query('SELECT * FROM users WHERE id = $1', [id]);
  }

  async createUser(name: string, email: string) {
    return this.db.query('INSERT INTO users (name, email) VALUES ($1, $2)', [name, email]);
  }
}`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);

      const overCommented = result.issues.filter(i => i.kind === 'over-commenting');
      expect(overCommented).toHaveLength(0);
    });
  });

  describe('clean code', () => {
    it('returns clean for well-written code', () => {
      const code = `import express from 'express';

export class UserController {
  async getUser(req: express.Request, res: express.Response) {
    try {
      const user = await this.userService.findById(req.params.id);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}`;

      const manifest = makeManifest({
        dependencies: {
          internal: [],
          external: [{ name: 'express', version: '^4.18.0', dev: false }],
        },
      });

      const result = detectSlop(code, manifest);
      expect(result.clean).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('over-abstraction detection', () => {
    const mockManifest = makeManifest();

    it('flags file with 3+ extends relationships as over-abstracted', () => {
      const code = `
        class A extends B {}
        class C extends D {}
        class E extends F {}
      `;
      const result = detectSlop(code, mockManifest);
      expect(result.issues.some(i => i.kind === 'over-abstraction')).toBe(true);
    });

    it('flags when abstract/interface count >= 2x concrete class count', () => {
      const code = `
        abstract class BaseA {}
        abstract class BaseB {}
        interface IFoo {}
        interface IBar {}
        class ConcreteImpl {}
      `;
      const result = detectSlop(code, mockManifest);
      expect(result.issues.some(i => i.kind === 'over-abstraction')).toBe(true);
    });

    it('flags 3+ single-delegation wrapper functions', () => {
      const code = `
        export function doA(x: string) { return service.doA(x); }
        export function doB(x: string) { return service.doB(x); }
        export function doC(x: string) { return service.doC(x); }
      `;
      const result = detectSlop(code, mockManifest);
      expect(result.issues.some(i => i.kind === 'over-abstraction')).toBe(true);
    });

    it('does not flag normal code with few extends', () => {
      const code = `
        class Animal {}
        class Dog extends Animal {}
        function greet(name: string) { return \`Hello \${name}\`; }
      `;
      const result = detectSlop(code, mockManifest);
      expect(result.issues.filter(i => i.kind === 'over-abstraction')).toHaveLength(0);
    });

    it('over-abstraction issue has kind, message, and severity', () => {
      const code = `
        class A extends B {}
        class C extends D {}
        class E extends F {}
      `;
      const result = detectSlop(code, mockManifest);
      const issue = result.issues.find(i => i.kind === 'over-abstraction');
      expect(issue).toBeDefined();
      expect(issue!.message).toBeTruthy();
      expect(issue!.severity).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('handles empty code', () => {
      const manifest = makeManifest();
      const result = detectSlop('', manifest);
      expect(result.clean).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('handles code with only comments', () => {
      const code = `// This file is intentionally left blank
// It serves as a placeholder`;

      const manifest = makeManifest();
      const result = detectSlop(code, manifest);
      // Over-commenting should be detected (all lines are comments)
      const overCommented = result.issues.filter(i => i.kind === 'over-commenting');
      expect(overCommented.length).toBeGreaterThan(0);
    });
  });
});
