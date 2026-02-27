import { describe, it, expect } from 'vitest';
import { validateConventions } from '../../engine/quality/convention-validator.js';
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

describe('validateConventions', () => {
  describe('naming conventions', () => {
    it('flags snake_case variables in a camelCase codebase', () => {
      const code = `export function getUserData() {
  const user_name = "alice";
  const user_age = 30;
  return { user_name, user_age };
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/users.ts', manifest);
      expect(result.valid).toBe(false);

      const namingViolations = result.violations.filter(v => v.kind === 'naming');
      expect(namingViolations.length).toBeGreaterThan(0);
      expect(namingViolations[0].suggestion).toBeTruthy();
    });

    it('passes when variable names match camelCase convention', () => {
      const code = `export function getUserData() {
  const userName = "alice";
  const userAge = 30;
  return { userName, userAge };
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/users.ts', manifest);
      const namingViolations = result.violations.filter(v => v.kind === 'naming');
      expect(namingViolations).toHaveLength(0);
    });

    it('flags camelCase in a snake_case codebase', () => {
      const code = `def get_user():
    userName = "alice"
    userAge = 30
    return userName, userAge`;

      const manifest = makeManifest({
        language: 'python',
        conventions: {
          naming: 'snake_case',
          fileOrganization: 'flat',
          errorHandling: 'exceptions',
          patterns: [],
          testingPatterns: 'separate',
        },
      });

      const result = validateConventions(code, 'src/users.py', manifest);
      expect(result.valid).toBe(false);

      const namingViolations = result.violations.filter(v => v.kind === 'naming');
      expect(namingViolations.length).toBeGreaterThan(0);
    });

    it('allows PascalCase for class and type names in camelCase codebases', () => {
      const code = `export class UserService {
  private userName: string;
  constructor(name: string) {
    this.userName = name;
  }
}

export interface UserData {
  firstName: string;
  lastName: string;
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/user-service.ts', manifest);
      const namingViolations = result.violations.filter(v => v.kind === 'naming');
      expect(namingViolations).toHaveLength(0);
    });
  });

  describe('file location conventions', () => {
    it('flags a test file outside the test directory pattern', () => {
      const code = `import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'separate-directory',
        },
      });

      // Test file placed in src/ instead of tests/
      const result = validateConventions(code, 'src/user-service.test.ts', manifest);
      const locationViolations = result.violations.filter(v => v.kind === 'file-location');
      expect(locationViolations.length).toBeGreaterThan(0);
      expect(locationViolations[0].suggestion).toBeTruthy();
    });

    it('passes when test file is in the proper test directory', () => {
      const code = `import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'separate-directory',
        },
      });

      const result = validateConventions(code, 'tests/user-service.test.ts', manifest);
      const locationViolations = result.violations.filter(v => v.kind === 'file-location');
      expect(locationViolations).toHaveLength(0);
    });

    it('flags route handler in wrong directory', () => {
      const code = `import { Hono } from 'hono';
const app = new Hono();
app.get('/users', (c) => c.json([]));
export default app;`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: ['routes-in-routes/', 'services-in-services/'],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/utils/users-route.ts', manifest);
      const locationViolations = result.violations.filter(v => v.kind === 'file-location');
      expect(locationViolations.length).toBeGreaterThan(0);
    });
  });

  describe('error handling conventions', () => {
    it('flags missing error handling in async function when try-catch is required', () => {
      const code = `export async function fetchUser(id: string) {
  const response = await fetch(\`/api/users/\${id}\`);
  const data = await response.json();
  return data;
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/api-client.ts', manifest);
      const errorViolations = result.violations.filter(v => v.kind === 'error-handling');
      expect(errorViolations.length).toBeGreaterThan(0);
      expect(errorViolations[0].suggestion).toContain('try-catch');
    });

    it('passes when async function has proper try-catch', () => {
      const code = `export async function fetchUser(id: string) {
  try {
    const response = await fetch(\`/api/users/\${id}\`);
    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(\`Failed to fetch user \${id}: \${error}\`);
  }
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/api-client.ts', manifest);
      const errorViolations = result.violations.filter(v => v.kind === 'error-handling');
      expect(errorViolations).toHaveLength(0);
    });

    it('does not flag non-async functions for try-catch', () => {
      const code = `export function add(a: number, b: number) {
  return a + b;
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'feature-based',
          errorHandling: 'try-catch',
          patterns: [],
          testingPatterns: 'co-located',
        },
      });

      const result = validateConventions(code, 'src/math.ts', manifest);
      const errorViolations = result.violations.filter(v => v.kind === 'error-handling');
      expect(errorViolations).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty code', () => {
      const manifest = makeManifest();
      const result = validateConventions('', 'src/empty.ts', manifest);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('handles mixed convention as lenient', () => {
      const code = `export function get_user_data() {
  const userName = "alice";
  return userName;
}`;

      const manifest = makeManifest({
        conventions: {
          naming: 'mixed',
          fileOrganization: 'flat',
          errorHandling: '',
          patterns: [],
          testingPatterns: '',
        },
      });

      const result = validateConventions(code, 'src/utils.ts', manifest);
      const namingViolations = result.violations.filter(v => v.kind === 'naming');
      expect(namingViolations).toHaveLength(0);
    });
  });
});
