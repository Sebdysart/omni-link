// engine/context/digest-formatter.ts — Human-readable ecosystem state for session injection

import * as crypto from 'crypto';
import type {
  EcosystemGraph,
  EcosystemDigest,
  OmniLinkConfig,
  RepoManifest,
  Mismatch,
  TypeLineage,
  EvolutionSuggestion,
} from '../types.js';
import { estimateTokens } from './token-pruner.js';

/**
 * Format an EcosystemGraph (typically already pruned) into a human-readable
 * EcosystemDigest and markdown string for injection into the coding session.
 *
 * @param graph                 Pruned ecosystem graph
 * @param config                Omni-link configuration
 * @param evolutionOpportunities Pre-computed evolution suggestions (computed
 *                              from the original graph before pruning)
 * @param originalRepos         Original repo manifests before token-pruning
 *                              (used so that commit history is not lost when
 *                              the pruner strips commits to fit the budget)
 */
export function formatDigest(
  graph: EcosystemGraph,
  config: OmniLinkConfig,
  evolutionOpportunities: EvolutionSuggestion[] = [],
  originalRepos?: RepoManifest[],
): { digest: EcosystemDigest; markdown: string } {
  const now = new Date().toISOString();
  const configSha = crypto
    .createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex')
    .slice(0, 12);

  // ─── Build digest data ─────────────────────────────────────────────────

  const repos = graph.repos.map(repo => ({
    name: repo.repoId,
    language: repo.language,
    branch: repo.gitState.branch,
    uncommittedCount: repo.gitState.uncommittedChanges.length,
    commitsBehind: 0, // Would require remote comparison — not available in local scan
  }));

  const contractStatus = buildContractStatus(graph);
  const conventionSummary = buildConventionSummary(graph.repos);
  const apiSurfaceSummary = buildApiSurfaceSummary(graph);
  // Use originalRepos (pre-pruning) for commit history so the token pruner
  // stripping commits from the graph doesn't produce a "0 recent commits" summary.
  const recentChangesSummary = buildRecentChangesSummary(originalRepos ?? graph.repos);

  // ─── Build markdown ────────────────────────────────────────────────────

  const sections: string[] = [];

  sections.push('# OMNI-LINK ECOSYSTEM STATE');
  sections.push(`Generated: ${now}`);
  sections.push('');

  // Repos section
  sections.push('## Repos');
  if (graph.repos.length === 0) {
    sections.push('No repos configured.');
  } else {
    for (const repo of graph.repos) {
      const changes = repo.gitState.uncommittedChanges.length;
      const changeStr = changes === 1 ? '1 uncommitted change' : `${changes} uncommitted changes`;
      sections.push(`- **${repo.repoId}** (${repo.language}) on \`${repo.gitState.branch}\` — ${changeStr}`);
    }
  }
  sections.push('');

  // API Contracts section
  sections.push('## API Contracts');
  sections.push(
    `${contractStatus.total} total: ${contractStatus.exact} exact, ${contractStatus.compatible} compatible, ${contractStatus.mismatches.length} mismatches`,
  );
  if (contractStatus.mismatches.length > 0) {
    sections.push('');
    sections.push('**Mismatches:**');
    for (const m of contractStatus.mismatches) {
      const icon = m.severity === 'breaking' ? 'BREAKING' : m.severity === 'warning' ? 'WARNING' : 'INFO';
      sections.push(`- [${icon}] ${m.description}`);
    }
  }
  sections.push('');

  // Shared Types section
  sections.push('## Shared Types');
  if (graph.sharedTypes.length === 0) {
    sections.push('No shared types detected.');
  } else {
    for (const lineage of graph.sharedTypes) {
      const repoList = lineage.instances.map(i => i.repo).join(', ');
      sections.push(`- **${lineage.concept}** (${lineage.alignment}) — present in: ${repoList}`);
      for (const inst of lineage.instances) {
        const fieldCount = inst.type.fields.length;
        sections.push(`  - ${inst.repo}: ${fieldCount} fields in \`${inst.type.source.file}\``);
      }
    }
  }
  sections.push('');

  // Recent Changes section — use originalRepos so the token pruner stripping
  // commits from the graph doesn't erase history from the markdown output.
  sections.push('## Recent Changes');
  const allCommits = (originalRepos ?? graph.repos).flatMap(repo =>
    repo.gitState.recentCommits.map(c => ({
      repo: repo.repoId,
      sha: c.sha.slice(0, 7),
      message: c.message,
      author: c.author,
      date: c.date,
    })),
  );
  if (allCommits.length === 0) {
    sections.push('No recent commits.');
  } else {
    // Sort by date descending
    allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const c of allCommits) {
      sections.push(`- \`${c.sha}\` [${c.repo}] ${c.message} (${c.author})`);
    }
  }
  sections.push('');

  // Evolution Opportunities section
  sections.push('## Evolution Opportunities');
  if (evolutionOpportunities.length === 0) {
    sections.push('No evolution suggestions at this time.');
  } else {
    for (const sug of evolutionOpportunities) {
      sections.push(`- **${sug.title}** [${sug.category}] — ${sug.description}`);
    }
  }
  sections.push('');

  // Conventions section
  sections.push('## Conventions');
  if (graph.repos.length === 0) {
    sections.push('No repos to analyze.');
  } else {
    for (const repo of graph.repos) {
      const conv = repo.conventions;
      const patterns = conv.patterns.length > 0 ? conv.patterns.join(', ') : 'none detected';
      sections.push(`- **${repo.repoId}**: naming=${conv.naming}, org=${conv.fileOrganization}, errors=${conv.errorHandling}, patterns=[${patterns}]`);
    }
  }

  // Key Type Signatures section (code quotes for grounding)
  const typeSignatures = buildKeyTypeSignatures(graph);
  if (typeSignatures) {
    sections.push('');
    sections.push(typeSignatures);
  }

  // API Route Signatures section
  const routeSignatures = buildApiRouteSignatures(graph);
  if (routeSignatures) {
    sections.push('');
    sections.push(routeSignatures);
  }

  const markdown = sections.join('\n');

  const digest: EcosystemDigest = {
    generatedAt: now,
    configSha,
    repos,
    contractStatus,
    evolutionOpportunities,
    conventionSummary,
    apiSurfaceSummary,
    recentChangesSummary,
    tokenCount: estimateTokens(markdown),
  };

  return { digest, markdown };
}

function buildKeyTypeSignatures(graph: EcosystemGraph): string {
  if (graph.sharedTypes.length === 0) return '';

  const lines: string[] = ['## Key Type Signatures', ''];

  for (const lineage of graph.sharedTypes) {
    for (const instance of lineage.instances) {
      const t = instance.type;
      lines.push(`### ${t.name} (${instance.repo})`);
      lines.push('```');
      lines.push(`interface ${t.name} {`);
      // Show up to 8 fields to keep the digest token-efficient
      const fields = t.fields.slice(0, 8);
      for (const f of fields) {
        const optional = f.optional ? '?' : '';
        lines.push(`  ${f.name}${optional}: ${f.type};`);
      }
      if (t.fields.length > 8) {
        lines.push(`  // ... ${t.fields.length - 8} more fields`);
      }
      lines.push('}');
      lines.push('```');
      lines.push(`> Source: \`${instance.repo}/${t.source.file}:${t.source.line}\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildApiRouteSignatures(graph: EcosystemGraph): string {
  const allRoutes = graph.repos.flatMap(r =>
    r.apiSurface.routes.map(route => ({ repoId: r.repoId, route })),
  );
  if (allRoutes.length === 0) return '';

  const lines: string[] = ['## API Route Signatures', ''];

  // Show up to 10 routes to keep digest compact
  for (const { repoId, route } of allRoutes.slice(0, 10)) {
    const input = route.inputType ? `  // Input: ${route.inputType}` : '';
    const output = route.outputType ? `  // Output: ${route.outputType}` : '';
    lines.push(`**${route.method} ${route.path}** — \`${repoId}/${route.file}:${route.line}\``);
    lines.push('```');
    lines.push(`handler: ${route.handler}(req, res)`);
    if (input) lines.push(input);
    if (output) lines.push(output);
    lines.push('```');
    lines.push('');
  }

  if (allRoutes.length > 10) {
    lines.push(`> ${allRoutes.length - 10} more routes omitted. Run \`/scan\` for full list.`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function buildContractStatus(graph: EcosystemGraph): {
  total: number;
  exact: number;
  compatible: number;
  mismatches: Mismatch[];
} {
  let exact = 0;
  let compatible = 0;

  for (const bridge of graph.bridges) {
    switch (bridge.contract.matchStatus) {
      case 'exact':
        exact++;
        break;
      case 'compatible':
        compatible++;
        break;
      // mismatch — counted via contractMismatches
    }
  }

  return {
    total: graph.bridges.length,
    exact,
    compatible,
    mismatches: graph.contractMismatches,
  };
}

function buildConventionSummary(repos: RepoManifest[]): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const repo of repos) {
    const c = repo.conventions;
    summary[repo.repoId] = `naming=${c.naming}, org=${c.fileOrganization}, errors=${c.errorHandling}`;
  }
  return summary;
}

function buildApiSurfaceSummary(graph: EcosystemGraph): string {
  const routeCount = graph.repos.reduce((sum, r) => sum + r.apiSurface.routes.length, 0);
  const procCount = graph.repos.reduce((sum, r) => sum + r.apiSurface.procedures.length, 0);
  const bridgeCount = graph.bridges.length;
  return `${routeCount} routes, ${procCount} procedures, ${bridgeCount} cross-repo bridges`;
}

function buildRecentChangesSummary(repos: RepoManifest[]): string {
  const totalCommits = repos.reduce((sum, r) => sum + r.gitState.recentCommits.length, 0);
  const totalUncommitted = repos.reduce((sum, r) => sum + r.gitState.uncommittedChanges.length, 0);
  return `${totalCommits} recent commits, ${totalUncommitted} uncommitted changes across ${repos.length} repos`;
}
