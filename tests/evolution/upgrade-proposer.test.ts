import { describe, it, expect } from 'vitest';
import { proposeUpgrades } from '../../engine/evolution/upgrade-proposer.js';
import type { GapFinding } from '../../engine/evolution/gap-analyzer.js';
import type { BottleneckFinding } from '../../engine/evolution/bottleneck-finder.js';
import type { RepoManifest, EvolutionSuggestion } from '../../engine/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(repoId: string): RepoManifest {
  return {
    repoId,
    path: `/repos/${repoId}`,
    language: 'typescript',
    gitState: { branch: 'main', headSha: 'abc123', uncommittedChanges: [], recentCommits: [] },
    apiSurface: { routes: [], procedures: [], exports: [] },
    typeRegistry: { types: [], schemas: [], models: [] },
    conventions: { naming: 'camelCase', fileOrganization: 'feature-based', errorHandling: 'try-catch', patterns: [], testingPatterns: 'co-located' },
    dependencies: { internal: [], external: [] },
    health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] },
  };
}

function makeGap(overrides: Partial<GapFinding> = {}): GapFinding {
  return {
    kind: overrides.kind ?? 'incomplete-crud',
    description: overrides.description ?? 'Missing DELETE for /api/users',
    repo: overrides.repo ?? 'backend',
    file: overrides.file ?? 'src/routes/users.ts',
    line: overrides.line ?? 10,
  };
}

function makeBottleneck(overrides: Partial<BottleneckFinding> = {}): BottleneckFinding {
  return {
    kind: overrides.kind ?? 'missing-pagination',
    description: overrides.description ?? 'GET /api/users has no pagination',
    repo: overrides.repo ?? 'backend',
    file: overrides.file ?? 'src/routes/users.ts',
    line: overrides.line ?? 10,
    severity: overrides.severity ?? 'high',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('proposeUpgrades', () => {
  it('generates suggestions from gap findings', () => {
    const gaps: GapFinding[] = [
      makeGap({ kind: 'incomplete-crud', description: "Resource '/api/users' has GET, POST but is missing: DELETE, PUT/PATCH" }),
    ];

    const suggestions = proposeUpgrades(gaps, [], [makeManifest('backend')]);

    expect(suggestions.length).toBeGreaterThan(0);
    const featureSuggestion = suggestions.find(s => s.category === 'feature');
    expect(featureSuggestion).toBeDefined();
    expect(featureSuggestion!.title).toBeTruthy();
    expect(featureSuggestion!.description).toBeTruthy();
    expect(featureSuggestion!.evidence.length).toBeGreaterThan(0);
    expect(featureSuggestion!.affectedRepos).toContain('backend');
  });

  it('generates suggestions from bottleneck findings', () => {
    const bottlenecks: BottleneckFinding[] = [
      makeBottleneck({ kind: 'missing-pagination', severity: 'high' }),
    ];

    const suggestions = proposeUpgrades([], bottlenecks, [makeManifest('backend')]);

    expect(suggestions.length).toBeGreaterThan(0);
    const perfSuggestion = suggestions.find(s => s.category === 'performance' || s.category === 'scale');
    expect(perfSuggestion).toBeDefined();
    expect(perfSuggestion!.estimatedImpact).toBeTruthy();
    expect(perfSuggestion!.estimatedEffort).toBeTruthy();
  });

  it('generates security suggestions from rate-limiting bottlenecks', () => {
    const bottlenecks: BottleneckFinding[] = [
      makeBottleneck({ kind: 'unbounded-query', description: '3 mutation routes found but no rate-limiting middleware detected', severity: 'high' }),
    ];

    const suggestions = proposeUpgrades([], bottlenecks, [makeManifest('backend')]);

    expect(suggestions.length).toBeGreaterThan(0);
    const secSuggestion = suggestions.find(s => s.category === 'security');
    expect(secSuggestion).toBeDefined();
  });

  it('ranks suggestions by impact (high first), then effort (small first)', () => {
    const gaps: GapFinding[] = [
      makeGap({ kind: 'dead-export', description: "Export 'deadHelper' is not imported" }),
      makeGap({ kind: 'incomplete-crud', description: "Resource '/api/users' missing DELETE" }),
    ];

    const bottlenecks: BottleneckFinding[] = [
      makeBottleneck({ kind: 'missing-pagination', severity: 'high' }),
      makeBottleneck({ kind: 'no-caching', severity: 'medium' }),
    ];

    const suggestions = proposeUpgrades(gaps, bottlenecks, [makeManifest('backend')]);

    expect(suggestions.length).toBeGreaterThanOrEqual(2);

    // Verify sorted: higher impact first
    const impactOrder = ['critical', 'high', 'medium', 'low'];
    for (let i = 1; i < suggestions.length; i++) {
      const prevImpact = impactOrder.indexOf(suggestions[i - 1].estimatedImpact);
      const currImpact = impactOrder.indexOf(suggestions[i].estimatedImpact);
      // If same impact, smaller effort should come first
      if (prevImpact === currImpact) {
        const effortOrder = ['small', 'medium', 'large'];
        const prevEffort = effortOrder.indexOf(suggestions[i - 1].estimatedEffort);
        const currEffort = effortOrder.indexOf(suggestions[i].estimatedEffort);
        expect(prevEffort).toBeLessThanOrEqual(currEffort);
      } else {
        expect(prevImpact).toBeLessThanOrEqual(currImpact);
      }
    }
  });

  it('each suggestion has all required fields', () => {
    const gaps: GapFinding[] = [makeGap()];
    const bottlenecks: BottleneckFinding[] = [makeBottleneck()];

    const suggestions = proposeUpgrades(gaps, bottlenecks, [makeManifest('backend')]);

    for (const s of suggestions) {
      expect(s.id).toBeTruthy();
      expect(typeof s.id).toBe('string');
      expect(['feature', 'performance', 'monetization', 'scale', 'security']).toContain(s.category);
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(Array.isArray(s.evidence)).toBe(true);
      expect(['small', 'medium', 'large']).toContain(s.estimatedEffort);
      expect(['low', 'medium', 'high', 'critical']).toContain(s.estimatedImpact);
      expect(Array.isArray(s.affectedRepos)).toBe(true);
      expect(s.affectedRepos.length).toBeGreaterThan(0);
    }
  });

  it('each suggestion has a unique id', () => {
    const gaps: GapFinding[] = [
      makeGap({ kind: 'incomplete-crud' }),
      makeGap({ kind: 'dead-export', description: "Export 'foo' unused", file: 'src/foo.ts', line: 5 }),
      makeGap({ kind: 'orphaned-schema', description: "Schema 'Bar' orphaned", file: 'src/schemas.ts', line: 15 }),
    ];

    const suggestions = proposeUpgrades(gaps, [], [makeManifest('backend')]);
    const ids = suggestions.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array when no findings', () => {
    const suggestions = proposeUpgrades([], [], [makeManifest('backend')]);
    expect(suggestions).toEqual([]);
  });

  it('deduplicates affectedRepos', () => {
    const gaps: GapFinding[] = [
      makeGap({ repo: 'backend', kind: 'incomplete-crud', description: "Resource '/api/users' missing DELETE" }),
    ];

    const suggestions = proposeUpgrades(gaps, [], [makeManifest('backend')]);

    for (const s of suggestions) {
      const unique = [...new Set(s.affectedRepos)];
      expect(s.affectedRepos).toEqual(unique);
    }
  });

  it('deduplicates same-practice suggestions across repos, merging affectedRepos', () => {
    // Simulate two benchmark findings for the same practice in different repos
    const bottlenecks: BottleneckFinding[] = [
      makeBottleneck({
        kind: 'unbounded-query',
        description: '[Best Practice] CORS configuration: Configure CORS headers.',
        repo: 'backend',
        severity: 'high',
      }),
      makeBottleneck({
        kind: 'unbounded-query',
        description: '[Best Practice] CORS configuration: Configure CORS headers.',
        repo: 'ios-app',
        severity: 'high',
      }),
    ];

    const suggestions = proposeUpgrades([], bottlenecks, [makeManifest('backend'), makeManifest('ios-app')]);

    // Must be exactly ONE CORS suggestion — not two
    const corsSuggestions = suggestions.filter(s =>
      s.title.toLowerCase().includes('cors') ||
      s.description.toLowerCase().includes('cors')
    );
    expect(corsSuggestions.length).toBe(1);

    // That one suggestion must reference both repos
    expect(corsSuggestions[0].affectedRepos).toContain('backend');
    expect(corsSuggestions[0].affectedRepos).toContain('ios-app');
    expect(corsSuggestions[0].affectedRepos.length).toBe(2);

    // Title must not have a repo-specific suffix when multi-repo
    expect(corsSuggestions[0].title).not.toMatch(/ in \S+$/);
  });
});
