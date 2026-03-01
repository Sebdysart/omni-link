# omni-link Max-Tier Anti-Hallucination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bake anti-hallucination safeguards into every layer of omni-link — agent prompts, quality engine, context injection, and slash commands — creating a "max tier" mode that makes hallucinated imports, phantom types, and unverified assertions structurally impossible.

**Architecture:** Four interlocking layers: (1) uncertainty/CoT instructions baked into all agent `.md` files, (2) a new Validator agent + `/verify` command as a critic-agent review loop, (3) a neurosymbolic rule engine that enforces hard rules on generated code, and (4) enriched digest output with actual code quotes so Claude can't hallucinate field names it can see. Each layer is independently testable and degrades gracefully.

**Tech Stack:** TypeScript ESM, Vitest 3, zero new npm packages (all implementations use only Node.js builtins and existing dependencies).

---

### Task 1: Bake Uncertainty + CoT Instructions into All Agent Files

**Files:**
- Modify: `agents/cross-repo-reviewer.md`
- Modify: `agents/evolution-strategist.md`
- Modify: `agents/repo-analyst.md`

**Context:** The three agent `.md` files define the system prompts for specialized sub-agents dispatched by omni-link skills. None of them currently contain uncertainty, chain-of-thought (CoT), or honesty instructions. This task adds a mandatory "Anti-Hallucination Protocol" section to each agent.

**Step 1: Write a test that reads each agent file and asserts the anti-hallucination section exists**

Create `tests/agents/anti-hallucination-prefix.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const AGENT_FILES = [
  'agents/cross-repo-reviewer.md',
  'agents/evolution-strategist.md',
  'agents/repo-analyst.md',
];

const REQUIRED_PHRASES = [
  'ANTI-HALLUCINATION PROTOCOL',
  'cannot confirm',
  'thinking',
  'confidence',
];

describe('Agent anti-hallucination protocol', () => {
  for (const file of AGENT_FILES) {
    it(`${file} contains anti-hallucination protocol`, () => {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const phrase of REQUIRED_PHRASES) {
        expect(content.toLowerCase()).toContain(phrase.toLowerCase());
      }
    });
  }
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/sebastiandysart/.claude/plugins/cache/omni-link-marketplace/omni-link/0.1.0
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: FAIL — the agent files don't have the protocol section yet.

**Step 3: Add the Anti-Hallucination Protocol section to each agent file**

Add the following block as the first section after the frontmatter in ALL THREE agent files (`agents/cross-repo-reviewer.md`, `agents/evolution-strategist.md`, `agents/repo-analyst.md`):

```markdown
## Anti-Hallucination Protocol

These rules are mandatory and override default behavior:

1. **Uncertainty disclosure:** Before asserting any fact about file contents, types, routes, or procedures, state your confidence. Use "I verified in the manifest" for confirmed facts and "I cannot confirm without running /scan" for anything unverified.

2. **Chain-of-Thought verification:** Before presenting code that references an import, type, or API endpoint, use `<thinking>` tags to verify: (a) does this import path exist in the manifest? (b) does this type/function name match exactly what was scanned? (c) is this package in the dependency list?

3. **Honesty over confidence:** Never fabricate a file path, type name, or API route to fill a gap. A clearly stated "I don't know" is better than a hallucinated answer that breaks production code.

4. **Evidence before assertion:** Every cross-repo claim must cite a specific `file:line` reference from the ecosystem digest. If you cannot cite evidence, do not make the claim.
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: PASS — all 3 agent files contain the required phrases.

**Step 5: Commit**

```bash
git add agents/cross-repo-reviewer.md agents/evolution-strategist.md agents/repo-analyst.md tests/agents/anti-hallucination-prefix.test.ts
git commit -m "feat: add anti-hallucination protocol to all agent prompts"
```

---

### Task 2: Create the Validator Agent

**Files:**
- Create: `agents/validator.md`

**Context:** A Validator agent is a dedicated critic sub-agent whose only job is to examine generated code and return a structured PASS/FAIL verdict. It is dispatched by the `/verify` command (Task 3). It has access only to Read, Grep, Glob — it cannot modify files.

**Step 1: Write test that asserts validator.md exists and has required sections**

Add to `tests/agents/anti-hallucination-prefix.test.ts`:

```typescript
it('agents/validator.md exists with required sections', () => {
  const content = readFileSync(resolve(process.cwd(), 'agents/validator.md'), 'utf8');
  expect(content).toContain('PASS');
  expect(content).toContain('FAIL');
  expect(content).toContain('Verdict');
  expect(content).toContain('phantom');
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: FAIL — validator.md does not exist.

**Step 3: Create `agents/validator.md`**

```markdown
---
name: validator
description: Critic agent that examines generated code for hallucinated imports, phantom packages, unverified API calls, and placeholder patterns. Returns a structured PASS/FAIL verdict.
tools:
  - Read
  - Grep
  - Glob
---

# Validator — Code Critic Agent

A read-only critic agent that examines generated code before it is presented to the user. Its only job is to find problems, not fix them. The main agent fixes — the validator approves.

## Anti-Hallucination Protocol

1. **Uncertainty disclosure:** State confidence for every claim. Never guess.
2. **Chain-of-Thought verification:** Use `<thinking>` to trace every import, type, and API call against the codebase before issuing a verdict.
3. **Evidence before assertion:** Every violation must cite the exact line number in the generated code and the reason it is invalid.
4. **Never approve without checking:** A PASS verdict requires positive confirmation of every import and API reference — absence of obvious errors is not sufficient.

## When Dispatched

- By the `/verify` command after code is generated
- By any skill that calls for a critic-agent review pass

## Validation Checklist

For each code block provided, check ALL of the following:

### 1. Import Verification
- [ ] Every `import from '...'` path either starts with `.` (relative) or is a known npm package
- [ ] Every named import (`{ Foo }`) actually exists as an export in that module — verify by reading the file at the import path
- [ ] No package appears in imports that is not in `package.json` dependencies or devDependencies

### 2. API Call Verification
- [ ] Every `fetch('/api/...')` URL exists as a route in the ecosystem digest
- [ ] Every `trpc.X.Y.query()` or `trpc.X.Y.mutate()` procedure name matches the scanned procedure list exactly
- [ ] HTTP methods (GET, POST, PUT, DELETE) match what the route actually accepts

### 3. Type Reference Verification
- [ ] Every type name used in the generated code exists in the ecosystem type registry
- [ ] Field names accessed on objects match the actual fields in the type definition (check `TypeDef.fields`)
- [ ] Optional vs. required fields are handled correctly (no missing `?` or `!`)

### 4. Placeholder Detection
- [ ] No `// TODO`, `// FIXME`, `// HACK`, `// XXX` comments
- [ ] No `throw new Error('not implemented')`
- [ ] No `console.log('implement ...')` or similar placeholder logs
- [ ] No `return null` or `return undefined` in functions that should return data

### 5. Phantom Package Detection
- [ ] Every external package import exists in the project's `package.json`
- [ ] Package names are exact (e.g., `lodash-es` is different from `lodash`)

## Output Format

Return the verdict in this exact format:

```markdown
## Validator Verdict: [PASS / FAIL]

### Checks Run
- [x] Import verification
- [x] API call verification
- [x] Type reference verification
- [x] Placeholder detection
- [x] Phantom package detection

### Violations (if FAIL)

1. **[IMPORT / API / TYPE / PLACEHOLDER / PHANTOM]** Line N: [description]
   - Evidence: [what was found vs. what was expected]
   - Fix required: [specific correction]

### Confidence
[HIGH / MEDIUM / LOW] — [one sentence explaining confidence level and any uncertainty]
```

## Iron Laws

1. **FAIL on any error-severity violation.** A single hallucinated import = FAIL.
2. **PASS only when all checks complete.** Partial verification is not PASS — it is INCONCLUSIVE.
3. **Never modify files.** This agent reads and reports only.
4. **Cite line numbers.** Every violation must include the line number in the generated code.
5. **Express uncertainty.** If you cannot verify an import because the target file is outside the scanned repos, say INCONCLUSIVE with explanation — never guess PASS.
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: PASS — all tests pass including the new validator.md test.

**Step 5: Commit**

```bash
git add agents/validator.md tests/agents/anti-hallucination-prefix.test.ts
git commit -m "feat: add validator critic agent for anti-hallucination review"
```

---

### Task 3: Create the /verify Slash Command

**Files:**
- Create: `commands/verify.md`

**Context:** The `/verify` command lets users explicitly request a validation pass on code Claude just generated. It reads the code from the conversation context, dispatches the Validator agent, and presents the structured PASS/FAIL verdict.

**Step 1: Write test that asserts verify.md exists with required keywords**

Add to `tests/agents/anti-hallucination-prefix.test.ts`:

```typescript
it('commands/verify.md exists and references validator agent', () => {
  const content = readFileSync(resolve(process.cwd(), 'commands/verify.md'), 'utf8');
  expect(content).toContain('validator');
  expect(content).toContain('PASS');
  expect(content).toContain('FAIL');
  expect(content).toContain('/scan');
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: FAIL — verify.md does not exist.

**Step 3: Create `commands/verify.md`**

```markdown
---
name: verify
description: Run the Validator critic agent against the most recently generated code. Returns a structured PASS/FAIL verdict with line-level evidence.
disable-model-invocation: true
---

# /verify — Validator Review Pass

Dispatch the **Validator** critic agent against the most recently generated code block. The Validator checks for hallucinated imports, phantom packages, unverified API calls, type mismatches, and placeholder patterns.

## When to Use

- After any non-trivial code generation (new files, new functions, cross-repo changes)
- When you suspect Claude may have hallucinated an import path or type name
- Before committing code that references cross-repo contracts
- After `/scan` completes and you want to validate pending generated code against the fresh manifest

## Execution

The Validator agent runs automatically after code generation when anti-hallucination mode is active. To trigger manually:

```
/verify
```

This dispatches the `validator` agent with:
- The most recently generated code block as input
- The current ecosystem digest as reference
- Read-only access to scan the actual codebase for verification

## Output

The Validator returns one of three verdicts:

### PASS
All checks passed. Imports verified, API calls confirmed, no placeholders, no phantom packages. Code is safe to present or commit.

### FAIL
One or more error-severity violations found. The specific violations are listed with line numbers and fix instructions. **Do not commit until the main agent fixes all violations and re-runs /verify.**

### INCONCLUSIVE
The Validator could not fully verify one or more references (e.g., files outside the scanned repos, dynamic imports). Treat as FAIL for cross-repo code; treat as advisory for within-repo code.

## After a FAIL

1. The main agent reviews each violation from the Validator
2. The main agent corrects the code
3. `/verify` runs again automatically
4. Repeat until PASS or INCONCLUSIVE

## After INCONCLUSIVE

Run `/scan` to refresh the ecosystem manifest, then run `/verify` again. If still INCONCLUSIVE, investigate the specific unverifiable references manually before proceeding.

## Anti-Hallucination Guarantee

When `/verify` returns PASS, you have a structural guarantee that:
- Every import path resolves to a real file in the scanned codebase
- Every package name is in the project dependency list
- Every API call targets a route that exists in the manifest
- No placeholder code was left in the output

This guarantee is only as fresh as the last `/scan`. If the ecosystem has changed since the last scan, run `/scan` then `/verify`.
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: PASS — all tests pass.

**Step 5: Commit**

```bash
git add commands/verify.md tests/agents/anti-hallucination-prefix.test.ts
git commit -m "feat: add /verify command dispatching validator critic agent"
```

---

### Task 4: Neurosymbolic Rule Engine

**Files:**
- Create: `engine/quality/rule-engine.ts`
- Create: `tests/quality/rule-engine.test.ts`
- Modify: `engine/index.ts` (add `ruleViolations` to `QualityCheckResult`)
- Modify: `engine/quality/slop-detector.ts` (export `SlopIssue` already there, no change needed)

**Context:** A neurosymbolic rule engine expresses hard rules (never use `fetch()` without error handling, never access `process.env.X` without a fallback, never use `as any` in production code) as structured objects. This makes rules auditable, testable, and extensible. The engine returns `RuleViolation[]` and is wired into `qualityCheck()`.

**Step 1: Write failing tests for the rule engine**

Create `tests/quality/rule-engine.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/quality/rule-engine.test.ts
```

Expected: FAIL with "Cannot find module '../../engine/quality/rule-engine.js'"

**Step 3: Create `engine/quality/rule-engine.ts`**

```typescript
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

function findLineNumber(lines: string[], index: number): number {
  return index + 1;
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
      if (!line.includes('fetch(')) continue;

      // Check if this line or next 5 lines contain .catch( or are inside try {
      const window = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
      const hasCatch = window.includes('.catch(') || window.includes('try {') || window.includes('try{');
      if (!hasCatch) {
        violations.push({
          ruleId: 'no-fetch-without-catch',
          description: 'fetch() without error handling',
          line: findLineNumber(lines, i),
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
      if (/process\.env\.\w+/.test(line) && !/process\.env\.\w+\s*[\?\|]{1,2}/.test(line)) {
        // Also skip lines that are part of a multi-line expression check by looking at context
        violations.push({
          ruleId: 'no-raw-env-access',
          description: 'process.env access without fallback',
          line: findLineNumber(lines, i),
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
          line: findLineNumber(lines, i),
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
  check(code, _file) {
    const violations: RuleViolation[] = [];
    const lines = code.split('\n');

    // Patterns: variable assignments with long string values that look like secrets
    const SECRET_PATTERNS = [
      // Long alphanumeric strings assigned to key/secret/token/password variables
      /(?:api[_-]?key|secret|token|password|auth[_-]?key)\s*[=:]\s*['"][a-zA-Z0-9+/=_\-]{20,}['"]/i,
      // Common secret prefixes (OpenAI, Stripe, AWS, etc.)
      /['"](?:sk-|pk_|rk_|AKIA|ghp_|gho_|ghu_|ghs_|glpat-)[a-zA-Z0-9]{10,}['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            ruleId: 'no-hardcoded-secret',
            description: 'Hardcoded secret value detected',
            line: findLineNumber(lines, i),
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
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/quality/rule-engine.test.ts
```

Expected: PASS — all 7 tests pass.

**Step 5: Wire rule engine into `engine/index.ts`**

In `engine/index.ts`, add to `QualityCheckResult` and `qualityCheck()`:

At the top imports, add:
```typescript
import { checkRules } from './quality/rule-engine.js';
import type { RuleCheckResult } from './quality/rule-engine.js';
```

Also add to `export type { ... }`:
```typescript
RuleCheckResult,
```

Change `QualityCheckResult` interface from:
```typescript
export interface QualityCheckResult {
  references: ReferenceCheckResult;
  conventions: ConventionCheckResult;
  slop: SlopCheckResult;
}
```
To:
```typescript
export interface QualityCheckResult {
  references: ReferenceCheckResult;
  conventions: ConventionCheckResult;
  slop: SlopCheckResult;
  rules: RuleCheckResult;
}
```

In `qualityCheck()` return statement, change:
```typescript
  return { references, conventions, slop };
```
To:
```typescript
  const rules = checkRules(code, file);
  return { references, conventions, slop, rules };
```

And for the early-return `if (!manifest)` case, change:
```typescript
    return {
      references: { valid: true, violations: [] },
      conventions: { valid: true, violations: [] },
      slop: { clean: true, issues: [] },
    };
```
To:
```typescript
    return {
      references: { valid: true, violations: [] },
      conventions: { valid: true, violations: [] },
      slop: { clean: true, issues: [] },
      rules: { passed: true, violations: [] },
    };
```

**Step 6: Run all tests to confirm nothing broke**

```bash
npx vitest run
```

Expected: All existing tests PASS, plus the new rule-engine tests.

**Step 7: Commit**

```bash
git add engine/quality/rule-engine.ts engine/index.ts tests/quality/rule-engine.test.ts
git commit -m "feat: add neurosymbolic rule engine with no-fetch-without-catch, no-raw-env-access, no-any-cast, no-hardcoded-secret"
```

---

### Task 5: Enrich Digest with Code Quote Snippets

**Files:**
- Modify: `engine/context/digest-formatter.ts`
- Modify: `tests/context/digest-formatter.test.ts`

**Context:** The current digest only outputs summaries ("77 routes, 544 procedures"). This means Claude must rely on memory for field names, parameter types, and route paths — exactly where hallucination happens. Adding actual code quotes to the digest (function signatures, type field lists) gives Claude verifiable ground truth to copy from, not invent.

**Step 1: Write failing tests for the enriched digest**

Read `tests/context/digest-formatter.test.ts` first, then add these tests to it:

```typescript
it('digest markdown includes Key Type Signatures section when types present', () => {
  const type: TypeDef = {
    name: 'UserProfile',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'role', type: 'admin | user', optional: true },
    ],
    source: { repo: 'backend', file: 'src/types.ts', line: 10 },
  };
  const graph = makeGraph({
    sharedTypes: [{
      concept: 'UserProfile',
      instances: [{ repo: 'backend', type }],
      alignment: 'aligned',
    }],
  });
  const { markdown } = formatDigest(graph, makeConfig());
  expect(markdown).toContain('## Key Type Signatures');
  expect(markdown).toContain('UserProfile');
  expect(markdown).toContain('id: string');
  expect(markdown).toContain('email: string');
});

it('digest markdown includes API Route Signatures section when routes present', () => {
  const graph = makeGraph({
    repos: [makeRepo({
      apiSurface: {
        routes: [{
          method: 'POST',
          path: '/api/users',
          handler: 'createUser',
          file: 'src/routes/users.ts',
          line: 42,
          inputType: 'CreateUserInput',
          outputType: 'UserProfile',
        }],
        procedures: [],
        exports: [],
      },
    })],
  });
  const { markdown } = formatDigest(graph, makeConfig());
  expect(markdown).toContain('## API Route Signatures');
  expect(markdown).toContain('POST /api/users');
  expect(markdown).toContain('createUser');
});
```

Note: Read the existing test file to understand `makeGraph()` and `makeRepo()` helpers before adding these tests — they will be similar to the existing pattern.

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/context/digest-formatter.test.ts
```

Expected: FAIL — the "Key Type Signatures" and "API Route Signatures" sections don't exist yet.

**Step 3: Add `buildKeyTypeSignatures()` and `buildApiRouteSignatures()` to `engine/context/digest-formatter.ts`**

Add this helper function before the final `return { digest, markdown }`:

```typescript
function buildKeyTypeSignatures(graph: EcosystemGraph): string {
  if (graph.sharedTypes.length === 0) return '';

  const lines: string[] = ['## Key Type Signatures', ''];

  for (const lineage of graph.sharedTypes) {
    for (const instance of lineage.instances) {
      const t = instance.type;
      lines.push(`### ${t.name} (${instance.repo})`);
      lines.push('```');
      lines.push(`interface ${t.name} {`);
      // Show up to 8 fields to keep the digest token-efficient
      const fields = t.fields.slice(0, 8);
      for (const f of fields) {
        const optional = f.optional ? '?' : '';
        lines.push(`  ${f.name}${optional}: ${f.type};`);
      }
      if (t.fields.length > 8) {
        lines.push(`  // ... ${t.fields.length - 8} more fields`);
      }
      lines.push('}');
      lines.push('```');
      lines.push(`> Source: \`${instance.repo}/${t.source.file}:${t.source.line}\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildApiRouteSignatures(graph: EcosystemGraph): string {
  const allRoutes = graph.repos.flatMap(r =>
    r.apiSurface.routes.map(route => ({ repoId: r.repoId, route })),
  );
  if (allRoutes.length === 0) return '';

  const lines: string[] = ['## API Route Signatures', ''];

  // Show up to 10 routes to keep digest compact
  for (const { repoId, route } of allRoutes.slice(0, 10)) {
    const input = route.inputType ? `  // Input: ${route.inputType}` : '';
    const output = route.outputType ? `  // Output: ${route.outputType}` : '';
    lines.push(`**${route.method} ${route.path}** — \`${repoId}/${route.file}:${route.line}\``);
    lines.push('```');
    lines.push(`handler: ${route.handler}(req, res)`);
    if (input) lines.push(input);
    if (output) lines.push(output);
    lines.push('```');
    lines.push('');
  }

  if (allRoutes.length > 10) {
    lines.push(`> ${allRoutes.length - 10} more routes omitted. Run \`/scan\` for full list.`);
    lines.push('');
  }

  return lines.join('\n');
}
```

Then in `formatDigest()`, after the `## Conventions` section push calls, add:

```typescript
  // Key Type Signatures section (code quotes for grounding)
  const typeSignatures = buildKeyTypeSignatures(graph);
  if (typeSignatures) {
    sections.push('');
    sections.push(typeSignatures);
  }

  // API Route Signatures section
  const routeSignatures = buildApiRouteSignatures(graph);
  if (routeSignatures) {
    sections.push(routeSignatures);
  }
```

**Step 4: Run the tests**

```bash
npx vitest run tests/context/digest-formatter.test.ts
```

Expected: PASS — including the new type signature and route signature tests.

**Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add engine/context/digest-formatter.ts tests/context/digest-formatter.test.ts
git commit -m "feat: enrich digest with key type signatures and API route signatures for grounding"
```

---

### Task 6: Dry-Run / Simulate Mode

**Files:**
- Modify: `engine/types.ts` (add `simulateOnly?: boolean` to `OmniLinkConfig`)
- Create: `engine/quality/simulate-guard.ts`
- Create: `tests/quality/simulate-guard.test.ts`
- Modify: `engine/index.ts` (all 5 public functions check simulate guard)

**Context:** Dry-run mode lets Claude propose changes without executing them. When `simulateOnly: true` is set in the config, all write/scan/evolve operations return a `SimulateResult` explaining what _would_ happen. The `/apply` command (Task 7) actually executes. This prevents Claude from making irreversible ecosystem changes without explicit human confirmation.

**Step 1: Write failing tests for simulate guard**

Create `tests/quality/simulate-guard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assertNotSimulateOnly, SimulateOnlyError } from '../../engine/quality/simulate-guard.js';
import type { OmniLinkConfig } from '../../engine/types.js';

function makeConfig(overrides: Partial<OmniLinkConfig> = {}): OmniLinkConfig {
  return {
    repos: [],
    evolution: { aggressiveness: 'moderate', maxSuggestionsPerSession: 5, categories: [] },
    quality: { blockOnFailure: false, requireTestsForNewCode: false, conventionStrictness: 'moderate' },
    context: { tokenBudget: 4000, prioritize: 'changed-files-first', includeRecentCommits: 5 },
    cache: { directory: '.cache', maxAgeDays: 1 },
    ...overrides,
  };
}

describe('assertNotSimulateOnly', () => {
  it('does not throw when simulateOnly is false', () => {
    const config = makeConfig({ simulateOnly: false });
    expect(() => assertNotSimulateOnly(config, 'scan')).not.toThrow();
  });

  it('does not throw when simulateOnly is undefined', () => {
    const config = makeConfig();
    expect(() => assertNotSimulateOnly(config, 'scan')).not.toThrow();
  });

  it('throws SimulateOnlyError when simulateOnly is true', () => {
    const config = makeConfig({ simulateOnly: true });
    expect(() => assertNotSimulateOnly(config, 'scan')).toThrow(SimulateOnlyError);
  });

  it('SimulateOnlyError message includes the operation name', () => {
    const config = makeConfig({ simulateOnly: true });
    try {
      assertNotSimulateOnly(config, 'evolve');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulateOnlyError);
      expect((err as SimulateOnlyError).message).toContain('evolve');
    }
  });

  it('SimulateOnlyError has operation and apply hint', () => {
    const config = makeConfig({ simulateOnly: true });
    try {
      assertNotSimulateOnly(config, 'impact');
    } catch (err) {
      const e = err as SimulateOnlyError;
      expect(e.operation).toBe('impact');
      expect(e.message).toContain('/apply');
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/quality/simulate-guard.test.ts
```

Expected: FAIL — module not found.

**Step 3: Add `simulateOnly` to `engine/types.ts`**

In `engine/types.ts`, in the `OmniLinkConfig` interface, add `simulateOnly` after the `cache` block:

```typescript
export interface OmniLinkConfig {
  repos: RepoConfig[];
  evolution: {
    aggressiveness: 'aggressive' | 'moderate' | 'on-demand';
    maxSuggestionsPerSession: number;
    categories: string[];
  };
  quality: {
    blockOnFailure: boolean;
    requireTestsForNewCode: boolean;
    conventionStrictness: 'strict' | 'moderate' | 'relaxed';
  };
  context: {
    tokenBudget: number;
    prioritize: 'changed-files-first' | 'api-surface-first';
    includeRecentCommits: number;
    focus?: 'commits' | 'types' | 'api-surface' | 'mismatches' | 'auto';
  };
  cache: {
    directory: string;
    maxAgeDays: number;
  };
  simulateOnly?: boolean;  // ← ADD THIS LINE
}
```

**Step 4: Create `engine/quality/simulate-guard.ts`**

```typescript
// engine/quality/simulate-guard.ts — Dry-run mode enforcement

import type { OmniLinkConfig } from '../types.js';

/**
 * Thrown when an operation is attempted in simulate-only (dry-run) mode.
 * Consumers should catch this and present the dry-run explanation to the user.
 */
export class SimulateOnlyError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(
      `[simulate-only] The '${operation}' operation was blocked because simulateOnly is enabled. ` +
      `Review the plan and run /apply to execute for real.`,
    );
    this.name = 'SimulateOnlyError';
    this.operation = operation;
  }
}

/**
 * Assert that the config is NOT in simulate-only mode before executing a real operation.
 * Call at the top of any function that has side effects or performs actual scanning.
 *
 * @throws {SimulateOnlyError} if config.simulateOnly is true
 */
export function assertNotSimulateOnly(config: OmniLinkConfig, operation: string): void {
  if (config.simulateOnly === true) {
    throw new SimulateOnlyError(operation);
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run tests/quality/simulate-guard.test.ts
```

Expected: PASS — all 5 tests pass.

**Step 6: Wire simulate guard into `engine/index.ts`**

Add to the imports at the top of `engine/index.ts`:

```typescript
import { assertNotSimulateOnly } from './quality/simulate-guard.js';
export { SimulateOnlyError } from './quality/simulate-guard.js';
```

Then add `assertNotSimulateOnly(config, 'scan')` as the first line of `scan()`, `assertNotSimulateOnly(config, 'impact')` as the first line of `impact()`, `assertNotSimulateOnly(config, 'health')` as the first line of `health()`, `assertNotSimulateOnly(config, 'evolve')` as the first line of `evolve()`, and `assertNotSimulateOnly(config, 'qualityCheck')` as the first line of `qualityCheck()`.

**Step 7: Run full tests**

```bash
npx vitest run
```

Expected: All tests pass (the existing `qualityCheck` tests use configs without `simulateOnly`, so they won't trigger the guard).

**Step 8: Commit**

```bash
git add engine/types.ts engine/quality/simulate-guard.ts engine/index.ts tests/quality/simulate-guard.test.ts
git commit -m "feat: add dry-run simulate-only mode with SimulateOnlyError guard"
```

---

### Task 7: /apply Command + Uncertainty Checklist Skill

**Files:**
- Create: `commands/apply.md`
- Create: `skills/uncertainty-checklist/SKILL.md`

**Context:** The `/apply` command is the "execute for real" gate when dry-run mode is active. The uncertainty-checklist skill is a behavioral self-audit that Claude runs before presenting any code — it prevents presenting code without having gone through the verification mental model.

**Step 1: Write test asserting both files exist with required keywords**

Add to `tests/agents/anti-hallucination-prefix.test.ts`:

```typescript
it('commands/apply.md exists and references simulate-only mode', () => {
  const content = readFileSync(resolve(process.cwd(), 'commands/apply.md'), 'utf8');
  expect(content).toContain('simulateOnly');
  expect(content).toContain('dry-run');
  expect(content).toContain('/verify');
});

it('skills/uncertainty-checklist/SKILL.md exists with checklist items', () => {
  const content = readFileSync(
    resolve(process.cwd(), 'skills/uncertainty-checklist/SKILL.md'), 'utf8',
  );
  expect(content).toContain('verified');
  expect(content).toContain('manifest');
  expect(content).toContain('anti-slop');
  expect(content).toContain('placeholder');
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: FAIL — files don't exist.

**Step 3: Create `commands/apply.md`**

```markdown
---
name: apply
description: Execute operations that were previewed in simulate-only (dry-run) mode. Run /verify first, then /apply to commit the changes.
disable-model-invocation: true
---

# /apply — Execute Dry-Run Plan

When `simulateOnly: true` is set in your omni-link config, all scan and analysis operations run in preview mode — they describe what they would do without executing. `/apply` disables the guard and runs the actual operation.

## Prerequisites

Before running `/apply`, you MUST complete ALL of the following:

1. **Run `/verify`** on all generated code — it must return PASS
2. **Review the dry-run summary** — confirm the proposed changes match your intent
3. **Confirm there are no contract mismatches** in the current digest that you haven't addressed

If any prerequisite is not met, resolve it before running `/apply`.

## Execution

```bash
omni-link apply --config <auto-detect>
```

This temporarily sets `simulateOnly: false` for the current execution, runs the full pipeline, and then restores the `simulateOnly: true` setting. It does NOT permanently change your config.

## What Gets Executed

When you run `/apply`:

1. The full scan pipeline runs against all configured repos
2. The ecosystem graph is rebuilt with fresh data
3. The context digest is refreshed in your session
4. Any evolution or impact analysis you requested during dry-run is re-run with real data

## Safety Notes

- `/apply` runs the **read-only** scan pipeline — it does not write code to your repos
- It refreshes the ecosystem manifest used by omni-link to verify your code
- Code generation is still under your control — `/apply` only refreshes the ground truth data Claude uses

## After /apply

Run `/verify` again on any pending generated code to confirm it validates against the fresh manifest.

## Disabling Dry-Run Permanently

To disable dry-run mode entirely, remove or set `"simulateOnly": false` in your `~/.claude/omni-link.json` or `.omni-link.json` config file.
```

**Step 4: Create `skills/uncertainty-checklist/SKILL.md`**

```markdown
---
name: uncertainty-checklist
description: Behavioral self-audit skill. Run before presenting any generated code to verify all claims are grounded, no imports are hallucinated, and no placeholders remain. Prevents overconfident code generation.
---

# Uncertainty Checklist — Pre-Presentation Self-Audit

Run this checklist silently (using `<thinking>` tags) before presenting any generated code to the user. This is not optional — it is the final quality gate before code leaves Claude's context.

## When to Run

- Before presenting any new file or function
- Before suggesting an import or API call
- Before claiming a type name, field name, or route path is correct
- Before saying "this should work" or "this is the correct approach"

## The Checklist

Work through each item in `<thinking>` tags. Only present code when all items pass.

### 1. Import Verification
- [ ] Every `import from '...'` path: have I seen this exact file in the ecosystem manifest or in files I've read this session?
- [ ] Every named import `{ Foo }`: have I verified `Foo` is actually exported from that module?
- [ ] Every external package: is it listed in `package.json`?

**If any fail:** Do not guess. State "I need to run `/scan` to verify this import exists before I can be confident."

### 2. API Call Verification
- [ ] Every `fetch('/api/...')` URL: is this path in the digest's API surface summary?
- [ ] Every tRPC call `trpc.X.Y`: does this procedure name match exactly what was scanned?
- [ ] HTTP method matches the route definition?

**If any fail:** State "The digest shows [actual route]. I'm using [intended route]. Let me correct this."

### 3. Type and Field Verification
- [ ] Every type I'm referencing: did I read its actual definition, or am I working from memory?
- [ ] Every field name I'm accessing: is it in the type's `fields` list from the digest or from a file I read?
- [ ] Optional vs. required correctly handled?

**If any fail:** Read the actual type definition before presenting code. The digest's "Key Type Signatures" section is the authoritative source.

### 4. Placeholder Scan
- [ ] No `// TODO` or `// FIXME` comments?
- [ ] No `throw new Error('not implemented')`?
- [ ] No `console.log('placeholder')` or similar?
- [ ] Every function body has real implementation, not stubs?

**If any fail:** Complete the implementation before presenting.

### 5. Confidence Calibration
- [ ] Am I stating facts I actually verified, or am I guessing?
- [ ] For any claim I'm uncertain about: have I prefixed it with "I believe..." or "Based on the manifest..."?
- [ ] Have I avoided absolute language ("this is correct", "this will work") for anything I haven't verified?

**If any fail:** Add appropriate uncertainty qualifiers or run `/scan` to verify.

## Rejection Format

If you find issues during the checklist, do NOT present the broken code. Instead:

```
Before presenting this code, my uncertainty checklist flagged:

1. [IMPORT] `./services/user-service` — I haven't verified this file exists. Running /scan to confirm.
2. [TYPE] `UserProfile.phoneNumber` — the digest shows UserProfile has `id`, `email`, `role` but I cannot confirm `phoneNumber` without reading the type file.

Pausing to verify before presenting.
```

## The Core Principle

**A clearly stated "I'm not sure" is better than confident wrong code.**

Hallucinated imports that compile but fail at runtime are worse than honest uncertainty. The uncertainty checklist exists to make overconfident errors structurally impossible.
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: PASS — all tests pass.

**Step 6: Commit**

```bash
git add commands/apply.md skills/uncertainty-checklist/SKILL.md tests/agents/anti-hallucination-prefix.test.ts
git commit -m "feat: add /apply command and uncertainty-checklist self-audit skill"
```

---

### Task 8: Update Meta-Skill + Version Bump to 0.3.0

**Files:**
- Modify: `skills/using-omni-link/SKILL.md`
- Modify: `skills/anti-slop-gate/SKILL.md`
- Modify: `package.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Context:** The meta-skill `using-omni-link/SKILL.md` is loaded at every session start and defines the skill registry, iron laws, and available commands. It must be updated to document all new max-tier features. The anti-slop-gate skill must reference the rule engine as Check 4. Version is bumped from 0.2.0 to 0.3.0.

**Step 1: Write test verifying the meta-skill documents new features**

Add to `tests/agents/anti-hallucination-prefix.test.ts`:

```typescript
it('skills/using-omni-link/SKILL.md documents max-tier features', () => {
  const content = readFileSync(
    resolve(process.cwd(), 'skills/using-omni-link/SKILL.md'), 'utf8',
  );
  expect(content).toContain('validator');
  expect(content).toContain('/verify');
  expect(content).toContain('/apply');
  expect(content).toContain('uncertainty-checklist');
  expect(content).toContain('simulateOnly');
});

it('skills/anti-slop-gate/SKILL.md references rule engine', () => {
  const content = readFileSync(
    resolve(process.cwd(), 'skills/anti-slop-gate/SKILL.md'), 'utf8',
  );
  expect(content).toContain('rule engine');
});

it('package.json version is 0.3.0', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
  );
  expect(pkg.version).toBe('0.3.0');
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agents/anti-hallucination-prefix.test.ts
```

Expected: FAIL — meta-skill doesn't have new features documented.

**Step 3: Update `skills/using-omni-link/SKILL.md`**

Add the following to the Skill Registry table (after the existing rows):
```
| `uncertainty-checklist` | Before presenting any generated code | Self-audit checklist for import/type/placeholder verification |
```

Add the following to the Available Commands table (after the existing rows):
```
| `/verify` | Dispatch Validator critic agent to review generated code |
| `/apply`  | Execute operations previewed in dry-run (simulateOnly) mode |
```

Add a new section after the "Skill Registry" section:

```markdown
## Max-Tier Anti-Hallucination Mode

omni-link v0.3.0 introduces structural anti-hallucination safeguards across all layers:

### Agent Prompts
All three sub-agents (`validator`, `cross-repo-reviewer`, `evolution-strategist`) include mandatory Anti-Hallucination Protocol sections requiring uncertainty disclosure, CoT verification in `<thinking>` tags, and evidence-before-assertion discipline.

### Validator Critic Agent
A dedicated `validator` agent performs read-only verification of generated code:
- Verifies every import resolves to a real file
- Confirms every package exists in `package.json`
- Validates every API call against the ecosystem manifest
- Detects placeholders and phantom packages

Dispatched via `/verify`. Returns PASS / FAIL / INCONCLUSIVE.

### Neurosymbolic Rule Engine
Hard rules enforced via `checkRules()` in the quality pipeline:
- `no-fetch-without-catch` — fetch() must have error handling
- `no-raw-env-access` — process.env.X needs a `??` fallback
- `no-any-cast` — `as any` banned in production code
- `no-hardcoded-secret` — API keys must not be inlined

### Enriched Digest (Code Quotes)
The ecosystem digest now includes actual type signatures and route signatures — not just counts. Claude can see the real field names and parameter types, eliminating hallucinated field access.

### Dry-Run Mode
Set `simulateOnly: true` in your omni-link config to run all operations in preview mode. Use `/apply` to execute for real after human review.

### Uncertainty Checklist
The `uncertainty-checklist` skill is a pre-presentation self-audit that Claude runs silently before showing code. It prevents overconfident wrong code from reaching the user.
```

**Step 4: Update `skills/anti-slop-gate/SKILL.md`**

After the existing "### 3. Slop Detector" section, add:

```markdown
### 4. Neurosymbolic Rule Engine

Hard rules enforced on generated code by the rule engine:

**Blocks on (severity: error):**
- `no-fetch-without-catch`: `fetch()` without `.catch()` or try-catch within 5 lines
- `no-hardcoded-secret`: API key / token / password pattern hardcoded in source

**Warns on (severity: warning):**
- `no-raw-env-access`: `process.env.X` without `??` fallback
- `no-any-cast`: TypeScript `as any` in production (non-test) files
```

**Step 5: Update version to 0.3.0 in all three files**

In `package.json`, change `"version": "0.2.0"` to `"version": "0.3.0"`.

In `.claude-plugin/plugin.json`, change `"version": "0.2.0"` to `"version": "0.3.0"`.

In `.claude-plugin/marketplace.json`, change `"version": "0.2.0"` to `"version": "0.3.0"`.

**Step 6: Run tests to verify all pass**

```bash
npx vitest run
```

Expected: ALL tests pass.

**Step 7: Run the TypeScript type check**

```bash
npm run lint
```

Expected: No type errors.

**Step 8: Commit and push**

```bash
git add skills/using-omni-link/SKILL.md skills/anti-slop-gate/SKILL.md package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json tests/agents/anti-hallucination-prefix.test.ts
git commit -m "feat: update meta-skill with max-tier docs, version bump to 0.3.0"
git push
```

---

## Summary of Changes

| Task | What Gets Built | Files |
|------|----------------|-------|
| 1 | Anti-hallucination protocol in all agent prompts | `agents/*.md` |
| 2 | Validator critic agent | `agents/validator.md` |
| 3 | `/verify` slash command | `commands/verify.md` |
| 4 | Neurosymbolic rule engine (4 hard rules + wiring) | `engine/quality/rule-engine.ts`, `engine/index.ts` |
| 5 | Code quote enrichment in digest (types + routes) | `engine/context/digest-formatter.ts` |
| 6 | Dry-run simulate-only mode | `engine/types.ts`, `engine/quality/simulate-guard.ts`, `engine/index.ts` |
| 7 | `/apply` command + uncertainty-checklist skill | `commands/apply.md`, `skills/uncertainty-checklist/SKILL.md` |
| 8 | Meta-skill docs update + v0.3.0 bump | `skills/using-omni-link/SKILL.md`, `skills/anti-slop-gate/SKILL.md`, `package.json`, plugin configs |

**No new npm packages required.** All implementations use only Node.js builtins and existing project dependencies.
