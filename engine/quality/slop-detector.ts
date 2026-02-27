// engine/quality/slop-detector.ts — Catch hallucinated packages, placeholders, over-engineering

import type { RepoManifest } from '../types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface SlopIssue {
  kind: 'placeholder' | 'phantom-import' | 'over-abstraction' | 'duplicate-block' | 'over-commenting';
  message: string;
  line: number;
  severity: 'error' | 'warning';
}

export interface SlopCheckResult {
  clean: boolean;
  issues: SlopIssue[];
}

// ─── Node.js Built-in Modules ────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers',
  'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
]);

function isBuiltinModule(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  return NODE_BUILTINS.has(specifier);
}

// ─── Placeholder Detection ───────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\/\/\s*TODO\b/i, description: 'TODO comment' },
  { pattern: /\/\/\s*FIXME\b/i, description: 'FIXME comment' },
  { pattern: /\/\/\s*HACK\b/i, description: 'HACK comment' },
  { pattern: /\/\/\s*XXX\b/i, description: 'XXX comment' },
  { pattern: /throw\s+new\s+Error\s*\(\s*['"]not\s+implemented['"]/i, description: '"not implemented" error throw' },
  { pattern: /throw\s+new\s+Error\s*\(\s*['"]TODO['"]/i, description: 'TODO error throw' },
  { pattern: /console\.log\s*\(\s*['"]implement/i, description: 'placeholder console.log' },
  { pattern: /console\.log\s*\(\s*['"]todo/i, description: 'placeholder console.log' },
  { pattern: /pass\s*#\s*TODO/i, description: 'Python pass TODO' },
  { pattern: /raise\s+NotImplementedError/i, description: 'NotImplementedError' },
];

function detectPlaceholders(code: string): SlopIssue[] {
  const issues: SlopIssue[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, description } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          kind: 'placeholder',
          message: `Placeholder detected: ${description}`,
          line: i + 1,
          severity: 'error',
        });
        break; // Only one placeholder issue per line
      }
    }
  }

  return issues;
}

// ─── Phantom Import Detection ────────────────────────────────────────────────

function extractExternalImports(code: string): Array<{ packageName: string; line: number }> {
  const imports: Array<{ packageName: string; line: number }> = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // ES module imports
    const esMatch = line.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
    if (esMatch) {
      const specifier = esMatch[1];
      // Skip relative imports
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      // Skip built-in modules
      if (isBuiltinModule(specifier)) continue;

      // Extract package name (handle scoped packages)
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      imports.push({ packageName, line: i + 1 });
      continue;
    }

    // Bare side-effect imports
    const bareMatch = line.match(/^import\s+['"]([^'"]+)['"]/);
    if (bareMatch) {
      const specifier = bareMatch[1];
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      if (isBuiltinModule(specifier)) continue;

      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      imports.push({ packageName, line: i + 1 });
      continue;
    }

    // CommonJS require
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const specifier = requireMatch[1];
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      if (isBuiltinModule(specifier)) continue;

      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      imports.push({ packageName, line: i + 1 });
    }
  }

  return imports;
}

function detectPhantomImports(code: string, manifest: RepoManifest): SlopIssue[] {
  const issues: SlopIssue[] = [];
  const knownPackages = new Set(manifest.dependencies.external.map(d => d.name));

  const externalImports = extractExternalImports(code);

  for (const imp of externalImports) {
    if (!knownPackages.has(imp.packageName)) {
      issues.push({
        kind: 'phantom-import',
        message: `Package '${imp.packageName}' is not listed in project dependencies — possible hallucinated import`,
        line: imp.line,
        severity: 'error',
      });
    }
  }

  return issues;
}

// ─── Duplicate Block Detection ───────────────────────────────────────────────

const DUPLICATE_MIN_LINES = 3;
const DUPLICATE_MIN_CHARS = 60; // Minimum total characters for a block to be considered meaningful

function detectDuplicateBlocks(code: string): SlopIssue[] {
  const issues: SlopIssue[] = [];
  const lines = code.split('\n');

  // Normalize lines: trim whitespace
  const normalizedLines = lines.map(l => l.trim());

  // Lines too trivial to be part of meaningful duplicates
  const isTrivialLine = (l: string) =>
    l === '' || l === '{' || l === '}' || l === '(' || l === ')' || l === ');'
    || l === 'return;' || l === 'break;' || l === 'continue;';

  // Sliding window: find blocks of DUPLICATE_MIN_LINES+ that repeat
  const seen = new Map<string, number>(); // block hash → first occurrence line

  for (let i = 0; i <= normalizedLines.length - DUPLICATE_MIN_LINES; i++) {
    // Skip trivial starting lines
    if (isTrivialLine(normalizedLines[i])) continue;

    // Build a block of DUPLICATE_MIN_LINES consecutive non-trivial lines
    const blockLines: string[] = [];
    const blockIndices: number[] = [];
    let j = i;
    while (blockLines.length < DUPLICATE_MIN_LINES && j < normalizedLines.length) {
      if (!isTrivialLine(normalizedLines[j])) {
        blockLines.push(normalizedLines[j]);
        blockIndices.push(j);
      }
      j++;
      // Don't span too far (max gap of 2 trivial lines between meaningful ones)
      if (blockLines.length > 0 && j - blockIndices[blockIndices.length - 1] > 3) break;
    }

    if (blockLines.length < DUPLICATE_MIN_LINES) continue;

    // Require minimum total character length to avoid false positives on short lines
    const totalChars = blockLines.reduce((sum, l) => sum + l.length, 0);
    if (totalChars < DUPLICATE_MIN_CHARS) continue;

    const blockKey = blockLines.join('\n');

    if (seen.has(blockKey)) {
      const firstLine = seen.get(blockKey)!;
      // Only report once per duplicate pair
      if (firstLine !== i + 1) {
        const alreadyReported = issues.some(
          iss => iss.kind === 'duplicate-block' && iss.message.includes(`line ${firstLine}`),
        );
        if (!alreadyReported) {
          issues.push({
            kind: 'duplicate-block',
            message: `Duplicate code block at line ${i + 1} matches block at line ${firstLine} (${DUPLICATE_MIN_LINES}+ repeated lines)`,
            line: i + 1,
            severity: 'warning',
          });
        }
      }
    } else {
      seen.set(blockKey, i + 1);
    }
  }

  return issues;
}

// ─── Over-Commenting Detection ───────────────────────────────────────────────

function detectOverCommenting(code: string): SlopIssue[] {
  const issues: SlopIssue[] = [];
  const lines = code.split('\n');

  if (lines.length === 0) return [];

  let commentLines = 0;
  let codeLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') continue; // skip blank lines

    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      commentLines++;
    } else {
      codeLines++;
    }
  }

  const totalMeaningful = commentLines + codeLines;
  if (totalMeaningful > 0) {
    const ratio = commentLines / totalMeaningful;
    if (ratio > 0.5) {
      issues.push({
        kind: 'over-commenting',
        message: `Comment-to-code ratio is ${(ratio * 100).toFixed(0)}% (${commentLines} comment lines, ${codeLines} code lines) — exceeds 50% threshold`,
        line: 1,
        severity: 'warning',
      });
    }
  }

  return issues;
}

// ─── Over-Abstraction Detection ──────────────────────────────────────────────

function detectOverAbstraction(code: string): SlopIssue[] {
  const issues: SlopIssue[] = [];

  // Heuristic 1: Deep inheritance chains (3+ extends in one file)
  // Count only class-level extends (not generic constraints or conditional types)
  const extendsMatches = (code.match(/\bclass\s+\w[^{]*\bextends\b/g) ?? []).length;
  if (extendsMatches >= 3) {
    issues.push({
      kind: 'over-abstraction',
      message: `File has ${extendsMatches} extends relationships — may indicate over-engineered inheritance hierarchy.`,
      line: 1, // file-level diagnostic — no single offending line
      severity: 'warning',
    });
  }

  // Heuristic 2: Abstract/interface count >= 2x concrete class count
  const abstractCount = (code.match(/\babstract\s+class\b/g) ?? []).length +
                        (code.match(/\binterface\s+\w/g) ?? []).length;
  const concreteCount = (code.match(/\bclass\s+\w/g) ?? []).length - (code.match(/\babstract\s+class\b/g) ?? []).length;
  if (concreteCount > 0 && abstractCount >= concreteCount * 2) {
    issues.push({
      kind: 'over-abstraction',
      message: `${abstractCount} abstract types for ${concreteCount} concrete classes — abstraction may exceed value.`,
      line: 1, // file-level diagnostic — no single offending line
      severity: 'warning',
    });
  }

  // Heuristic 3: Single-delegation wrapper functions
  // Match lines that are complete export function definitions delegating to one method
  const lines = code.split('\n');
  let wrapperCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    // Matches: export function foo(...) { return obj.method(...); }
    // or: export async function foo(...) { return obj.method(...); }
    if (/^export\s+(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{[^{}]*return\s+\w+\.\w+\s*\(/.test(trimmed)) {
      wrapperCount++;
    }
  }
  if (wrapperCount >= 3) {
    issues.push({
      kind: 'over-abstraction',
      message: `${wrapperCount} single-delegation wrapper functions — consider exposing the delegated object directly.`,
      line: 1, // file-level diagnostic — no single offending line
      severity: 'warning',
    });
  }

  return issues;
}

// ─── Main Detector ───────────────────────────────────────────────────────────

/**
 * Detect common AI code generation failures in proposed code.
 */
export function detectSlop(proposedCode: string, manifest: RepoManifest): SlopCheckResult {
  if (!proposedCode.trim()) {
    return { clean: true, issues: [] };
  }

  const issues: SlopIssue[] = [
    ...detectPlaceholders(proposedCode),
    ...detectPhantomImports(proposedCode, manifest),
    ...detectDuplicateBlocks(proposedCode),
    ...detectOverCommenting(proposedCode),
    ...detectOverAbstraction(proposedCode),
  ];

  return {
    clean: issues.length === 0,
    issues,
  };
}
