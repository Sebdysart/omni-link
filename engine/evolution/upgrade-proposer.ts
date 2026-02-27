// engine/evolution/upgrade-proposer.ts — Generate ranked EvolutionSuggestions from gap + bottleneck findings

import type { RepoManifest, EvolutionSuggestion } from '../types.js';
import type { GapFinding } from './gap-analyzer.js';
import type { BottleneckFinding } from './bottleneck-finder.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

const IMPACT_ORDER: Record<EvolutionSuggestion['estimatedImpact'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const EFFORT_ORDER: Record<EvolutionSuggestion['estimatedEffort'], number> = {
  small: 0,
  medium: 1,
  large: 2,
};

function sortSuggestions(suggestions: EvolutionSuggestion[]): EvolutionSuggestion[] {
  return suggestions.sort((a, b) => {
    const impactDiff = IMPACT_ORDER[a.estimatedImpact] - IMPACT_ORDER[b.estimatedImpact];
    if (impactDiff !== 0) return impactDiff;
    return EFFORT_ORDER[a.estimatedEffort] - EFFORT_ORDER[b.estimatedEffort];
  });
}

// ─── Gap → Suggestion Mapping ───────────────────────────────────────────────

function gapToCategory(gap: GapFinding): EvolutionSuggestion['category'] {
  switch (gap.kind) {
    case 'incomplete-crud':
      return 'feature';
    case 'dead-route':
      return 'feature';
    case 'dead-export':
      return 'feature';
    case 'orphaned-schema':
      return 'feature';
    default:
      return 'feature';
  }
}

function gapToImpact(gap: GapFinding): EvolutionSuggestion['estimatedImpact'] {
  switch (gap.kind) {
    case 'incomplete-crud':
      return 'medium';
    case 'dead-route':
      return 'low';
    case 'dead-export':
      return 'low';
    case 'orphaned-schema':
      return 'low';
    default:
      return 'low';
  }
}

function gapToEffort(gap: GapFinding): EvolutionSuggestion['estimatedEffort'] {
  switch (gap.kind) {
    case 'incomplete-crud':
      return 'medium';
    case 'dead-route':
      return 'small';
    case 'dead-export':
      return 'small';
    case 'orphaned-schema':
      return 'small';
    default:
      return 'small';
  }
}

function gapToTitle(gap: GapFinding): string {
  switch (gap.kind) {
    case 'incomplete-crud':
      return `Complete CRUD operations for resource in ${gap.repo}`;
    case 'dead-route':
      return `Remove or wire dead route in ${gap.repo}`;
    case 'dead-export':
      return `Clean up unused export in ${gap.repo}`;
    case 'orphaned-schema':
      return `Wire or remove orphaned schema in ${gap.repo}`;
    default:
      return `Address gap in ${gap.repo}`;
  }
}

function gapToDescription(gap: GapFinding): string {
  switch (gap.kind) {
    case 'incomplete-crud':
      return `${gap.description}. Adding the missing operations will provide a complete API for consumers and follow REST best practices.`;
    case 'dead-route':
      return `${gap.description}. Dead routes add confusion and may indicate incomplete feature implementation.`;
    case 'dead-export':
      return `${gap.description}. Dead exports increase bundle size and cognitive load. Remove or integrate into the codebase.`;
    case 'orphaned-schema':
      return `${gap.description}. Orphaned schemas suggest incomplete validation coverage or leftover refactoring artifacts.`;
    default:
      return gap.description;
  }
}

function gapToSuggestion(gap: GapFinding): EvolutionSuggestion {
  return {
    id: nextId('gap'),
    category: gapToCategory(gap),
    title: gapToTitle(gap),
    description: gapToDescription(gap),
    evidence: [
      {
        repo: gap.repo,
        file: gap.file,
        line: gap.line,
        finding: gap.description,
      },
    ],
    estimatedEffort: gapToEffort(gap),
    estimatedImpact: gapToImpact(gap),
    affectedRepos: [gap.repo],
  };
}

// ─── Bottleneck → Suggestion Mapping ────────────────────────────────────────

function bottleneckToCategory(bn: BottleneckFinding): EvolutionSuggestion['category'] {
  switch (bn.kind) {
    case 'missing-pagination':
      return 'scale';
    case 'unbounded-query':
      // Rate-limiting is a security concern
      if (bn.description.toLowerCase().includes('rate')) return 'security';
      return 'performance';
    case 'no-caching':
      return 'performance';
    case 'sync-in-async':
      return 'performance';
    default:
      return 'performance';
  }
}

function bottleneckToImpact(bn: BottleneckFinding): EvolutionSuggestion['estimatedImpact'] {
  switch (bn.severity) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

function bottleneckToEffort(bn: BottleneckFinding): EvolutionSuggestion['estimatedEffort'] {
  switch (bn.kind) {
    case 'missing-pagination':
      return 'medium';
    case 'unbounded-query':
      return 'small';
    case 'no-caching':
      return 'medium';
    case 'sync-in-async':
      return 'medium';
    default:
      return 'medium';
  }
}

function bottleneckToTitle(bn: BottleneckFinding): string {
  switch (bn.kind) {
    case 'missing-pagination':
      return `Add pagination to list endpoints in ${bn.repo}`;
    case 'unbounded-query':
      if (bn.description.toLowerCase().includes('rate')) {
        return `Add rate-limiting middleware in ${bn.repo}`;
      }
      return `Add query bounds to prevent unbounded results in ${bn.repo}`;
    case 'no-caching':
      return `Implement caching strategy for ${bn.repo}`;
    case 'sync-in-async':
      return `Replace synchronous operations in async context in ${bn.repo}`;
    default:
      return `Address performance bottleneck in ${bn.repo}`;
  }
}

function bottleneckToDescription(bn: BottleneckFinding): string {
  switch (bn.kind) {
    case 'missing-pagination':
      return `${bn.description}. Without pagination, list endpoints can return unbounded data, causing memory pressure and slow response times at scale.`;
    case 'unbounded-query':
      if (bn.description.toLowerCase().includes('rate')) {
        return `${bn.description}. Without rate limiting, mutation endpoints are vulnerable to abuse and can overwhelm the database.`;
      }
      return `${bn.description}. Unbounded queries can cause memory exhaustion and slow response times under load.`;
    case 'no-caching':
      return `${bn.description}. Adding caching (in-memory, Redis, or CDN) can dramatically reduce latency and database load for read-heavy resources.`;
    case 'sync-in-async':
      return `${bn.description}. Synchronous operations in async contexts block the event loop and degrade throughput.`;
    default:
      return bn.description;
  }
}

function bottleneckToSuggestion(bn: BottleneckFinding): EvolutionSuggestion {
  return {
    id: nextId('perf'),
    category: bottleneckToCategory(bn),
    title: bottleneckToTitle(bn),
    description: bottleneckToDescription(bn),
    evidence: [
      {
        repo: bn.repo,
        file: bn.file,
        line: bn.line,
        finding: bn.description,
      },
    ],
    estimatedEffort: bottleneckToEffort(bn),
    estimatedImpact: bottleneckToImpact(bn),
    affectedRepos: [bn.repo],
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Generate ranked EvolutionSuggestions from gap and bottleneck findings.
 */
export function proposeUpgrades(
  gaps: GapFinding[],
  bottlenecks: BottleneckFinding[],
  _manifests: RepoManifest[],
): EvolutionSuggestion[] {
  // Reset counter for deterministic IDs within a single call
  idCounter = 0;

  const suggestions: EvolutionSuggestion[] = [];

  for (const gap of gaps) {
    suggestions.push(gapToSuggestion(gap));
  }

  for (const bn of bottlenecks) {
    suggestions.push(bottleneckToSuggestion(bn));
  }

  return sortSuggestions(suggestions);
}
