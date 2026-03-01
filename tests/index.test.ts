import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all downstream modules so we can test orchestration wiring
// without needing real repos on disk.

vi.mock('../engine/scanner/index.js', () => ({
  scanRepo: vi.fn(),
}));

vi.mock('../engine/grapher/index.js', () => ({
  buildEcosystemGraph: vi.fn(),
}));

vi.mock('../engine/context/index.js', () => ({
  buildContext: vi.fn(),
}));

vi.mock('../engine/evolution/index.js', () => ({
  analyzeEvolution: vi.fn(),
}));

vi.mock('../engine/grapher/impact-analyzer.js', () => ({
  analyzeImpact: vi.fn(),
}));

vi.mock('../engine/quality/reference-checker.js', () => ({
  checkReferences: vi.fn(),
}));

vi.mock('../engine/quality/convention-validator.js', () => ({
  validateConventions: vi.fn(),
}));

vi.mock('../engine/quality/slop-detector.js', () => ({
  detectSlop: vi.fn(),
}));

vi.mock('../engine/quality/health-scorer.js', () => ({
  scoreEcosystemHealth: vi.fn(),
}));

import { scan, impact, impactFromUncommitted, health, evolve, qualityCheck, SimulateOnlyError } from '../engine/index.js';
import { scanRepo } from '../engine/scanner/index.js';
import { buildEcosystemGraph } from '../engine/grapher/index.js';
import { buildContext } from '../engine/context/index.js';
import { analyzeEvolution } from '../engine/evolution/index.js';
import { analyzeImpact } from '../engine/grapher/impact-analyzer.js';
import { checkReferences } from '../engine/quality/reference-checker.js';
import { validateConventions } from '../engine/quality/convention-validator.js';
import { detectSlop } from '../engine/quality/slop-detector.js';
import { scoreEcosystemHealth } from '../engine/quality/health-scorer.js';

import type { OmniLinkConfig, RepoManifest, EcosystemGraph } from '../engine/types.js';

// ---- Fixtures ----

function makeConfig(repoCount = 2): OmniLinkConfig {
  const repos = Array.from({ length: repoCount }, (_, i) => ({
    name: `repo-${i}`,
    path: `/tmp/repo-${i}`,
    language: 'typescript',
    role: 'backend',
  }));

  return {
    repos,
    evolution: {
      aggressiveness: 'moderate',
      maxSuggestionsPerSession: 5,
      categories: ['features', 'performance'],
    },
    quality: {
      blockOnFailure: true,
      requireTestsForNewCode: true,
      conventionStrictness: 'strict',
    },
    context: {
      tokenBudget: 8000,
      prioritize: 'changed-files-first',
      includeRecentCommits: 20,
    },
    cache: {
      directory: '/tmp/cache',
      maxAgeDays: 7,
    },
  };
}

function makeManifest(repoId: string): RepoManifest {
  return {
    repoId,
    path: `/tmp/${repoId}`,
    language: 'typescript',
    gitState: {
      branch: 'main',
      headSha: 'abc123',
      uncommittedChanges: [],
      recentCommits: [],
    },
    apiSurface: { routes: [], procedures: [], exports: [] },
    typeRegistry: { types: [], schemas: [], models: [] },
    conventions: {
      naming: 'camelCase',
      fileOrganization: 'by-feature',
      errorHandling: 'try-catch',
      patterns: [],
      testingPatterns: 'separate-directory',
    },
    dependencies: { internal: [], external: [] },
    health: {
      testCoverage: null,
      lintErrors: 0,
      typeErrors: 0,
      todoCount: 0,
      deadCode: [],
    },
  };
}

function makeGraph(manifests: RepoManifest[]): EcosystemGraph {
  return {
    repos: manifests,
    bridges: [],
    sharedTypes: [],
    contractMismatches: [],
    impactPaths: [],
  };
}

// ---- Tests ----

describe('engine/index — scan()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans each repo, builds graph, and builds context', () => {
    const config = makeConfig(2);
    const m0 = makeManifest('repo-0');
    const m1 = makeManifest('repo-1');
    const graph = makeGraph([m0, m1]);
    const digest = {
      generatedAt: '',
      configSha: '',
      repos: [],
      contractStatus: { total: 0, exact: 0, compatible: 0, mismatches: [] },
      evolutionOpportunities: [],
      conventionSummary: {},
      apiSurfaceSummary: '',
      recentChangesSummary: '',
      tokenCount: 0,
    };

    vi.mocked(scanRepo)
      .mockReturnValueOnce(m0)
      .mockReturnValueOnce(m1);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(buildContext).mockReturnValue({ digest, markdown: '# Digest' });

    const result = scan(config);

    // Scanner called once per repo, with the shared fileCache Map
    expect(scanRepo).toHaveBeenCalledTimes(2);
    expect(scanRepo).toHaveBeenCalledWith(config.repos[0], expect.any(Map));
    expect(scanRepo).toHaveBeenCalledWith(config.repos[1], expect.any(Map));

    // Grapher receives all manifests
    expect(buildEcosystemGraph).toHaveBeenCalledWith([m0, m1]);

    // Context builder receives graph + config
    expect(buildContext).toHaveBeenCalledWith(graph, config);

    // Result structure
    expect(result.manifests).toEqual([m0, m1]);
    expect(result.graph).toBe(graph);
    expect(result.context.digest).toBe(digest);
    expect(result.context.markdown).toBe('# Digest');
  });
});

describe('engine/index — impact()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans repos, builds graph, then runs impact analysis on changed files', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');
    const graph = makeGraph([m0]);
    const changedFiles = [{ repo: 'repo-0', file: 'src/index.ts', change: 'type-change' }];
    const impactPaths = [
      {
        trigger: changedFiles[0],
        affected: [{ repo: 'repo-0', file: 'src/other.ts', line: 10, reason: 'imports', severity: 'breaking' as const }],
      },
    ];

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(analyzeImpact).mockReturnValue(impactPaths);

    const result = impact(config, changedFiles);

    expect(scanRepo).toHaveBeenCalledTimes(1);
    expect(buildEcosystemGraph).toHaveBeenCalledWith([m0]);
    expect(analyzeImpact).toHaveBeenCalledWith(graph, changedFiles);
    expect(result).toBe(impactPaths);
  });
});

describe('engine/index — health()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans repos, builds graph, then scores ecosystem health', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');
    const graph = makeGraph([m0]);
    const healthResult = {
      perRepo: { 'repo-0': { todoScore: 100, deadCodeScore: 100, testScore: 40, qualityScore: 100, overall: 82 } },
      overall: 82,
    };

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(scoreEcosystemHealth).mockReturnValue(healthResult);

    const result = health(config);

    expect(scanRepo).toHaveBeenCalledTimes(1);
    expect(buildEcosystemGraph).toHaveBeenCalledWith([m0]);
    expect(scoreEcosystemHealth).toHaveBeenCalledWith(graph);
    expect(result).toBe(healthResult);
  });
});

describe('engine/index — evolve()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans repos, builds graph, then runs evolution analysis', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');
    const graph = makeGraph([m0]);
    const suggestions = [
      {
        id: 'sug-1',
        category: 'features' as const,
        title: 'Add pagination',
        description: 'Missing pagination on /api/users',
        evidence: [],
        estimatedEffort: 'small' as const,
        estimatedImpact: 'medium' as const,
        affectedRepos: ['repo-0'],
      },
    ];

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(analyzeEvolution).mockReturnValue(suggestions);

    const result = evolve(config);

    expect(scanRepo).toHaveBeenCalledTimes(1);
    expect(buildEcosystemGraph).toHaveBeenCalledWith([m0]);
    expect(analyzeEvolution).toHaveBeenCalledWith(graph, config);
    expect(result).toBe(suggestions);
  });
});

describe('engine/index — impactFromUncommitted()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-detects uncommitted changes from manifest git state and runs impact analysis', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');
    // Simulate repo-0 having two uncommitted files
    m0.gitState.uncommittedChanges = ['src/api.ts', 'src/types.ts'];

    const graph = makeGraph([m0]);
    const impactPaths = [
      {
        trigger: { repo: 'repo-0', file: 'src/api.ts', change: 'uncommitted' },
        affected: [{ repo: 'repo-0', file: 'src/consumer.ts', line: 5, reason: 'imports', severity: 'warning' as const }],
      },
    ];

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(analyzeImpact).mockReturnValue(impactPaths);

    const result = impactFromUncommitted(config);

    expect(scanRepo).toHaveBeenCalledTimes(1);
    expect(buildEcosystemGraph).toHaveBeenCalledWith([m0]);
    // analyzeImpact must receive the auto-detected changedFiles (both uncommitted files)
    expect(analyzeImpact).toHaveBeenCalledWith(
      graph,
      expect.arrayContaining([
        expect.objectContaining({ repo: 'repo-0', file: 'src/api.ts', change: 'uncommitted' }),
        expect.objectContaining({ repo: 'repo-0', file: 'src/types.ts', change: 'uncommitted' }),
      ]),
    );
    expect(result).toBe(impactPaths);
  });

  it('returns empty array when no uncommitted changes exist', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');
    // No uncommitted changes
    m0.gitState.uncommittedChanges = [];

    const graph = makeGraph([m0]);

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(buildEcosystemGraph).mockReturnValue(graph);
    vi.mocked(analyzeImpact).mockReturnValue([]);

    const result = impactFromUncommitted(config);

    expect(analyzeImpact).toHaveBeenCalledWith(graph, []);
    expect(result).toEqual([]);
  });
});

describe('engine/index — qualityCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans repos and runs all three quality checks against the first matching manifest', () => {
    const config = makeConfig(1);
    const m0 = makeManifest('repo-0');

    const refResult = { valid: true, violations: [] };
    const convResult = { valid: true, violations: [] };
    const slopResult = { clean: true, issues: [] };

    vi.mocked(scanRepo).mockReturnValue(m0);
    vi.mocked(checkReferences).mockReturnValue(refResult);
    vi.mocked(validateConventions).mockReturnValue(convResult);
    vi.mocked(detectSlop).mockReturnValue(slopResult);

    const code = 'const x = 1;';
    const file = 'src/index.ts';
    const result = qualityCheck(code, file, config);

    expect(scanRepo).toHaveBeenCalledTimes(1);
    expect(checkReferences).toHaveBeenCalledWith(code, file, m0);
    expect(validateConventions).toHaveBeenCalledWith(code, file, m0);
    expect(detectSlop).toHaveBeenCalledWith(code, m0);

    expect(result.references).toBe(refResult);
    expect(result.conventions).toBe(convResult);
    expect(result.slop).toBe(slopResult);
    // Rule engine is wired — rules field must be present
    expect(result.rules).toBeDefined();
    expect(typeof result.rules.passed).toBe('boolean');
    expect(Array.isArray(result.rules.violations)).toBe(true);
  });

  it('returns clean results when no repos configured', () => {
    const config = makeConfig(0);
    // scanRepo won't be called for 0 repos

    const result = qualityCheck('const x = 1;', 'test.ts', config);

    expect(result.references.valid).toBe(true);
    expect(result.conventions.valid).toBe(true);
    expect(result.slop.clean).toBe(true);
  });
});

describe('engine/index — simulateOnly guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const simulateConfig = (): OmniLinkConfig => ({ ...makeConfig(1), simulateOnly: true });

  it('scan() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => scan(simulateConfig())).toThrow(SimulateOnlyError);
  });

  it('impact() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => impact(simulateConfig(), [])).toThrow(SimulateOnlyError);
  });

  it('impactFromUncommitted() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => impactFromUncommitted(simulateConfig())).toThrow(SimulateOnlyError);
  });

  it('health() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => health(simulateConfig())).toThrow(SimulateOnlyError);
  });

  it('evolve() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => evolve(simulateConfig())).toThrow(SimulateOnlyError);
  });

  it('qualityCheck() throws SimulateOnlyError when simulateOnly is true', () => {
    expect(() => qualityCheck('const x = 1;', 'src/index.ts', simulateConfig())).toThrow(SimulateOnlyError);
  });
});
