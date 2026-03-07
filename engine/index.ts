// engine/index.ts — Top-level orchestrator: wires scanner -> grapher -> context -> evolution -> quality

import type {
  OmniLinkConfig,
  RepoManifest,
  EcosystemGraph,
  EcosystemDigest,
  ImpactPath,
  EvolutionSuggestion,
} from './types.js';
import pLimit from 'p-limit';

import { scanRepo } from './scanner/index.js';
import type { FileCache } from './scanner/index.js';
import { CacheManager } from './context/cache-manager.js';
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

const DEFAULT_SCAN_CONCURRENCY = 4;

async function scanConfiguredRepos(config: OmniLinkConfig): Promise<RepoManifest[]> {
  const fileCache: FileCache = new Map();
  const manifestCache: CacheManager | undefined = config.cache?.directory
    ? new CacheManager(config.cache.directory)
    : undefined;

  if (manifestCache && config.cache.maxAgeDays) {
    manifestCache.pruneOld(config.cache.maxAgeDays);
  }

  const limit = pLimit(DEFAULT_SCAN_CONCURRENCY);
  return Promise.all(
    config.repos.map((repo) => limit(() => scanRepo(repo, fileCache, manifestCache))),
  );
}

/**
 * Full pipeline: scan all repos -> build graph -> build context digest.
 */
export async function scan(config: OmniLinkConfig): Promise<ScanResult> {
  assertNotSimulateOnly(config, 'scan');
  const manifests = await scanConfiguredRepos(config);

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
export async function impact(
  config: OmniLinkConfig,
  changedFiles: Array<{ repo: string; file: string; change: string }>,
): Promise<ImpactPath[]> {
  assertNotSimulateOnly(config, 'impact');
  const manifests = await scanConfiguredRepos(config);
  const graph = buildEcosystemGraph(manifests);
  return analyzeImpact(graph, changedFiles);
}

/**
 * Analyze the impact of all uncommitted changes detected across repos.
 * Auto-detects changed files from each repo's git state so callers do not
 * need to supply the changed-file list explicitly.
 *
 * Intended for CLI use where the user wants to know "what does my current
 * working-tree change break across the ecosystem?"
 */
export async function impactFromUncommitted(config: OmniLinkConfig): Promise<ImpactPath[]> {
  assertNotSimulateOnly(config, 'impact');
  const manifests = await scanConfiguredRepos(config);
  const graph = buildEcosystemGraph(manifests);
  // Collect every uncommitted file from every repo's git state
  const changedFiles = manifests.flatMap((m) =>
    m.gitState.uncommittedChanges.map((file) => ({
      repo: m.repoId,
      file,
      change: 'uncommitted' as const,
    })),
  );
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
export async function health(config: OmniLinkConfig): Promise<HealthResult> {
  assertNotSimulateOnly(config, 'health');
  const manifests = await scanConfiguredRepos(config);
  const graph = buildEcosystemGraph(manifests);
  return scoreEcosystemHealth(graph);
}

// ---- Evolution Suggestions ----

/**
 * Run the evolution analysis pipeline: gaps, bottlenecks, benchmarks -> ranked suggestions.
 */
export async function evolve(config: OmniLinkConfig): Promise<EvolutionSuggestion[]> {
  assertNotSimulateOnly(config, 'evolve');
  const manifests = await scanConfiguredRepos(config);
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
export async function qualityCheck(
  code: string,
  file: string,
  config: OmniLinkConfig,
): Promise<QualityCheckResult> {
  assertNotSimulateOnly(config, 'qualityCheck');
  // Find the repo this file belongs to (match by path prefix or repo name)
  const manifests = await scanConfiguredRepos(config);

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

  const normalizedFile = file.startsWith(manifest.path)
    ? file.slice(manifest.path.length).replace(/^[/\\]+/, '')
    : file.replace(/\\/g, '/');

  const references = checkReferences(code, normalizedFile, manifest, manifests);
  const conventions = validateConventions(code, normalizedFile, manifest);
  const slop = detectSlop(code, manifest);
  const rules = checkRules(code, normalizedFile);

  return { references, conventions, slop, rules };
}
