// engine/context/index.ts — Context builder orchestrator: scan -> prune -> format pipeline

import type {
  EcosystemGraph,
  EcosystemDigest,
  OmniLinkConfig,
} from '../types.js';

import { pruneToTokenBudget } from './token-pruner.js';
import { formatDigest } from './digest-formatter.js';
import { analyzeEvolution } from '../evolution/index.js';

export { CacheManager } from './cache-manager.js';
export { pruneToTokenBudget, estimateTokens } from './token-pruner.js';
export type { PrunedContext } from './token-pruner.js';
export { formatDigest } from './digest-formatter.js';

/**
 * Build the final context for session injection.
 *
 * Pipeline:
 * 1. Run evolution analysis against the full (unpruned) graph
 * 2. Capture original repos before pruning (so commit history survives trimming)
 * 3. Prune graph to token budget from config
 * 4. Format digest from pruned graph, injecting evolution results + original repos
 * 5. Return digest + markdown
 */
export function buildContext(
  graph: EcosystemGraph,
  config: OmniLinkConfig,
): { digest: EcosystemDigest; markdown: string } {
  // Step 1: Run evolution analysis on the full graph before any pruning.
  // analyzeEvolution() is only reachable via the separate `evolve` CLI command
  // in the old pipeline; wiring it here ensures every scan injects suggestions.
  const evolutionOpportunities = analyzeEvolution(graph, config);

  // Step 2: Snapshot the repo manifests before pruning so the token pruner
  // cannot strip commit history from the digest summary / markdown.
  const originalRepos = graph.repos;

  // Step 3: Prune graph to fit within the configured token budget
  const pruned = pruneToTokenBudget(
    graph,
    config.context.tokenBudget,
    config.context.prioritize,
  );

  // Step 4: Format the pruned graph into a digest + markdown, passing
  // the pre-computed evolution opportunities and the original repo list
  // so both Bug 1 and Bug 2 are fixed.
  const { digest, markdown } = formatDigest(
    pruned.graph,
    config,
    evolutionOpportunities,
    originalRepos,
  );

  // Step 5: Return
  return { digest, markdown };
}
