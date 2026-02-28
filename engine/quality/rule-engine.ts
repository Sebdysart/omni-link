// engine/quality/rule-engine.ts — Neurosymbolic hard rules for code generation safety

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HardRule {
  id: string;
  description: string;
  severity: 'error' | 'warning';
  check: (code: string, file: string) => RuleViolation[];
}

export interface RuleViolation {
  ruleId: string;
  description: string;
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface RuleCheckResult {
  passed: boolean;
  violations: RuleViolation[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[tj]s$/.test(file) || file.includes('/tests/') || file.includes('/__tests__/');
}

// ─── Built-in Rules ──────────────────────────────────────────────────────────

const noFetchWithoutCatch: HardRule = {
  id: 'no-fetch-without-catch',
  description: 'fetch() calls must be wrapped in try-catch or have a .catch() handler',
  severity: 'error',
  check(code, _file) {
    const violations: RuleViolation[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines where fetch( appears only inside a string literal or comment
      if (!/\bfetch\s*\(/.test(line)) continue;
      // Additional guard: skip if the whole line is a comment
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;

      // Check if this line or surrounding 5 lines contain .catch( or are inside try {
      const window = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
      const hasCatch = window.includes('.catch(') || window.includes('try {') || window.includes('try{');
      if (!hasCatch) {
        violations.push({
          ruleId: 'no-fetch-without-catch',
          description: 'fetch() without error handling',
          line: i + 1,
          severity: 'error',
          message: `fetch() on line ${i + 1} has no .catch() handler or surrounding try-catch. Network calls must handle errors.`,
        });
      }
    }

    return violations;
  },
};

const noRawEnvAccess: HardRule = {
  id: 'no-raw-env-access',
  description: 'process.env.X must use a nullish fallback (?? or ||) or early validation',
  severity: 'warning',
  check(code, _file) {
    const violations: RuleViolation[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match process.env.SOMETHING without ?? or || on the same line
      if (
        /process\.env\.\w+/.test(line) &&
        !/process\.env\.\w+\s*[\?\|]{1,2}/.test(line) &&
        !/process\.env\.\w+\s*[!=]{2,3}/.test(line) &&
        !/typeof\s+process\.env/.test(line)
      ) {
        violations.push({
          ruleId: 'no-raw-env-access',
          description: 'process.env access without fallback',
          line: i + 1,
          severity: 'warning',
          message: `process.env access on line ${i + 1} has no nullish fallback (??) — will be undefined if env var is missing.`,
        });
      }
    }

    return violations;
  },
};

const noAnyCast: HardRule = {
  id: 'no-any-cast',
  description: 'TypeScript `as any` casts are banned in production code',
  severity: 'warning',
  check(code, file) {
    if (isTestFile(file)) return [];

    const violations: RuleViolation[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (/\bas\s+any\b/.test(lines[i])) {
        violations.push({
          ruleId: 'no-any-cast',
          description: '`as any` cast in production code',
          line: i + 1,
          severity: 'warning',
          message: `\`as any\` cast on line ${i + 1} — use a proper type assertion or type guard instead.`,
        });
      }
    }

    return violations;
  },
};

const noHardcodedSecret: HardRule = {
  id: 'no-hardcoded-secret',
  description: 'Hardcoded secrets (API keys, tokens, passwords) detected',
  severity: 'error',
  check(code, file) {
    if (isTestFile(file)) return [];

    const violations: RuleViolation[] = [];
    const lines = code.split('\n');

    // Patterns: variable assignments with long string values that look like secrets
    const SECRET_PATTERNS = [
      // Long alphanumeric strings assigned to key/secret/token/password variables
      /(?:api[_-]?key|secret|token|password|auth[_-]?key)\s*[=:]\s*['"][a-zA-Z0-9+/=_\-]{20,}['"]/i,
      // Common secret prefixes (OpenAI sk-, Stripe sk_live_/sk_test_/pk_, AWS, GitHub, GitLab, etc.)
      /['"](?:sk[-_]|pk_|rk_|AKIA|ghp_|gho_|ghu_|ghs_|glpat-)[a-zA-Z0-9_]{10,}['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            ruleId: 'no-hardcoded-secret',
            description: 'Hardcoded secret value detected',
            line: i + 1,
            severity: 'error',
            message: `Possible hardcoded secret on line ${i + 1} — use environment variables or a secrets manager instead.`,
          });
          break;
        }
      }
    }

    return violations;
  },
};

// ─── Exported Rules & Checker ─────────────────────────────────────────────────

export const BUILT_IN_RULES: HardRule[] = [
  noFetchWithoutCatch,
  noRawEnvAccess,
  noAnyCast,
  noHardcodedSecret,
];

/**
 * Run all hard rules against the provided code.
 * Returns a RuleCheckResult with all violations found.
 *
 * `passed` is false only when there is at least one `error`-severity violation.
 * Warning-severity violations are included in `violations` but do not affect `passed`.
 */
export function checkRules(
  code: string,
  file: string,
  rules: HardRule[] = BUILT_IN_RULES,
): RuleCheckResult {
  if (!code.trim()) return { passed: true, violations: [] };

  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    violations.push(...rule.check(code, file));
  }

  const hasError = violations.some(v => v.severity === 'error');

  return {
    passed: !hasError,
    violations,
  };
}
