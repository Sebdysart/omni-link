# omni-link

**Local-first multi-repo engineering control plane for Claude Code** -- semantic cross-repo analysis, PR/MR intelligence, bounded automation, policy enforcement, and ecosystem-level evolution.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![Verification](https://img.shields.io/badge/verify:stress-passing-brightgreen.svg)](#verification)
[![Tests](https://img.shields.io/badge/tests-488%2B4_live-brightgreen.svg)](#verification)

## What it does

omni-link scans up to 10 repositories, builds a branch-aware ecosystem graph of APIs, types, dependencies, ownership, runtime signals, and policy state, then uses that graph to drive scans, impact analysis, health scoring, PR/MR review artifacts, provider publishing, and bounded execution planning.

This is not just a repo scanner. In max-tier mode, omni-link behaves like a local-first ecosystem control plane:

- It keeps warm state in a SQLite-backed daemon instead of rescanning everything on every command.
- It combines parser coverage with compiler-backed semantic analysis for TypeScript, Go, Python, Java, and Swift, plus AST-backed GraphQL analysis.
- It generates branch-aware review artifacts with risk, owners, policy decisions, and rollback-aware execution plans.
- It publishes or replays provider-native review output for GitHub and GitLab with live metadata negotiation and idempotent comment updates.
- It keeps automation bounded: branch and PR oriented, policy gated, and auditable.

## Why it is different

- **Cross-repo truth, not single-repo guesses** -- omni-link reasons over the ecosystem graph, not just one working directory.
- **Semantic where it matters** -- compiler-backed analysis is used where available, with structured fallback where necessary.
- **Operationally safe** -- direct protected-branch mutation is blocked, execution is policy-gated, and rollback plans are always generated.
- **Provider-aware** -- GitHub and GitLab publishing is capability-aware, metadata-aware, and proven against live sandbox PR/MR targets.
- **Proven, not hypothetical** -- the repo ships with contract fixtures, smoke tests, stress tests, packaged-install tests, and live-provider gates.

## Features

- **Hybrid truth layer** -- Tree-sitter fallback plus compiler-backed TypeScript, Go, Python, Java, and Swift analyzers, plus GraphQL AST analysis with provenance and confidence.
- **Branch-aware daemon state** -- SQLite-backed warm graph snapshots keyed by config and branch/worktree signature.
- **Cross-repo API and type graphing** -- Routes, procedures, contracts, imports, symbol references, type lineage, dependency edges, and impact paths.
- **Runtime-aware ranking** -- Coverage, test, OpenAPI, GraphQL, telemetry, and trace artifacts can influence health and prioritization.
- **Ownership and policy engine** -- Repo, path, API, and package-level ownership plus protected-branch and risk gating.
- **Review artifact pipeline** -- `review-pr` emits risk, owners, policy decisions, contract mismatches, and execution plans.
- **Provider publishing** -- `publish-review` supports dry-run, replay, GitHub, and GitLab transports with capability negotiation and live metadata hydration.
- **Idempotent provider comments** -- repeated publish runs update the existing omni-link review comment instead of spraying duplicates.
- **Bounded execution** -- `apply` and `rollback` stay branch-oriented, emit rollback plans, and now produce an execution ledger for auditability.
- **Contract-locked CLI surface** -- JSON and markdown outputs are pinned by fixture tests so public command drift is deliberate.
- **Packaged artifact validation** -- the built tarball is installed into a temp project and exercised from `node_modules`.
- **Polyglot stress coverage** -- the comprehensive stress harness exercises TypeScript, Go, Python, GraphQL, Java, and Swift together.

## Verification

The current repository state is validated by `npm run verify:stress`, which includes lint, typecheck, unit/integration tests, coverage, build, CLI smoke, max-tier smoke, contract fixtures, package-install smoke, full stress, and live-provider gates when credentials are configured.

Current proof points from the verified state:

- `488` core tests passing, plus live GitHub and GitLab provider tests executed in sandbox PR/MR flows
- `90.6%` statement coverage
- `0` moderate-or-higher audit vulnerabilities
- Live GitHub and GitLab metadata fetch plus publish validated through sandbox review targets
- Cleanup verified: sandbox PRs/MRs are closed and temporary branches are deleted
- Polyglot stress harness validated across `8` repos and `6` languages in one engine run

## Installation

### From the marketplace

```bash
claude plugin install omni-link
```

### Manual installation

```bash
git clone https://github.com/Sebdysart/omni-link.git
cd omni-link
npm install
npm run build
```

## Configuration

Create a `.omni-link.json` in your project root or `~/.claude/omni-link.json` for global config:

```json
{
  "reviewProvider": "github",
  "repos": [
    {
      "name": "my-backend",
      "path": "/path/to/backend",
      "language": "typescript",
      "role": "backend"
    },
    {
      "name": "my-ios-app",
      "path": "/path/to/ios",
      "language": "swift",
      "role": "ios"
    }
  ],
  "evolution": {
    "aggressiveness": "aggressive",
    "maxSuggestionsPerSession": 5,
    "categories": ["feature", "performance", "monetization", "scale", "security"]
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
  },
  "daemon": {
    "enabled": true,
    "preferDaemon": true,
    "statePath": "~/.claude/omni-link-daemon-state.sqlite"
  },
  "github": {
    "enabled": true,
    "owner": "acme",
    "repo": "platform",
    "artifactPath": ".omni-link/review-artifact.json",
    "publishMode": "replay",
    "replayDirectory": ".omni-link/provider-replay"
  },
  "gitlab": {
    "enabled": true,
    "namespace": "acme",
    "project": "platform",
    "artifactPath": ".omni-link/review-artifact.gitlab.json",
    "publishMode": "replay",
    "replayDirectory": ".omni-link/provider-replay"
  },
  "ownership": {
    "enabled": true,
    "defaultOwner": "platform-team",
    "rules": [{ "owner": "backend-team", "kind": "team", "scope": "repo", "repo": "my-backend" }]
  },
  "runtime": {
    "enabled": true,
    "coverageSummaryPath": "coverage/coverage-summary.json",
    "testResultsPath": "test-results.json"
  },
  "policies": {
    "enabled": true,
    "protectedBranches": ["main"],
    "maxAllowedRisk": "high",
    "forbidDirectMainMutation": true
  },
  "maxTier": {
    "enabled": true,
    "semanticAnalysis": {
      "enabled": true,
      "preferSemantic": true
    }
  }
}
```

### Config options

| Section     | Key                          | Values                                                                                | Default                     | Description                                                  |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| root        | `reviewProvider`             | `github`, `gitlab`                                                                    | `github`                    | Selects the active review/publish provider                   |
| `repos[]`   | `name`                       | string                                                                                | --                          | Unique repo identifier                                       |
| `repos[]`   | `path`                       | string                                                                                | --                          | Absolute path to repo root                                   |
| `repos[]`   | `language`                   | `typescript`, `tsx`, `swift`, `python`, `go`, `rust`, `java`, `javascript`, `graphql` | --                          | Primary language                                             |
| `repos[]`   | `role`                       | string                                                                                | --                          | Repo's role in the ecosystem (e.g., `backend`, `ios`, `web`) |
| `evolution` | `aggressiveness`             | `aggressive`, `moderate`, `on-demand`                                                 | `aggressive`                | How proactively to surface suggestions                       |
| `evolution` | `maxSuggestionsPerSession`   | number                                                                                | `5`                         | Cap on evolution suggestions per session                     |
| `evolution` | `categories`                 | array of strings                                                                      | all 5                       | Which categories to include                                  |
| `quality`   | `blockOnFailure`             | boolean                                                                               | `true`                      | Whether quality violations block output                      |
| `quality`   | `requireTestsForNewCode`     | boolean                                                                               | `true`                      | Require test coverage for new code                           |
| `quality`   | `conventionStrictness`       | `strict`, `moderate`, `relaxed`                                                       | `strict`                    | How strictly to enforce conventions                          |
| `context`   | `tokenBudget`                | number                                                                                | `8000`                      | Max tokens for context digest                                |
| `context`   | `prioritize`                 | `changed-files-first`, `api-surface-first`                                            | `changed-files-first`       | What to prioritize in digest                                 |
| `context`   | `includeRecentCommits`       | number                                                                                | `20`                        | How many recent commits to include                           |
| `cache`     | `directory`                  | string                                                                                | `~/.claude/omni-link-cache` | Cache directory path                                         |
| `cache`     | `maxAgeDays`                 | number                                                                                | `7`                         | Cache TTL in days                                            |
| `daemon`    | `enabled` / `preferDaemon`   | booleans                                                                              | `false`                     | Enable warm graph state and prefer daemon-backed reads       |
| `daemon`    | `statePath`                  | string                                                                                | cache-relative path         | Persistent SQLite daemon state file                          |
| `github`    | `owner` / `repo`             | strings                                                                               | unset                       | Provider target used by `publish-review`                     |
| `github`    | `publishMode`                | `dry-run`, `replay`, `github`                                                         | `dry-run`                   | Choose provider publish behavior                             |
| `github`    | `replayDirectory` / `apiUrl` | strings                                                                               | provider defaults           | Replay output location or GitHub API endpoint                |
| `gitlab`    | `namespace` / `project`      | strings                                                                               | unset                       | Provider target used when `reviewProvider=gitlab`            |
| `gitlab`    | `publishMode`                | `dry-run`, `replay`, `gitlab`                                                         | `dry-run`                   | Choose provider publish behavior                             |
| `gitlab`    | `replayDirectory` / `apiUrl` | strings                                                                               | provider defaults           | Replay output location or GitLab API endpoint                |
| `ownership` | `defaultOwner` / `rules[]`   | owner mappings by repo, path, API, or package                                         | disabled                    | Resolve ownership across repos and API surfaces              |
| `runtime`   | artifact paths               | strings                                                                               | disabled                    | Ingest coverage, test, OpenAPI, GraphQL, telemetry artifacts |
| `policies`  | branch/risk rules            | arrays + booleans + risk threshold                                                    | disabled                    | Gate execution and protected-branch behavior                 |
| `maxTier`   | semantic / execution flags   | booleans + thresholds                                                                 | disabled                    | Enable semantic accuracy and max-tier platform modules       |

## Skills

Skills are contextual instructions that guide Claude Code's behavior within the omni-link ecosystem.

| Skill                  | Trigger                     | Purpose                                                                           |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| `using-omni-link`      | Session start               | Meta skill defining iron laws, skill registry, and aggressive evolution posture   |
| `ecosystem-grounding`  | Session start, after rescan | Ground Claude in current ecosystem state: repos, contracts, mismatches            |
| `anti-slop-gate`       | Code generation             | Block hallucinated imports, unknown packages, wrong conventions, placeholder code |
| `convention-enforcer`  | Code generation             | Enforce naming, file organization, error handling, and testing conventions        |
| `cross-repo-impact`    | Before API/schema changes   | Analyze ripple effects of changes across all configured repositories              |
| `dependency-navigator` | On demand                   | Trace dependency chains, answer "Where is X used?" across repos                   |
| `ecosystem-planner`    | Multi-repo feature planning | Plan task ordering, coordination points, and contract validation checkpoints      |
| `health-audit`         | On demand                   | Produce per-repo and overall health scores with actionable recommendations        |
| `business-evolution`   | Session start, `/evolve`    | Surface business improvement opportunities backed by codebase evidence            |
| `upgrade-executor`     | Multi-repo changes          | Orchestrate provider-first ordering, contract validation, and rollback planning   |

## Commands

Commands are slash commands available in Claude Code.

| Command           | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `/scan`           | Force a full ecosystem rescan across all configured repos              |
| `/impact`         | Analyze cross-repo impact of uncommitted changes or branch diffs       |
| `/health`         | Run a full ecosystem health audit with per-repo scores                 |
| `/evolve`         | Generate ranked evolution suggestions with evidence                    |
| `/watch`          | Refresh or maintain daemon-backed ecosystem state                      |
| `/owners`         | Resolve ownership assignments across repos and APIs                    |
| `/review-pr`      | Generate a PR review artifact with risk, owners, and execution plan    |
| `/publish-review` | Publish or replay provider comments/checks for a saved review artifact |
| `/apply`          | Apply the bounded execution plan on generated branches/PRs             |
| `/rollback`       | Roll back the last generated execution plan                            |

## Agents

Specialized agents for focused analysis tasks.

| Agent                  | Description                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `repo-analyst`         | Deep-dive single-repo analysis: structure, dependencies, dead code, test coverage, health             |
| `cross-repo-reviewer`  | Reviews changes for cross-repo safety: API contracts, type lineage, dependency compatibility          |
| `evolution-strategist` | CTO/product strategist perspective: industry best practices, competitive analysis, strategic roadmaps |

## Architecture

omni-link is built as a layered pipeline:

```
.omni-link.json
     |
     v
+-----------+     +----------+     +---------+     +-----------+     +----------+
|  Scanner  | --> | Grapher  | --> | Context | --> |  Quality  | --> | Evolution|
+-----------+     +----------+     +---------+     +-----------+     +----------+
```

### Engine layers

1. **Scanner** (`engine/scanner/`) -- Tree-sitter-powered parsing that walks each repo and extracts exports, routes, tRPC procedures, types, schemas, conventions, dependencies, and git state into a `RepoManifest`.

2. **Grapher** (`engine/grapher/`) -- Cross-repo analysis that builds an `EcosystemGraph` from all manifests: API bridges (provider/consumer connections), type lineage (shared concepts across repos), contract mismatches, dependency graphs, and impact paths.

3. **Context** (`engine/context/`) -- Token-budgeted context generation: prunes the ecosystem graph to fit within the configured token budget, formats a human-readable digest, and manages scan caching.

4. **Quality** (`engine/quality/`) -- Enforcement layer with four gates: reference checker (validates imports and symbols), convention validator (naming, organization, patterns), slop detector (placeholder code, hallucinations), and health scorer (per-repo and overall scores).

5. **Evolution** (`engine/evolution/`) -- Business intelligence: gap analyzer (incomplete CRUD, dead exports, orphaned schemas), bottleneck finder (pagination, caching, rate-limiting), competitive benchmarker (best practices comparison), and upgrade proposer (ranked suggestions with evidence).

### Key types

- `RepoManifest` -- Complete snapshot of a single repo's code structure
- `EcosystemGraph` -- Cross-repo relationship graph with bridges, types, and mismatches
- `EcosystemDigest` -- Token-budgeted summary for session injection
- `EvolutionSuggestion` -- Ranked improvement proposal with evidence and effort estimates

## Compatibility

omni-link works alongside Claude Code Superpowers and other plugins without conflicts. It operates through standard plugin extension points (skills, commands, agents, hooks) and does not modify Claude Code's core behavior.

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run coverage

```bash
npm run test:coverage
```

### Run tests in watch mode

```bash
npm run test:watch
```

### Type check

```bash
npm run lint
npm run format:check
```

### Full verification

```bash
npm run verify
npm run verify:max
npm run verify:stress
```

`verify:stress` is the release bar. It runs the full repo verification surface and, when provider credentials are configured, also runs the live GitHub and GitLab sandbox publish gates.

### CLI smoke test

```bash
npm run smoke:cli
npm run smoke:max
npm run stress:full
```

### CLI

```bash
node dist/cli.js --help
node dist/cli.js scan --config .omni-link.json
node dist/cli.js scan --markdown --config .omni-link.json
node dist/cli.js health --config .omni-link.json
node dist/cli.js evolve --config .omni-link.json
node dist/cli.js impact --config .omni-link.json
node dist/cli.js watch --once --config .omni-link.json
node dist/cli.js owners --config .omni-link.json
node dist/cli.js review-pr --base main --head HEAD --config .omni-link.json
node dist/cli.js publish-review --pr 42 --base main --head HEAD --config .omni-link.json
node dist/cli.js publish-review --pr 42 --base main --head HEAD --config .omni-link.gitlab.json
node dist/cli.js apply --base main --head HEAD --config .omni-link.json
node dist/cli.js rollback --config .omni-link.json
```

In live provider modes, `publish-review` fetches PR or MR metadata before publishing so omni-link can resolve missing head SHAs, detect closed or merged review targets, and trim provider payloads to provider-specific limits before comments or checks are emitted.

### Releases

Create a git tag like `v1.0.0` and push it to trigger the release workflow. The workflow rebuilds, reruns verification, creates an `npm pack` artifact, and publishes a GitHub release with generated notes.

### Project structure

```
omni-link/
  engine/           # Core TypeScript engine
    scanner/        # Tree-sitter parsing, extraction
    grapher/        # Cross-repo graph building
    context/        # Token pruning, digest formatting, caching
    quality/        # Reference checking, convention validation, slop detection
    evolution/      # Gap analysis, bottlenecks, benchmarking, upgrades
    types.ts        # Core type definitions
    config.ts       # Configuration loader
    index.ts        # Pipeline orchestrator
    cli.ts          # CLI entry point
  skills/           # 10 Claude Code skills
  commands/         # Slash command docs
  agents/           # 3 specialized agents
  hooks/            # Session-start hook
  tests/            # Test suite (488+ core tests, plus live-provider integration gates)
    scanner/        # Scanner unit tests
    grapher/        # Grapher unit tests
    context/        # Context engine tests
    quality/        # Quality gate tests
    evolution/      # Evolution engine tests
    providers/      # Provider replay and live integration tests
    integration/    # End-to-end integration tests
  scripts/          # Smoke, contract, package-install, and full stress harnesses
  .claude-plugin/   # Plugin manifest
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure `npm test` passes
5. Submit a pull request

## License

MIT
