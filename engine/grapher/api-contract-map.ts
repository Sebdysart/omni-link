// engine/grapher/api-contract-map.ts — API contract mapper: bridge detection and type matching across repos

import type {
  RepoManifest,
  ApiBridge,
  TypeDef,
  RouteDefinition,
  ProcedureDef,
} from '../types.js';

/**
 * Compare two TypeDefs by their field sets.
 *
 * - `exact`: all consumer fields exist in provider with same names
 * - `compatible`: consumer fields are a strict subset of provider fields
 * - `mismatch`: consumer expects fields the provider does not have
 */
export function compareTypes(
  providerType: TypeDef,
  consumerType: TypeDef
): 'exact' | 'compatible' | 'mismatch' {
  const providerFields = new Set(providerType.fields.map(f => f.name));
  const consumerFields = new Set(consumerType.fields.map(f => f.name));

  // Check if consumer has any fields not in provider
  let consumerHasExtra = false;
  for (const field of consumerFields) {
    if (!providerFields.has(field)) {
      consumerHasExtra = true;
      break;
    }
  }

  if (consumerHasExtra) return 'mismatch';

  // All consumer fields exist in provider
  if (consumerFields.size === providerFields.size) return 'exact';

  // Consumer is a subset
  return 'compatible';
}

/**
 * Map API contracts across all repos.
 *
 * Finds all API connections by:
 * 1. Collecting routes and procedures from provider repos
 * 2. Scanning consumer repos for references to those routes/procedures
 * 3. Matching output types across the bridge
 * 4. Producing ApiBridge[] with match status
 */
export function mapApiContracts(manifests: RepoManifest[]): ApiBridge[] {
  const bridges: ApiBridge[] = [];

  // Collect all route and procedure providers
  const providers: ProviderEndpoint[] = [];
  for (const manifest of manifests) {
    for (const route of manifest.apiSurface.routes) {
      providers.push({
        repoId: manifest.repoId,
        kind: 'route',
        route,
        procedure: undefined,
        manifest,
      });
    }
    for (const proc of manifest.apiSurface.procedures) {
      providers.push({
        repoId: manifest.repoId,
        kind: 'procedure',
        route: undefined,
        procedure: proc,
        manifest,
      });
    }
  }

  if (providers.length === 0) return [];

  // For each consumer repo, look for references to provider endpoints
  for (const consumerManifest of manifests) {
    for (const provider of providers) {
      if (provider.repoId === consumerManifest.repoId) continue;

      const matches = findConsumerReferences(consumerManifest, provider);
      for (const match of matches) {
        const routeLabel = provider.kind === 'route'
          ? `${provider.route!.method} ${provider.route!.path}`
          : `${provider.procedure!.kind} ${provider.procedure!.name}`;

        const handlerName = provider.kind === 'route'
          ? provider.route!.handler
          : provider.procedure!.name;

        // Resolve output type for this endpoint
        const outputTypeName = provider.kind === 'route'
          ? provider.route!.outputType
          : provider.procedure!.outputType;

        const providerOutputType = outputTypeName
          ? findType(provider.manifest, outputTypeName)
          : makeEmptyType('unknown', provider.repoId);

        // Try to find matching type in consumer
        const consumerOutputType = outputTypeName
          ? findType(consumerManifest, outputTypeName)
          : undefined;

        const matchStatus = (providerOutputType && consumerOutputType)
          ? compareTypes(providerOutputType, consumerOutputType)
          : 'compatible'; // If types can't be resolved, assume compatible

        const bridge: ApiBridge = {
          consumer: {
            repo: consumerManifest.repoId,
            file: match.file,
            line: match.line,
          },
          provider: {
            repo: provider.repoId,
            route: routeLabel,
            handler: handlerName,
          },
          contract: {
            inputType: resolveInputType(provider),
            outputType: providerOutputType ?? makeEmptyType(outputTypeName ?? 'unknown', provider.repoId),
            matchStatus,
          },
        };

        bridges.push(bridge);
      }
    }
  }

  return bridges;
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface ProviderEndpoint {
  repoId: string;
  kind: 'route' | 'procedure';
  route: RouteDefinition | undefined;
  procedure: ProcedureDef | undefined;
  manifest: RepoManifest;
}

interface ConsumerMatch {
  file: string;
  line: number;
}

// ─── Reference Detection ────────────────────────────────────────────────────

/**
 * Find references to a provider endpoint within a consumer manifest.
 *
 * Checks exports for:
 * - URL path string literals (e.g., "/api/users")
 * - Method + path patterns (e.g., "GET /api/users")
 * - Procedure name references (e.g., "user.getProfile")
 */
function findConsumerReferences(
  consumer: RepoManifest,
  provider: ProviderEndpoint
): ConsumerMatch[] {
  const matches: ConsumerMatch[] = [];

  if (provider.kind === 'route') {
    const route = provider.route!;
    const urlPattern = route.path;
    const methodUrlPattern = `${route.method} ${route.path}`;

    for (const exp of consumer.apiSurface.exports) {
      if (
        exp.signature.includes(urlPattern) ||
        exp.signature.includes(methodUrlPattern) ||
        exp.name.includes(urlPattern)
      ) {
        matches.push({ file: exp.file, line: exp.line });
      }
    }
  }

  if (provider.kind === 'procedure') {
    const proc = provider.procedure!;
    const procName = proc.name;

    for (const exp of consumer.apiSurface.exports) {
      if (
        exp.signature.includes(procName) ||
        exp.name.includes(procName)
      ) {
        matches.push({ file: exp.file, line: exp.line });
      }
    }
  }

  return matches;
}

// ─── Type Resolution ────────────────────────────────────────────────────────

/**
 * Find a TypeDef by name in a manifest's type registry.
 */
function findType(manifest: RepoManifest, typeName: string): TypeDef | undefined {
  // Search types
  const found = manifest.typeRegistry.types.find(t => t.name === typeName);
  if (found) return found;

  // Search schemas (convert to TypeDef)
  const schema = manifest.typeRegistry.schemas.find(s => s.name === typeName);
  if (schema) {
    return {
      name: schema.name,
      fields: schema.fields,
      source: schema.source,
    };
  }

  return undefined;
}

/**
 * Resolve the input type for a provider endpoint.
 */
function resolveInputType(provider: ProviderEndpoint): TypeDef {
  const inputTypeName = provider.kind === 'route'
    ? provider.route!.inputType
    : provider.procedure!.inputType;

  if (inputTypeName) {
    const found = findType(provider.manifest, inputTypeName);
    if (found) return found;
  }

  return makeEmptyType(inputTypeName ?? 'unknown', provider.repoId);
}

/**
 * Create an empty TypeDef placeholder when the actual type is not found.
 */
function makeEmptyType(name: string, repo: string): TypeDef {
  return {
    name,
    fields: [],
    source: { repo, file: 'unknown', line: 0 },
  };
}
