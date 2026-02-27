# Omni-Link Design Document

**Date:** 2026-02-27
**Status:** Approved
**Author:** Sebastian Dysart + Claude

## Vision

A Claude Code plugin that turns up to 4 repos into a live, grounded AI ecosystem. Built as a superpowers-compatible extension with a TypeScript analysis engine. Eliminates AI hallucinations, enforces codebase conventions, and aggressively surfaces business upgrade opportunities — all grounded in actual code reality.

## Design Decisions

- **On-demand scanning** — no background services, daemons, or watchers. Engine runs at session start and on skill invocation.
- **Superpowers-compatible** — same SKILL.md format, same hooks system, same agent format. Installs alongside superpowers without conflict.
- **TypeScript engine** — Tree-sitter AST parsing for real code intelligence. Not grep patterns.
- **SHA-indexed cache** — only rescan changed files. Warm cache < 2s for 4 repos.
- **Aggressive evolution** — every session surfaces business upgrade opportunities grounded in code findings.
- **Anti-slop blocks, not suggests** — quality gate rejects bad code, doesn't just warn.
- **Public GitHub repo + Claude Code marketplace** distribution.

## Architecture

```
omni-link/
├── .claude-plugin/
│   ├── plugin.json              # Marketplace manifest
│   └── marketplace.json
├── skills/                      # 10 skills (superpowers-compatible SKILL.md format)
│   ├── ecosystem-grounding/
│   ├── cross-repo-impact/
│   ├── anti-slop-gate/
│   ├── business-evolution/
│   ├── convention-enforcer/
│   ├── dependency-navigator/
│   ├── health-audit/
│   ├── ecosystem-planner/
│   ├── upgrade-executor/
│   └── using-omni-link/
├── agents/
│   ├── repo-analyst.md
│   ├── cross-repo-reviewer.md
│   └── evolution-strategist.md
├── commands/
│   ├── scan.md
│   ├── impact.md
│   ├── evolve.md
│   └── health.md
├── hooks/
│   ├── hooks.json
│   ├── session-start
│   └── run-hook.cmd
├── engine/
│   ├── scanner/
│   │   ├── tree-sitter.ts       # AST parsing for JS/TS/Swift/Python/Go/Rust/Java
│   │   ├── api-extractor.ts     # Extract routes, endpoints, exports, schemas
│   │   ├── type-extractor.ts    # Extract types, interfaces, protocols
│   │   └── convention-detector.ts
│   ├── grapher/
│   │   ├── dependency-graph.ts  # Cross-repo dependency mapping
│   │   ├── api-contract-map.ts  # Which repo calls which repo's APIs
│   │   ├── type-flow.ts         # Shared type lineage across repos
│   │   └── impact-analyzer.ts   # Change X → what breaks elsewhere
│   ├── context/
│   │   ├── context-builder.ts   # Build session context from scan results
│   │   ├── token-pruner.ts      # Semantic relevance pruning
│   │   ├── cache-manager.ts     # SHA-indexed scan cache
│   │   └── digest-formatter.ts  # Format context for injection
│   ├── quality/
│   │   ├── slop-detector.ts     # Detect hallucinated refs, wrong patterns
│   │   ├── convention-validator.ts
│   │   ├── reference-checker.ts # Verify every import/call/type ref exists
│   │   └── health-scorer.ts     # Code health metrics
│   ├── evolution/
│   │   ├── gap-analyzer.ts      # Missing features, incomplete flows
│   │   ├── bottleneck-finder.ts # Performance/architecture bottlenecks
│   │   ├── upgrade-proposer.ts  # Upgrade proposals with ROI
│   │   └── competitive-benchmarker.ts
│   ├── index.ts                 # Engine entry point
│   └── cli.ts                   # CLI for hook invocation
├── cache/
│   └── .gitkeep
├── config/
│   └── omni-link.example.json
├── tests/
├── docs/
│   └── plans/
├── package.json
├── tsconfig.json
└── README.md
```

## Engine Design

### Scanner Layer

Tree-sitter AST parsing for JS/TS, Swift, Python, Go, Rust, Java. Per file extracts:

- **Exports** — functions, classes, constants, types with signatures
- **Imports** — internal + external dependencies
- **API surfaces** — HTTP routes, tRPC procedures, GraphQL resolvers
- **Schemas** — Zod, TypeScript interfaces, Swift Codable structs, DB models
- **Conventions** — naming patterns, file organization, error handling, architecture

Produces a `RepoManifest` per repo:

```typescript
interface RepoManifest {
  repoId: string;
  path: string;
  language: string;
  gitState: {
    branch: string;
    headSha: string;
    uncommittedChanges: string[];
    recentCommits: CommitSummary[];
  };
  apiSurface: {
    routes: RouteDefinition[];
    procedures: ProcedureDef[];
    exports: ExportDef[];
  };
  typeRegistry: {
    types: TypeDef[];
    schemas: SchemaDef[];
    models: ModelDef[];
  };
  conventions: {
    naming: NamingConvention;
    fileOrganization: string;
    errorHandling: string;
    patterns: string[];
    testingPatterns: string;
  };
  dependencies: {
    internal: InternalDep[];
    external: PackageDep[];
  };
  health: {
    testCoverage: number | null;
    lintErrors: number;
    typeErrors: number;
    todoCount: number;
    deadCode: string[];
  };
}
```

### Grapher Layer

Builds an `EcosystemGraph` from all RepoManifests:

```typescript
interface EcosystemGraph {
  repos: RepoManifest[];
  bridges: ApiBridge[];
  sharedTypes: TypeLineage[];
  contractMismatches: Mismatch[];
  impactPaths: ImpactPath[];
}

interface ApiBridge {
  consumer: { repo: string; file: string; line: number };
  provider: { repo: string; route: string; handler: string };
  contract: {
    inputType: TypeDef;
    outputType: TypeDef;
    matchStatus: "exact" | "compatible" | "mismatch";
  };
}
```

Bridge detection matches:
- URL patterns / route names
- Type shapes across languages (TS interface <-> Swift Codable struct)
- API client method names to server route names

### Context Builder

Token-budgeted session context (default 8K tokens):
1. Priority ranking — changed files first, then dependents, then API surfaces
2. Semantic compression — summarize type mismatches rather than dump raw types
3. Staleness markers — every fact includes its git SHA for verification
4. On-demand drill-down via skills for detail beyond the digest

### Cache Manager

```
cache/
├── repos/
│   ├── <repo-name>/
│   │   ├── manifest.json
│   │   ├── files/              # Per-file, keyed by SHA
│   │   └── meta.json
│   └── ...
├── graph.json
└── digest.json
```

Invalidation: compare current file SHA to cached SHA. Only rescan changed files. Rebuild graph edges for changed files + dependents.

### Quality Gate Engine

1. **Reference Checker** — verify every import, API call, type ref against RepoManifests
2. **Convention Validator** — check against detected naming, patterns, file org
3. **Slop Detector** — pattern-match for: placeholders, hallucinated packages, over-engineering, stale patterns
4. **Cross-repo Contract Validator** — API changes validated against all consumers

### Evolution Engine

1. **Gap Analyzer** — incomplete CRUD, unconnected UI, dead routes, unused schemas
2. **Bottleneck Finder** — O(n^2) loops, N+1 patterns, missing pagination, missing indexes
3. **Upgrade Proposer** — ranked suggestions with: what, why, effort, impact, files across repos
4. **Competitive Benchmarker** — compare against best practices for detected stack

## Skills (10 Total)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `using-omni-link` | Session start (injected) | Meta skill — ground rules, digest injection, evolution posture |
| `ecosystem-grounding` | Session start, context switch | Full scan → graph → digest, state briefing, contract mismatch alerts |
| `cross-repo-impact` | Before API/schema/type changes | Ripple analysis — exact file:line impacts across all repos |
| `anti-slop-gate` | Before any code generation | Block hallucinated refs, convention violations, boilerplate, over-engineering |
| `convention-enforcer` | During code generation | Enforce detected naming, file placement, error handling, architecture patterns |
| `dependency-navigator` | Exploration queries | Cross-repo "where is X used?", dependency chains, type tracing |
| `health-audit` | `/health` command | Per-repo scores, cross-repo health, risk zones, debt inventory, trends |
| `ecosystem-planner` | Multi-repo planning | Cross-repo task ordering, coordination points, parallel subagent opportunities |
| `business-evolution` | Every session + `/evolve` | Aggressive upgrade surfacing: missing features, scale blockers, monetization gaps |
| `upgrade-executor` | Implementing approved upgrades | Coordinated cross-repo execution with contract validation at each step |

## Agents (3)

| Agent | Dispatched By | Purpose |
|-------|--------------|---------|
| `repo-analyst` | health-audit, ecosystem-grounding | Deep-dive single repo analysis |
| `cross-repo-reviewer` | cross-repo-impact, upgrade-executor | Review changes for cross-repo safety |
| `evolution-strategist` | business-evolution | Business intelligence — CTO/product strategist perspective |

## Commands (4)

| Command | Purpose |
|---------|---------|
| `/scan` | Force full ecosystem rescan |
| `/impact` | Analyze impact of uncommitted changes across all repos |
| `/evolve` | Run business evolution analysis |
| `/health` | Full ecosystem health audit |

## Configuration

`~/.claude/omni-link.json` (or per-project `.omni-link.json`):

```json
{
  "repos": [
    {
      "name": "hustlexp-ai-backend",
      "path": "/path/to/repo",
      "language": "typescript",
      "role": "backend"
    }
  ],
  "evolution": {
    "aggressiveness": "aggressive",
    "maxSuggestionsPerSession": 5,
    "categories": ["features", "performance", "monetization", "scale", "security"]
  },
  "quality": {
    "blockOnFailure": true,
    "requireTestsForNewCode": true,
    "conventionStrictness": "strict"
  },
  "context": {
    "tokenBudget": 8000,
    "prioritize": "changed-files-first",
    "includeRecentCommits": 20
  },
  "cache": {
    "directory": "~/.claude/omni-link-cache",
    "maxAgeDays": 7
  }
}
```

## Superpowers Compatibility

- Same SKILL.md format with YAML frontmatter
- Same hooks.json structure
- Same agent markdown format
- Different namespace (`omni-link:` vs `superpowers:`)
- Composable: superpowers handles TDD/debugging/planning, omni-link handles multi-repo grounding/evolution
- No skill name collisions

## What It Does NOT Do (YAGNI)

- No web dashboard or UI
- No background processes or watchers
- No cloud services or external APIs
- No database — flat file cache only
- No language server protocol
- No CI/CD integration

## Performance Targets

- Cold scan (4 repos): < 10s
- Warm cache scan: < 2s
- Context digest generation: < 1s
- Quality gate check: < 500ms per file
