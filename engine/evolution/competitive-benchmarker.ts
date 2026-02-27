// engine/evolution/competitive-benchmarker.ts — Check manifests against known best practices per stack

import type { RepoManifest } from '../types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  practice: string;
  status: 'present' | 'missing' | 'partial';
  repo: string;
  category: string;
  suggestion: string;
}

// ─── Practice Checkers ──────────────────────────────────────────────────────

type PracticeChecker = (manifest: RepoManifest) => BenchmarkResult | null;

// ─── TS/Node Backend Checks ─────────────────────────────────────────────────

const RATE_LIMIT_PACKAGES = ['express-rate-limit', 'rate-limiter-flexible', 'bottleneck', 'p-throttle'];
const RATE_LIMIT_PATTERNS = ['rate-limit', 'rate_limit', 'ratelimit', 'throttle'];

function checkRateLimiting(manifest: RepoManifest): BenchmarkResult | null {
  // Only check if the repo has routes
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    RATE_LIMIT_PACKAGES.some(pkg => d.name.toLowerCase().includes(pkg))
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    RATE_LIMIT_PATTERNS.some(rl => p.toLowerCase().includes(rl))
  );

  return {
    practice: 'Rate limiting',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add rate limiting middleware (e.g., express-rate-limit) to protect mutation endpoints from abuse.',
  };
}

function checkCors(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    d.name.toLowerCase() === 'cors' || d.name.toLowerCase().includes('cors')
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    p.toLowerCase().includes('cors')
  );

  return {
    practice: 'CORS configuration',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Configure CORS headers to control which origins can access your API.',
  };
}

const HELMET_PACKAGES = ['helmet', 'fastify-helmet'];

function checkSecurityHeaders(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    HELMET_PACKAGES.some(pkg => d.name.toLowerCase() === pkg)
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    p.toLowerCase().includes('helmet') || p.toLowerCase().includes('security-header')
  );

  return {
    practice: 'Security headers (Helmet)',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add Helmet middleware to set security-related HTTP response headers.',
  };
}

function checkErrorHandlingMiddleware(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const errorHandling = manifest.conventions.errorHandling.toLowerCase();
  const hasMiddleware = errorHandling.includes('middleware') || errorHandling.includes('error-boundary');
  const hasExport = manifest.apiSurface.exports.some(e =>
    e.name.toLowerCase().includes('error') && (e.name.toLowerCase().includes('handler') || e.name.toLowerCase().includes('middleware'))
  );

  return {
    practice: 'Error handling middleware',
    status: hasMiddleware || hasExport ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'reliability',
    suggestion: 'Add centralized error handling middleware to catch and format errors consistently.',
  };
}

const VALIDATION_PACKAGES = ['zod', 'joi', 'yup', 'class-validator', 'ajv', 'io-ts', 'superstruct'];

function checkRequestValidation(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasValidationPkg = manifest.dependencies.external.some(d =>
    VALIDATION_PACKAGES.some(pkg => d.name.toLowerCase() === pkg)
  );
  const hasSchemas = manifest.typeRegistry.schemas.length > 0;

  // Check if routes have input types
  const routesWithInput = manifest.apiSurface.routes.filter(r =>
    r.method.toUpperCase() !== 'GET' && r.method.toUpperCase() !== 'DELETE'
  );
  const routesWithValidation = routesWithInput.filter(r => r.inputType);

  if (hasValidationPkg || hasSchemas) {
    if (routesWithInput.length > 0 && routesWithValidation.length < routesWithInput.length) {
      return {
        practice: 'Request validation',
        status: 'partial',
        repo: manifest.repoId,
        category: 'security',
        suggestion: 'Some mutation routes lack input type validation. Add schema validation to all input-accepting endpoints.',
      };
    }
    return {
      practice: 'Request validation',
      status: 'present',
      repo: manifest.repoId,
      category: 'security',
      suggestion: 'Request validation is in place.',
    };
  }

  return {
    practice: 'Request validation',
    status: 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add schema validation (e.g., Zod, Joi) to validate request payloads before processing.',
  };
}

const LOGGING_PACKAGES = ['winston', 'pino', 'bunyan', 'morgan', 'log4js', 'signale'];

function checkLogging(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasPkg = manifest.dependencies.external.some(d =>
    LOGGING_PACKAGES.some(pkg => d.name.toLowerCase() === pkg)
  );
  const hasPattern = manifest.conventions.patterns.some(p =>
    p.toLowerCase().includes('logging') || p.toLowerCase().includes('logger')
  );

  return {
    practice: 'Structured logging',
    status: hasPkg || hasPattern ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'observability',
    suggestion: 'Add structured logging (e.g., Winston, Pino) for production debugging and monitoring.',
  };
}

// ─── General Best Practices ─────────────────────────────────────────────────

function checkHealthEndpoint(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const hasHealth = manifest.apiSurface.routes.some(r => {
    const path = r.path.toLowerCase();
    return path.includes('/health') || path.includes('/healthz') || path.includes('/ready') || path.includes('/status');
  });

  return {
    practice: 'Health check endpoint',
    status: hasHealth ? 'present' : 'missing',
    repo: manifest.repoId,
    category: 'reliability',
    suggestion: 'Add a /health endpoint for load balancers and orchestrators to check service availability.',
  };
}

const PAGINATION_INDICATORS = ['paginate', 'paginated', 'pagination', 'page', 'paged', 'cursor', 'offset', 'limit'];

function checkPagination(manifest: RepoManifest): BenchmarkResult | null {
  // Find list routes (GET without path params at end)
  const listRoutes = manifest.apiSurface.routes.filter(r => {
    if (r.method.toUpperCase() !== 'GET') return false;
    const segments = r.path.split('/').filter(Boolean);
    if (segments.length === 0) return false;
    const last = segments[segments.length - 1];
    return !last.startsWith(':') && !last.startsWith('{');
  });

  if (listRoutes.length === 0) return null;

  const paginatedRoutes = listRoutes.filter(r => {
    const handler = r.handler.toLowerCase();
    const output = (r.outputType ?? '').toLowerCase();
    const input = (r.inputType ?? '').toLowerCase();
    return PAGINATION_INDICATORS.some(kw =>
      handler.includes(kw) || output.includes(kw) || input.includes(kw)
    );
  });

  if (paginatedRoutes.length === listRoutes.length) {
    return {
      practice: 'Pagination on list endpoints',
      status: 'present',
      repo: manifest.repoId,
      category: 'performance',
      suggestion: 'All list endpoints implement pagination.',
    };
  }

  if (paginatedRoutes.length > 0) {
    return {
      practice: 'Pagination on list endpoints',
      status: 'partial',
      repo: manifest.repoId,
      category: 'performance',
      suggestion: `${listRoutes.length - paginatedRoutes.length} of ${listRoutes.length} list endpoints lack pagination. Add cursor or offset-based pagination.`,
    };
  }

  return {
    practice: 'Pagination on list endpoints',
    status: 'missing',
    repo: manifest.repoId,
    category: 'performance',
    suggestion: 'Add pagination to list endpoints to prevent unbounded result sets.',
  };
}

function checkApiVersioning(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.routes.length === 0) return null;

  const versionedRoutes = manifest.apiSurface.routes.filter(r =>
    /\/v\d+\//.test(r.path)
  );

  if (versionedRoutes.length === manifest.apiSurface.routes.length) {
    return {
      practice: 'API versioning',
      status: 'present',
      repo: manifest.repoId,
      category: 'maintainability',
      suggestion: 'API routes include version prefixes.',
    };
  }

  if (versionedRoutes.length > 0) {
    return {
      practice: 'API versioning',
      status: 'partial',
      repo: manifest.repoId,
      category: 'maintainability',
      suggestion: 'Some routes include version prefixes but not all. Consider consistent API versioning (e.g., /v1/).',
    };
  }

  return {
    practice: 'API versioning',
    status: 'missing',
    repo: manifest.repoId,
    category: 'maintainability',
    suggestion: 'Add API versioning (e.g., /v1/users) to allow breaking changes without disrupting consumers.',
  };
}

// ─── tRPC Checks ────────────────────────────────────────────────────────────

function checkTrpcValidation(manifest: RepoManifest): BenchmarkResult | null {
  if (manifest.apiSurface.procedures.length === 0) return null;

  const mutationProcs = manifest.apiSurface.procedures.filter(p => p.kind === 'mutation');
  const withInput = mutationProcs.filter(p => p.inputType);

  if (mutationProcs.length === 0) return null;

  if (withInput.length === mutationProcs.length) {
    return {
      practice: 'tRPC procedure validation',
      status: 'present',
      repo: manifest.repoId,
      category: 'security',
      suggestion: 'All tRPC mutation procedures have input validation.',
    };
  }

  return {
    practice: 'tRPC procedure validation',
    status: withInput.length > 0 ? 'partial' : 'missing',
    repo: manifest.repoId,
    category: 'security',
    suggestion: 'Add input validation to all tRPC mutation procedures using Zod schemas.',
  };
}

// ─── All Checkers ───────────────────────────────────────────────────────────

const ALL_CHECKERS: PracticeChecker[] = [
  checkRateLimiting,
  checkCors,
  checkSecurityHeaders,
  checkErrorHandlingMiddleware,
  checkRequestValidation,
  checkLogging,
  checkHealthEndpoint,
  checkPagination,
  checkApiVersioning,
  checkTrpcValidation,
];

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Benchmark repo manifests against known best practices per stack.
 */
export function benchmarkAgainstBestPractices(manifests: RepoManifest[]): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const manifest of manifests) {
    for (const checker of ALL_CHECKERS) {
      const result = checker(manifest);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}
