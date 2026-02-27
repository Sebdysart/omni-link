import { describe, it, expect } from 'vitest';
import { checkRules, BUILT_IN_RULES } from '../../engine/quality/rule-engine.js';

describe('checkRules', () => {
  it('returns no violations for clean code', () => {
    const code = `
      const response = await fetch('/api/users').catch(err => { throw err; });
      const value = process.env.API_KEY ?? 'default';
    `;
    const result = checkRules(code, 'src/app.ts');
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('flags fetch() without error handling', () => {
    const code = `const data = await fetch('/api/users');\nconsole.log(data);`;
    const result = checkRules(code, 'src/app.ts');
    const violation = result.violations.find(v => v.ruleId === 'no-fetch-without-catch');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
  });

  it('flags process.env access without fallback', () => {
    const code = `const key = process.env.SECRET_KEY;\nconsole.log(key);`;
    const result = checkRules(code, 'src/config.ts');
    const violation = result.violations.find(v => v.ruleId === 'no-raw-env-access');
    expect(violation).toBeDefined();
  });

  it('flags TypeScript as any cast in non-test files', () => {
    const code = `const x = response as any;\nx.doSomething();`;
    const result = checkRules(code, 'src/service.ts');
    const violation = result.violations.find(v => v.ruleId === 'no-any-cast');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
  });

  it('does NOT flag as any in test files', () => {
    const code = `const x = response as any;\nx.doSomething();`;
    const result = checkRules(code, 'tests/service.test.ts');
    const violation = result.violations.find(v => v.ruleId === 'no-any-cast');
    expect(violation).toBeUndefined();
  });

  it('flags hardcoded secret patterns', () => {
    const code = `const apiKey = 'sk-1234567890abcdef1234567890abcdef';`;
    const result = checkRules(code, 'src/config.ts');
    const violation = result.violations.find(v => v.ruleId === 'no-hardcoded-secret');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
  });

  it('exports BUILT_IN_RULES as an array with at least 4 rules', () => {
    expect(Array.isArray(BUILT_IN_RULES)).toBe(true);
    expect(BUILT_IN_RULES.length).toBeGreaterThanOrEqual(4);
    for (const rule of BUILT_IN_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(['error', 'warning']).toContain(rule.severity);
    }
  });
});
