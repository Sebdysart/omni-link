// engine/evolution/index.ts — Evolution orchestrator: wires gap + bottleneck + benchmark → ranked suggestions

import type { EcosystemGraph, OmniLinkConfig, EvolutionSuggestion } from '../types.js';
import { analyzeGaps } from './gap-analyzer.js';
import { findBottlenecks } from './bottleneck-finder.js';
import { benchmarkAgainstBestPractices } from './competitive-benchmarker.js';
import type { BenchmarkResult } from './competitive-benchmarker.js';
import { proposeUpgrades } from './upgrade-proposer.js';
import type { GapFinding } from './gap-analyzer.js';
import type { BottleneckFinding } from './bottleneck-finder.js';

// ─── Benchmark → BottleneckFinding Adapter ──────────────────────────────────

/**
 * Convert missing/partial benchmark results into bottleneck-style findings
 * so the upgrade proposer can process them uniformly.
 */
function benchmarkToBottleneckFindings(results: BenchmarkResult[]): BottleneckFinding[] {
  const findings: BottleneckFinding[] = [];

  for (const result of results) {
    if (result.status === 'present') continue;

    const severity = result.status === 'missing' ? 'high' as const : 'medium' as const;

    // Map benchmark category to bottleneck kind
    let kind: BottleneckFinding['kind'];
    switch (result.category) {
      case 'security':
        kind = 'unbounded-query'; // Will be mapped to 'security' category by proposer via description
        break;
      case 'performance':
        kind = 'missing-pagination';
        break;
      case 'reliability':
        kind = 'sync-in-async';
        break;
      default:
        kind = 'no-caching';
        break;
    }

    findings.push({
      kind,
      description: `[Best Practice] ${result.practice}: ${result.suggestion}`,
      repo: result.repo,
      file: '', // Benchmark findings are repo-wide
      line: 0,
      severity,
    });
  }

  return findings;
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Run the complete evolution analysis pipeline:
 * 1. Gap analyzer (incomplete CRUD, dead exports, orphaned schemas)
 * 2. Bottleneck finder (pagination, caching, rate-limiting)
 * 3. Competitive benchmarker (best practices comparison)
 * 4. Upgrade proposer (rank and merge all findings into suggestions)
 * 5. Filter by config categories
 * 6. Limit by maxSuggestionsPerSession
 */
export function analyzeEvolution(
  graph: EcosystemGraph,
  config: OmniLinkConfig,
): EvolutionSuggestion[] {
  const manifests = graph.repos;

  if (manifests.length === 0) return [];

  // Step 1: Run gap analyzer
  const gaps: GapFinding[] = analyzeGaps(manifests);

  // Step 2: Run bottleneck finder
  const bottlenecks: BottleneckFinding[] = findBottlenecks(manifests);

  // Step 3: Run competitive benchmarker
  const benchmarks: BenchmarkResult[] = benchmarkAgainstBestPractices(manifests);

  // Step 4: Convert benchmarks to bottleneck findings and merge
  const benchmarkFindings = benchmarkToBottleneckFindings(benchmarks);
  const allBottlenecks = [...bottlenecks, ...benchmarkFindings];

  // Step 5: Feed into upgrade proposer
  let suggestions = proposeUpgrades(gaps, allBottlenecks, manifests);

  // Step 6: Filter by config categories
  const allowedCategories = new Set(config.evolution.categories);
  suggestions = suggestions.filter(s => allowedCategories.has(s.category));

  // Step 7: Limit to maxSuggestionsPerSession
  const limit = config.evolution.maxSuggestionsPerSession;
  if (suggestions.length > limit) {
    suggestions = suggestions.slice(0, limit);
  }

  return suggestions;
}

// Re-export sub-modules for direct access
export { analyzeGaps } from './gap-analyzer.js';
export type { GapFinding } from './gap-analyzer.js';
export { findBottlenecks } from './bottleneck-finder.js';
export type { BottleneckFinding } from './bottleneck-finder.js';
export { proposeUpgrades } from './upgrade-proposer.js';
export { benchmarkAgainstBestPractices } from './competitive-benchmarker.js';
export type { BenchmarkResult } from './competitive-benchmarker.js';
