// engine/context/index.ts — Context builder orchestrator: scan -> prune -> format pipeline

import type {
  EcosystemGraph,
  EcosystemDigest,
  OmniLinkConfig,
} from '../types.js';

import { pruneToTokenBudget } from './token-pruner.js';
import { formatDigest } from './digest-formatter.js';

export { CacheManager } from './cache-manager.js';
export { pruneToTokenBudget, estimateTokens } from './token-pruner.js';
export type { PrunedContext } from './token-pruner.js';
export { formatDigest } from './digest-formatter.js';

/**
 * Build the final context for session injection.
 *
 * Pipeline:
 * 1. Prune graph to token budget from config
 * 2. Format digest from pruned graph
 * 3. Return digest + markdown
 */
export function buildContext(
  graph: EcosystemGraph,
  config: OmniLinkConfig,
): { digest: EcosystemDigest; markdown: string } {
  // Step 1: Prune graph to fit within the configured token budget
  const pruned = pruneToTokenBudget(
    graph,
    config.context.tokenBudget,
    config.context.prioritize,
  );

  // Step 2: Format the pruned graph into a digest + markdown
  const { digest, markdown } = formatDigest(pruned.graph, config);

  // Step 3: Return
  return { digest, markdown };
}
