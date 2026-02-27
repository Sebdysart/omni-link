// engine/quality/convention-validator.ts — Enforce detected codebase patterns

import type { RepoManifest, NamingConvention } from '../types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ConventionViolation {
  kind: 'naming' | 'file-location' | 'error-handling' | 'testing';
  message: string;
  suggestion: string;
}

export interface ConventionCheckResult {
  valid: boolean;
  violations: ConventionViolation[];
}

// ─── Naming Convention Checks ────────────────────────────────────────────────

const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/;
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
const KEBAB_CASE_RE = /^[a-z][a-z0-9-]*$/;

// Common patterns in variable/function declarations
const VARIABLE_DECLARATION_RE = /(?:const|let|var)\s+(\w+)\s*[=:]/g;
const FUNCTION_DECLARATION_RE = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g;
const PARAM_RE = /(?:function\s+\w+|=>\s*)\s*\(([^)]*)\)/g;

// Patterns that indicate class/type/interface names (should be PascalCase)
const CLASS_LIKE_RE = /(?:class|interface|type|enum)\s+(\w+)/g;

/**
 * Extract variable and function names from source code.
 * Returns names that should follow the codebase naming convention.
 */
function extractIdentifiers(code: string): Array<{ name: string; line: number; isClassLike: boolean }> {
  const identifiers: Array<{ name: string; line: number; isClassLike: boolean }> = [];
  const lines = code.split('\n');

  // First pass: collect class-like names so we can exclude them from var checks
  const classLikeNames = new Set<string>();
  for (const line of lines) {
    let match: RegExpExecArray | null;
    const classRe = new RegExp(CLASS_LIKE_RE.source, 'g');
    while ((match = classRe.exec(line)) !== null) {
      classLikeNames.add(match[1]);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Extract class/interface/type/enum declarations
    let match: RegExpExecArray | null;
    const classRe = new RegExp(CLASS_LIKE_RE.source, 'g');
    while ((match = classRe.exec(line)) !== null) {
      identifiers.push({ name: match[1], line: lineNum, isClassLike: true });
    }

    // Extract variable declarations
    const varRe = new RegExp(VARIABLE_DECLARATION_RE.source, 'g');
    while ((match = varRe.exec(line)) !== null) {
      const name = match[1];
      // Skip if it's a destructured import or class instantiation reference
      if (!classLikeNames.has(name) && !name.startsWith('_')) {
        identifiers.push({ name, line: lineNum, isClassLike: false });
      }
    }

    // Extract function declarations (JS/TS)
    const funcRe = new RegExp(FUNCTION_DECLARATION_RE.source, 'g');
    while ((match = funcRe.exec(line)) !== null) {
      const name = match[1] || match[2];
      if (name && !classLikeNames.has(name) && !name.startsWith('_')) {
        identifiers.push({ name, line: lineNum, isClassLike: false });
      }
    }

    // Python def declarations
    const pyDefMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
    if (pyDefMatch) {
      const name = pyDefMatch[1];
      if (!classLikeNames.has(name) && !name.startsWith('_')) {
        identifiers.push({ name, line: lineNum, isClassLike: false });
      }
    }

    // Bare assignments: name = value (Python-style, no const/let/var)
    // Only match if line starts with an identifier followed by = (not ==, !=, <=, >=)
    const bareAssignMatch = line.match(/^\s+(\w+)\s*=[^=]/);
    if (bareAssignMatch) {
      const name = bareAssignMatch[1];
      if (
        !classLikeNames.has(name) &&
        !name.startsWith('_') &&
        // Avoid matching keywords
        !['if', 'else', 'for', 'while', 'return', 'import', 'from', 'class', 'def', 'const', 'let', 'var', 'export', 'default', 'this', 'self', 'true', 'false'].includes(name)
      ) {
        identifiers.push({ name, line: lineNum, isClassLike: false });
      }
    }
  }

  return identifiers;
}

function matchesConvention(name: string, convention: NamingConvention): boolean {
  switch (convention) {
    case 'camelCase':
      return CAMEL_CASE_RE.test(name);
    case 'snake_case':
      return SNAKE_CASE_RE.test(name);
    case 'PascalCase':
      return PASCAL_CASE_RE.test(name);
    case 'kebab-case':
      return KEBAB_CASE_RE.test(name);
    case 'mixed':
      return true; // Mixed convention = anything goes
  }
}

function suggestRename(name: string, convention: NamingConvention): string {
  switch (convention) {
    case 'camelCase':
      // snake_case → camelCase
      return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    case 'snake_case':
      // camelCase → snake_case
      return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    case 'PascalCase':
      // snake_case or camelCase → PascalCase
      const asSnake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
      return asSnake
        .split('_')
        .filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
    case 'kebab-case':
      return name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/_/g, '-');
    default:
      return name;
  }
}

function checkNamingConventions(
  code: string,
  convention: NamingConvention,
): ConventionViolation[] {
  if (convention === 'mixed') return [];

  const violations: ConventionViolation[] = [];
  const identifiers = extractIdentifiers(code);
  const seen = new Set<string>();

  for (const id of identifiers) {
    // Skip duplicates
    if (seen.has(id.name)) continue;
    seen.add(id.name);

    if (id.isClassLike) {
      // Class-like names should always be PascalCase, regardless of convention
      if (!PASCAL_CASE_RE.test(id.name)) {
        violations.push({
          kind: 'naming',
          message: `Class/type/interface '${id.name}' should use PascalCase`,
          suggestion: `Rename to '${suggestRename(id.name, 'PascalCase')}'`,
        });
      }
    } else {
      // Regular identifiers should match the codebase convention
      if (!matchesConvention(id.name, convention)) {
        // Allow PascalCase names in camelCase codebases (constructors, classes)
        if (convention === 'camelCase' && PASCAL_CASE_RE.test(id.name)) continue;
        // Allow UPPER_SNAKE_CASE constants in any convention
        if (/^[A-Z][A-Z0-9_]*$/.test(id.name)) continue;
        // Skip single-char names
        if (id.name.length <= 1) continue;

        violations.push({
          kind: 'naming',
          message: `'${id.name}' does not follow ${convention} convention`,
          suggestion: `Rename to '${suggestRename(id.name, convention)}'`,
        });
      }
    }
  }

  return violations;
}

// ─── File Location Checks ────────────────────────────────────────────────────

function isTestFile(code: string, filePath: string): boolean {
  // Check file name patterns
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) return true;
  if (filePath.includes('__tests__/')) return true;

  // Check content for test frameworks
  if (/import\s+.*\bfrom\s+['"](?:vitest|jest|mocha|@testing-library)/.test(code)) return true;
  if (/\b(?:describe|it|test)\s*\(/.test(code) && /\bexpect\s*\(/.test(code)) return true;

  return false;
}

function isRouteHandler(code: string): boolean {
  // Check for common route handler patterns
  return /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|use)\s*\(/.test(code)
    || /\bnew\s+Hono\b/.test(code)
    || /\bexpress\s*\(\)/.test(code)
    || /\brouter\s*\.\s*(?:query|mutation|subscription)\b/.test(code);
}

function checkFileLocation(
  code: string,
  filePath: string,
  manifest: RepoManifest,
): ConventionViolation[] {
  const violations: ConventionViolation[] = [];
  const { testingPatterns, patterns } = manifest.conventions;

  // Check test file location
  if (isTestFile(code, filePath)) {
    if (testingPatterns === 'separate-directory') {
      // Test files should be in tests/ or __tests__/ directory
      if (!filePath.startsWith('tests/') && !filePath.startsWith('test/') && !filePath.includes('__tests__/')) {
        violations.push({
          kind: 'file-location',
          message: `Test file '${filePath}' should be in a separate test directory (e.g., tests/)`,
          suggestion: `Move to 'tests/${filePath.replace(/^src\//, '')}'`,
        });
      }
    } else if (testingPatterns === 'co-located') {
      // Test files should be next to their source files
      // No violation for co-located tests
    }
  }

  // Check route handler location against patterns
  if (isRouteHandler(code) && patterns.length > 0) {
    for (const pattern of patterns) {
      const match = pattern.match(/^(\w+)-in-(\S+)$/);
      if (match) {
        const [, what, dir] = match;
        if (what === 'routes' && !filePath.includes(dir)) {
          violations.push({
            kind: 'file-location',
            message: `Route handler '${filePath}' should be in the '${dir}' directory per codebase convention`,
            suggestion: `Move to '${dir}${filePath.split('/').pop()}'`,
          });
        }
      }
    }
  }

  return violations;
}

// ─── Error Handling Checks ───────────────────────────────────────────────────

/**
 * Detect async functions that lack error handling.
 */
function checkErrorHandling(
  code: string,
  manifest: RepoManifest,
): ConventionViolation[] {
  if (!manifest.conventions.errorHandling) return [];

  const violations: ConventionViolation[] = [];
  const errorHandlingStyle = manifest.conventions.errorHandling;

  if (errorHandlingStyle === 'try-catch') {
    // Find async functions and check if they have try-catch
    const asyncFunctions = findAsyncFunctions(code);

    for (const fn of asyncFunctions) {
      if (!fn.hasTryCatch && fn.hasAwait) {
        violations.push({
          kind: 'error-handling',
          message: `Async function '${fn.name}' uses await without error handling`,
          suggestion: `Wrap await calls in try-catch blocks per codebase convention`,
        });
      }
    }
  }

  return violations;
}

interface AsyncFunctionInfo {
  name: string;
  hasAwait: boolean;
  hasTryCatch: boolean;
  line: number;
}

function findAsyncFunctions(code: string): AsyncFunctionInfo[] {
  const functions: AsyncFunctionInfo[] = [];
  const lines = code.split('\n');

  // Simple brace-based scope tracking
  let inAsyncFunction = false;
  let asyncFuncName = '';
  let asyncFuncLine = 0;
  let braceDepth = 0;
  let funcStartBrace = 0;
  let hasAwait = false;
  let hasTryCatch = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect async function start
    const asyncMatch = line.match(/(?:export\s+)?async\s+function\s+(\w+)/);
    const asyncArrowMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*async/);

    if (!inAsyncFunction && (asyncMatch || asyncArrowMatch)) {
      inAsyncFunction = true;
      asyncFuncName = asyncMatch ? asyncMatch[1] : asyncArrowMatch![1];
      asyncFuncLine = i + 1;
      funcStartBrace = braceDepth;
      hasAwait = false;
      hasTryCatch = false;
    }

    // Count braces
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }

    if (inAsyncFunction) {
      if (/\bawait\b/.test(line)) hasAwait = true;
      if (/\btry\s*\{/.test(line)) hasTryCatch = true;
      if (/\.catch\s*\(/.test(line)) hasTryCatch = true;

      // Check if function ended
      if (braceDepth <= funcStartBrace) {
        functions.push({
          name: asyncFuncName,
          hasAwait,
          hasTryCatch,
          line: asyncFuncLine,
        });
        inAsyncFunction = false;
      }
    }
  }

  // Handle case where function spans to end of file
  if (inAsyncFunction) {
    functions.push({
      name: asyncFuncName,
      hasAwait,
      hasTryCatch,
      line: asyncFuncLine,
    });
  }

  return functions;
}

// ─── Main Validator ──────────────────────────────────────────────────────────

/**
 * Check proposed code against detected codebase conventions.
 */
export function validateConventions(
  proposedCode: string,
  file: string,
  manifest: RepoManifest,
): ConventionCheckResult {
  if (!proposedCode.trim()) {
    return { valid: true, violations: [] };
  }

  const violations: ConventionViolation[] = [
    ...checkNamingConventions(proposedCode, manifest.conventions.naming),
    ...checkFileLocation(proposedCode, file, manifest),
    ...checkErrorHandling(proposedCode, manifest),
  ];

  return {
    valid: violations.length === 0,
    violations,
  };
}
