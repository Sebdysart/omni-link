// engine/quality/reference-checker.ts — Verify imports, API calls, and types against actual codebase

import type { RepoManifest } from '../types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ReferenceViolation {
  kind: 'missing-file' | 'missing-export' | 'unknown-route' | 'unknown-procedure';
  message: string;
  line: number;
}

export interface ReferenceCheckResult {
  valid: boolean;
  violations: ReferenceViolation[];
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

// ─── Import Parsing ──────────────────────────────────────────────────────────

interface ParsedImport {
  specifier: string;
  names: string[];
  isTypeOnly: boolean;
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

/**
 * Parse import statements from source code.
 * Handles: import { A, B } from '...', import X from '...', import * as X from '...',
 * import type { A } from '...', const X = require('...')
 */
function parseImports(code: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // ES module imports
    // import type { X } from '...'
    // import { X, Y } from '...'
    // import X from '...'
    // import * as X from '...'
    const esImportMatch = line.match(
      /^import\s+(type\s+)?(?:(\{[^}]*\})|(\*\s+as\s+\w+)|(\w+))(?:\s*,\s*(?:(\{[^}]*\})|(\*\s+as\s+\w+)))?\s+from\s+['"]([^'"]+)['"]/,
    );

    if (esImportMatch) {
      const isTypeOnly = !!esImportMatch[1];
      const namedImports = esImportMatch[2] || esImportMatch[5];
      const namespaceImport = esImportMatch[3] || esImportMatch[6];
      const defaultImport = esImportMatch[4];
      const specifier = esImportMatch[7];

      const names: string[] = [];

      if (namedImports) {
        // Extract names from { A, B as C }
        const cleaned = namedImports.replace(/[{}]/g, '');
        for (const part of cleaned.split(',')) {
          const trimmed = part.trim();
          if (trimmed) {
            // Handle 'A as B' — the imported name is A
            const asMatch = trimmed.match(/^(\w+)(?:\s+as\s+\w+)?$/);
            if (asMatch) {
              names.push(asMatch[1]);
            }
          }
        }
      }

      if (defaultImport) {
        names.push(defaultImport);
      }

      imports.push({
        specifier,
        names,
        isTypeOnly,
        isDefault: !!defaultImport,
        isNamespace: !!namespaceImport,
        line: lineNum,
      });
      continue;
    }

    // Bare side-effect imports: import '...'
    const bareImportMatch = line.match(/^import\s+['"]([^'"]+)['"]/);
    if (bareImportMatch) {
      imports.push({
        specifier: bareImportMatch[1],
        names: [],
        isTypeOnly: false,
        isDefault: false,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }

    // CommonJS require: const X = require('...')
    const requireMatch = line.match(/(?:const|let|var)\s+(?:(\{[^}]*\})|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const names: string[] = [];
      if (requireMatch[1]) {
        const cleaned = requireMatch[1].replace(/[{}]/g, '');
        for (const part of cleaned.split(',')) {
          const trimmed = part.trim();
          if (trimmed) {
            const asMatch = trimmed.match(/^(\w+)/);
            if (asMatch) names.push(asMatch[1]);
          }
        }
      } else if (requireMatch[2]) {
        names.push(requireMatch[2]);
      }
      imports.push({
        specifier: requireMatch[3],
        names,
        isTypeOnly: false,
        isDefault: !!requireMatch[2],
        isNamespace: false,
        line: lineNum,
      });
    }
  }

  return imports;
}

// ─── API Call Parsing ────────────────────────────────────────────────────────

interface ParsedApiCall {
  kind: 'route' | 'procedure';
  value: string;
  line: number;
}

/**
 * Extract API route paths and tRPC procedure calls from source code.
 */
function parseApiCalls(code: string): ParsedApiCall[] {
  const calls: ParsedApiCall[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // fetch('/api/...') or axios.get('/api/...') or axios.post('/api/...') etc.
    const routePatterns = [
      /fetch\s*\(\s*['"]([^'"]*\/api\/[^'"]+)['"]/g,
      /axios\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]*\/api\/[^'"]+)['"]/g,
      /\.(?:get|post|put|patch|delete)\s*\(\s*['"]([^'"]*\/api\/[^'"]+)['"]/g,
    ];

    for (const pattern of routePatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        calls.push({ kind: 'route', value: match[1], line: lineNum });
      }
    }

    // tRPC procedure calls: trpc.procedureName.query() / .mutate() / .subscribe()
    // Also: client.procedureName.query()
    const trpcPattern = /\.\s*(\w+)\s*\.\s*(?:query|mutate|subscribe|useQuery|useMutation)\s*\(/g;
    let trpcMatch: RegExpExecArray | null;
    while ((trpcMatch = trpcPattern.exec(line)) !== null) {
      const procName = trpcMatch[1];
      // Skip common non-procedure names
      if (!['prototype', 'constructor', 'then', 'catch', 'finally'].includes(procName)) {
        calls.push({ kind: 'procedure', value: procName, line: lineNum });
      }
    }
  }

  return calls;
}

// ─── Path Resolution ─────────────────────────────────────────────────────────

/**
 * Normalize an import specifier relative to the importing file.
 * './services/user-service.js' from 'src/index.ts' → 'src/services/user-service.ts'
 */
function resolveRelativeImport(specifier: string, fromFile: string): string {
  if (!specifier.startsWith('.')) return specifier;

  // Get directory of the importing file
  const fromDir = fromFile.includes('/')
    ? fromFile.substring(0, fromFile.lastIndexOf('/'))
    : '.';

  // Resolve the relative path
  const parts = fromDir.split('/');
  const specParts = specifier.split('/');

  for (const seg of specParts) {
    if (seg === '.') {
      // Stay in current directory
    } else if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }

  let resolved = parts.join('/');

  // Normalize extension: .js → .ts, .jsx → .tsx (for TypeScript projects)
  resolved = resolved.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');

  // If no extension, try .ts
  if (!/\.\w+$/.test(resolved)) {
    resolved += '.ts';
  }

  return resolved;
}

/**
 * Collect all known file paths from the manifest.
 */
function getKnownFiles(manifest: RepoManifest): Set<string> {
  const files = new Set<string>();

  for (const exp of manifest.apiSurface.exports) {
    files.add(exp.file);
  }
  for (const route of manifest.apiSurface.routes) {
    files.add(route.file);
  }
  for (const proc of manifest.apiSurface.procedures) {
    files.add(proc.file);
  }
  for (const dep of manifest.dependencies.internal) {
    files.add(dep.from);
    files.add(dep.to);
  }
  for (const t of manifest.typeRegistry.types) {
    files.add(t.source.file);
  }
  for (const s of manifest.typeRegistry.schemas) {
    files.add(s.source.file);
  }
  for (const m of manifest.typeRegistry.models) {
    files.add(m.source.file);
  }

  return files;
}

/**
 * Get all exports defined in a specific file.
 */
function getExportsForFile(manifest: RepoManifest, filePath: string): Set<string> {
  const exports = new Set<string>();

  for (const exp of manifest.apiSurface.exports) {
    if (exp.file === filePath) {
      exports.add(exp.name);
    }
  }

  // Types and interfaces are also exports
  for (const t of manifest.typeRegistry.types) {
    if (t.source.file === filePath) {
      exports.add(t.name);
    }
  }
  for (const s of manifest.typeRegistry.schemas) {
    if (s.source.file === filePath) {
      exports.add(s.name);
    }
  }
  for (const m of manifest.typeRegistry.models) {
    if (m.source.file === filePath) {
      exports.add(m.name);
    }
  }

  return exports;
}

// ─── Main Checker ────────────────────────────────────────────────────────────

/**
 * Verify that all imports, API calls, and type references in proposed code
 * resolve to real files, exports, routes, and procedures in the manifest.
 */
export function checkReferences(
  proposedCode: string,
  file: string,
  manifest: RepoManifest,
): ReferenceCheckResult {
  const violations: ReferenceViolation[] = [];
  const knownFiles = getKnownFiles(manifest);
  const externalPackages = new Set(manifest.dependencies.external.map(d => d.name));

  // ─── Check Imports ──────────────────────────────────────────────────

  const imports = parseImports(proposedCode);

  for (const imp of imports) {
    // Skip built-in modules
    if (isBuiltinModule(imp.specifier)) continue;

    // Check if it's a relative import (local file)
    if (imp.specifier.startsWith('.') || imp.specifier.startsWith('/')) {
      const resolvedPath = resolveRelativeImport(imp.specifier, file);

      // Check if the file exists in the manifest
      // Try with and without index.ts for directory imports
      const candidates = [
        resolvedPath,
        resolvedPath.replace(/\.ts$/, '/index.ts'),
      ];

      const matchedFile = candidates.find(c => knownFiles.has(c));

      if (!matchedFile) {
        violations.push({
          kind: 'missing-file',
          message: `Import path '${imp.specifier}' resolves to '${resolvedPath}' which does not exist in the codebase`,
          line: imp.line,
        });
        continue;
      }

      // Check that each named import exists as an export in the target file
      if (!imp.isDefault && !imp.isNamespace && imp.names.length > 0) {
        const fileExports = getExportsForFile(manifest, matchedFile);
        for (const name of imp.names) {
          if (!fileExports.has(name)) {
            violations.push({
              kind: 'missing-export',
              message: `'${name}' is not exported from '${matchedFile}'`,
              line: imp.line,
            });
          }
        }
      }
    } else {
      // External package import — check if it's in dependencies
      // Package name: @scope/name or name (first segment or first two for scoped)
      const packageName = imp.specifier.startsWith('@')
        ? imp.specifier.split('/').slice(0, 2).join('/')
        : imp.specifier.split('/')[0];

      if (!externalPackages.has(packageName)) {
        // Not in external deps — this may be an unknown import
        // Don't flag it as missing-file if we don't track external deps,
        // but it's already checked by the slop detector for phantom imports
      }
    }
  }

  // ─── Check API Calls ───────────────────────────────────────────────

  const apiCalls = parseApiCalls(proposedCode);
  const knownRoutes = new Set(manifest.apiSurface.routes.map(r => r.path));
  const knownProcedures = new Set(manifest.apiSurface.procedures.map(p => p.name));

  for (const call of apiCalls) {
    if (call.kind === 'route') {
      // Normalize: strip query string, trailing slash
      const normalizedPath = call.value.split('?')[0].replace(/\/$/, '');
      if (!knownRoutes.has(normalizedPath)) {
        // Check if any known route is a prefix match (parameterized routes)
        const isParameterized = [...knownRoutes].some(route => {
          const routePattern = route.replace(/:\w+/g, '[^/]+').replace(/\{[^}]+\}/g, '[^/]+');
          return new RegExp(`^${routePattern}$`).test(normalizedPath);
        });

        if (!isParameterized) {
          violations.push({
            kind: 'unknown-route',
            message: `API call to '${call.value}' does not match any known route in the codebase`,
            line: call.line,
          });
        }
      }
    } else if (call.kind === 'procedure') {
      if (!knownProcedures.has(call.value)) {
        violations.push({
          kind: 'unknown-procedure',
          message: `tRPC procedure '${call.value}' is not defined in the codebase`,
          line: call.line,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
