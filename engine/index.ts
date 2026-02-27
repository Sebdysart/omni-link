// engine/index.ts — Top-level orchestrator: wires scanner -> grapher -> context -> evolution -> quality

import type {
  OmniLinkConfig,
  RepoManifest,
  EcosystemGraph,
  EcosystemDigest,
  ImpactPath,
  EvolutionSuggestion,
} from './types.js';

import { scanRepo } from './scanner/index.js';
import type { FileCache } from './scanner/index.js';
import { buildEcosystemGraph } from './grapher/index.js';
import { buildContext } from './context/index.js';
import { analyzeEvolution } from './evolution/index.js';
import { analyzeImpact } from './grapher/impact-analyzer.js';
import { checkReferences } from './quality/reference-checker.js';
import { validateConventions } from './quality/convention-validator.js';
import { detectSlop } from './quality/slop-detector.js';
import { scoreEcosystemHealth } from './quality/health-scorer.js';
import { checkRules } from './quality/rule-engine.js';
import { assertNotSimulateOnly } from './quality/simulate-guard.js';
export { SimulateOnlyError } from './quality/simulate-guard.js';
import type { HealthScoreResult } from './quality/health-scorer.js';
import type { ReferenceCheckResult } from './quality/reference-checker.js';
import type { ConventionCheckResult } from './quality/convention-validator.js';
import type { SlopCheckResult } from './quality/slop-detector.js';
import type { RuleCheckResult } from './quality/rule-engine.js';

// Re-export types that callers need
export type {
  OmniLinkConfig,
  RepoManifest,
  EcosystemGraph,
  EcosystemDigest,
  ImpactPath,
  EvolutionSuggestion,
  HealthScoreResult,
  ReferenceCheckResult,
  ConventionCheckResult,
  SlopCheckResult,
  RuleCheckResult,
};

// ---- Scan Pipeline ----

export interface ScanResult {
  manifests: RepoManifest[];
  graph: EcosystemGraph;
  context: { digest: EcosystemDigest; markdown: string };
}

/**
 * Full pipeline: scan all repos -> build graph -> build context digest.
 */
export function scan(config: OmniLinkConfig): ScanResult {
  assertNotSimulateOnly(config, 'scan');
  // Shared incremental cache for this pipeline run: unchanged files are
  // parsed only once even if referenced by multiple repos.
  const fileCache: FileCache = new Map();

  // 1. Scan each repo to produce a manifest
  const manifests = config.repos.map((repo) => scanRepo(repo, fileCache));

  // 2. Build the ecosystem graph from all manifests
  const graph = buildEcosystemGraph(manifests);

  // 3. Build the context digest
  const context = buildContext(graph, config);

  return { manifests, graph, context };
}

// ---- Impact Analysis ----

/**
 * Analyze the impact of changed files across the ecosystem.
 * Scans repos, builds graph, then runs impact analysis on the provided changes.
 */
export function impact(
  config: OmniLinkConfig,
  changedFiles: Array<{ repo: string; file: string; change: string }>,
): ImpactPath[] {
  assertNotSimulateOnly(config, 'impact');
  const fileCache: FileCache = new Map();
  const manifests = config.repos.map((repo) => scanRepo(repo, fileCache));
  const graph = buildEcosystemGraph(manifests);
  return analyzeImpact(graph, changedFiles);
}

// ---- Health Scoring ----

export interface HealthResult {
  perRepo: Record<string, HealthScoreResult>;
  overall: number;
}

/**
 * Compute per-repo and ecosystem-wide health scores.
 */
export function health(config: OmniLinkConfig): HealthResult {
  assertNotSimulateOnly(config, 'health');
  const fileCache: FileCache = new Map();
  const manifests = config.repos.map((repo) => scanRepo(repo, fileCache));
  const graph = buildEcosystemGraph(manifests);
  return scoreEcosystemHealth(graph);
}

// ---- Evolution Suggestions ----

/**
 * Run the evolution analysis pipeline: gaps, bottlenecks, benchmarks -> ranked suggestions.
 */
export function evolve(config: OmniLinkConfig): EvolutionSuggestion[] {
  assertNotSimulateOnly(config, 'evolve');
  const fileCache: FileCache = new Map();
  const manifests = config.repos.map((repo) => scanRepo(repo, fileCache));
  const graph = buildEcosystemGraph(manifests);
  return analyzeEvolution(graph, config);
}

// ---- Quality Check ----

export interface QualityCheckResult {
  references: ReferenceCheckResult;
  conventions: ConventionCheckResult;
  slop: SlopCheckResult;
  rules: RuleCheckResult;
}

/**
 * Run all quality checks (reference validation, convention enforcement, slop detection)
 * against proposed code for a specific file in a specific repo.
 *
 * If no matching repo manifest is found, returns clean results for all checks.
 */
export function qualityCheck(
  code: string,
  file: string,
  config: OmniLinkConfig,
): QualityCheckResult {
  assertNotSimulateOnly(config, 'qualityCheck');
  // Find the repo this file belongs to (match by path prefix or repo name)
  const fileCache: FileCache = new Map();
  const manifests = config.repos.map((repo) => scanRepo(repo, fileCache));

  // Use the first manifest by default, or find by repo path in filename
  const manifest = manifests.find((m) => file.startsWith(m.path)) ?? manifests[0];

  if (!manifest) {
    return {
      references: { valid: true, violations: [] },
      conventions: { valid: true, violations: [] },
      slop: { clean: true, issues: [] },
      rules: { passed: true, violations: [] },
    };
  }

  const references = checkReferences(code, file, manifest);
  const conventions = validateConventions(code, file, manifest);
  const slop = detectSlop(code, manifest);
  const rules = checkRules(code, file);

  return { references, conventions, slop, rules };
}
