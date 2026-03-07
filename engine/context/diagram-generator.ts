import type { EcosystemGraph } from '../types.js';

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function generateArchitectureDiagram(graph: EcosystemGraph): string {
  if (graph.repos.length === 0) {
    return '';
  }

  const lines: string[] = ['```mermaid', 'graph TD'];
  const repoNodes = new Map<string, string>();

  for (const repo of graph.repos) {
    const nodeId = sanitizeNodeId(repo.repoId);
    repoNodes.set(repo.repoId, nodeId);
    lines.push(`    ${nodeId}["${escapeLabel(repo.repoId)}"]`);
  }

  for (const bridge of graph.bridges) {
    const consumer = repoNodes.get(bridge.consumer.repo);
    const provider = repoNodes.get(bridge.provider.repo);
    if (!consumer || !provider) {
      continue;
    }

    lines.push(`    ${consumer} -->|"${escapeLabel(bridge.provider.route)}"| ${provider}`);
  }

  lines.push('```');
  return lines.join('\n');
}
