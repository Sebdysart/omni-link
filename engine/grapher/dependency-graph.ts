// engine/grapher/dependency-graph.ts — Internal and cross-repo dependency mapping

import type { RepoManifest, InternalDep, ExportDef } from '../types.js';

/**
 * Build internal dependency graph within a single repo.
 *
 * Two sources of truth:
 * 1. Explicit `dependencies.internal` already present in the manifest (from scanner)
 * 2. Inferred cross-file references: if an export's signature references a name
 *    that is defined in a different file, that creates an implicit dependency
 */
export function buildInternalDeps(manifest: RepoManifest): InternalDep[] {
  const deps: InternalDep[] = [];

  // 1. Start with explicit internal deps from the manifest
  for (const dep of manifest.dependencies.internal) {
    deps.push({ from: dep.from, to: dep.to, imports: [...dep.imports] });
  }

  // 2. Infer cross-file references from export signatures
  const inferred = inferDepsFromSignatures(manifest.apiSurface.exports);

  // Merge inferred deps with explicit deps (avoid duplicates)
  for (const inf of inferred) {
    const existing = deps.find(d => d.from === inf.from && d.to === inf.to);
    if (existing) {
      // Add any new imports that weren't already listed
      for (const imp of inf.imports) {
        if (!existing.imports.includes(imp)) {
          existing.imports.push(imp);
        }
      }
    } else {
      deps.push(inf);
    }
  }

  return deps;
}

/**
 * Infer internal dependencies by analyzing export signatures.
 *
 * For each export, check if its signature contains the name of another export
 * that lives in a different file. If so, the first file depends on the second.
 */
function inferDepsFromSignatures(exports: ExportDef[]): InternalDep[] {
  // Build a map: export name -> file(s) where it's defined
  const nameToFiles = new Map<string, string[]>();
  for (const exp of exports) {
    const files = nameToFiles.get(exp.name) ?? [];
    if (!files.includes(exp.file)) {
      files.push(exp.file);
    }
    nameToFiles.set(exp.name, files);
  }

  // For each export, scan its signature for references to other exports
  const depMap = new Map<string, Map<string, Set<string>>>(); // from -> to -> imports

  for (const exp of exports) {
    // Only check function/constant signatures (types rarely "import" other types)
    if (exp.kind === 'type' || exp.kind === 'interface' || exp.kind === 'enum') continue;

    for (const [name, files] of nameToFiles.entries()) {
      if (name === exp.name) continue;

      // Check if this export's signature references the other name
      // Use word-boundary matching to avoid partial matches
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`);
      if (!regex.test(exp.signature)) continue;

      for (const targetFile of files) {
        if (targetFile === exp.file) continue; // Skip self-references

        const fromMap = depMap.get(exp.file) ?? new Map<string, Set<string>>();
        const imports = fromMap.get(targetFile) ?? new Set<string>();
        imports.add(name);
        fromMap.set(targetFile, imports);
        depMap.set(exp.file, fromMap);
      }
    }
  }

  // Convert map to InternalDep[]
  const result: InternalDep[] = [];
  for (const [from, toMap] of depMap.entries()) {
    for (const [to, imports] of toMap.entries()) {
      result.push({ from, to, imports: [...imports].sort() });
    }
  }

  return result;
}

/**
 * Detect cross-repo dependencies between multiple repos.
 *
 * Signals that create cross-repo links:
 * 1. Shared type names — if two repos both define a type with the same name
 * 2. URL pattern matching — if a repo has route definitions and another repo
 *    references those URL patterns in its exports (API client code)
 * 3. Handler name matching — if a consumer repo references function names that
 *    match handler names in a provider repo
 */
export function detectCrossRepoDeps(
  manifests: RepoManifest[]
): Array<{ from: string; to: string; references: string[] }> {
  if (manifests.length < 2) return [];

  // Accumulate cross-repo references: key = "from:to", value = set of reference strings
  const crossRefMap = new Map<string, Set<string>>();

  const addRef = (from: string, to: string, ref: string) => {
    if (from === to) return;
    const key = `${from}:${to}`;
    const refs = crossRefMap.get(key) ?? new Set<string>();
    refs.add(ref);
    crossRefMap.set(key, refs);
  };

  // 1. Shared type names
  detectSharedTypeNames(manifests, addRef);

  // 2. URL pattern matching (routes in one repo referenced by exports in another)
  detectUrlPatternRefs(manifests, addRef);

  // 3. Handler name matching
  detectHandlerNameRefs(manifests, addRef);

  // Convert to output format
  const result: Array<{ from: string; to: string; references: string[] }> = [];
  for (const [key, refs] of crossRefMap.entries()) {
    const [from, to] = key.split(':');
    result.push({ from, to, references: [...refs].sort() });
  }

  return result;
}

/**
 * Detect shared type names across repos.
 */
function detectSharedTypeNames(
  manifests: RepoManifest[],
  addRef: (from: string, to: string, ref: string) => void
): void {
  // Collect all type names per repo
  const typeNamesByRepo = new Map<string, Set<string>>();

  for (const manifest of manifests) {
    const names = new Set<string>();

    for (const t of manifest.typeRegistry.types) {
      names.add(t.name);
    }
    for (const exp of manifest.apiSurface.exports) {
      if (exp.kind === 'type' || exp.kind === 'interface') {
        names.add(exp.name);
      }
    }

    typeNamesByRepo.set(manifest.repoId, names);
  }

  // Compare each pair of repos
  const repoIds = [...typeNamesByRepo.keys()];
  for (let i = 0; i < repoIds.length; i++) {
    for (let j = i + 1; j < repoIds.length; j++) {
      const namesA = typeNamesByRepo.get(repoIds[i])!;
      const namesB = typeNamesByRepo.get(repoIds[j])!;

      for (const name of namesA) {
        if (namesB.has(name)) {
          // Both repos reference this type — bidirectional dependency
          addRef(repoIds[i], repoIds[j], `shared-type:${name}`);
          addRef(repoIds[j], repoIds[i], `shared-type:${name}`);
        }
      }
    }
  }
}

/**
 * Detect URL patterns in one repo that match routes defined in another.
 */
function detectUrlPatternRefs(
  manifests: RepoManifest[],
  addRef: (from: string, to: string, ref: string) => void
): void {
  // Collect routes from all repos
  const routesByRepo = new Map<string, string[]>();
  for (const manifest of manifests) {
    const paths = manifest.apiSurface.routes.map(r => r.path);
    if (paths.length > 0) {
      routesByRepo.set(manifest.repoId, paths);
    }
  }

  // For each non-provider repo, check if its exports reference any route paths
  for (const manifest of manifests) {
    for (const [providerRepo, routePaths] of routesByRepo.entries()) {
      if (providerRepo === manifest.repoId) continue;

      for (const exp of manifest.apiSurface.exports) {
        for (const routePath of routePaths) {
          // Check if the export's signature or name contains the route path
          if (exp.signature.includes(routePath) || exp.name.includes(routePath)) {
            addRef(manifest.repoId, providerRepo, routePath);
          }
        }
      }
    }
  }
}

/**
 * Detect handler names in one repo referenced by exports in another.
 */
function detectHandlerNameRefs(
  manifests: RepoManifest[],
  addRef: (from: string, to: string, ref: string) => void
): void {
  // Collect handler names from routes
  const handlersByRepo = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    const handlers = new Set<string>();
    for (const route of manifest.apiSurface.routes) {
      if (route.handler) {
        handlers.add(route.handler);
      }
    }
    if (handlers.size > 0) {
      handlersByRepo.set(manifest.repoId, handlers);
    }
  }

  // For each non-provider repo, check if its exports reference handler names
  for (const manifest of manifests) {
    for (const [providerRepo, handlers] of handlersByRepo.entries()) {
      if (providerRepo === manifest.repoId) continue;

      for (const exp of manifest.apiSurface.exports) {
        for (const handler of handlers) {
          const regex = new RegExp(`\\b${escapeRegex(handler)}\\b`);
          if (regex.test(exp.signature) || regex.test(exp.name)) {
            addRef(manifest.repoId, providerRepo, `handler:${handler}`);
          }
        }
      }
    }
  }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
