---
name: using-omni-link
description: Meta skill loaded at session start. Defines iron laws, skill registry, and aggressive evolution posture for the omni-link ecosystem plugin.
---

# omni-link — Ecosystem-Aware Development

You have access to **omni-link**, a multi-repo ecosystem plugin that scans up to 4 repositories via tree-sitter AST parsing, builds an EcosystemGraph (API bridges, type lineage, contract mismatches, impact paths), and injects a token-budgeted digest into your context at session start.

## Iron Laws

These are non-negotiable. Violating any of these is a blocking error.

1. **NEVER hallucinate imports, types, routes, or procedures.** Every import path, type name, API route, and tRPC procedure you reference MUST exist in the ecosystem manifest. If you are unsure, verify against the digest or run `/scan`.
2. **ALWAYS verify against the manifest** before generating code that references cross-repo contracts, shared types, or API endpoints.
3. **NEVER introduce a package not in the dependency list** without explicitly calling it out and confirming with the user.
4. **NEVER use placeholder code** (TODO throws, not-implemented stubs, console.log placeholders) in production code generation.
5. **ALWAYS run impact analysis** (`/impact`) before making changes to API surfaces, shared types, or database schemas.
6. **ALWAYS match the detected conventions** of the target repository (naming, file organization, error handling, testing patterns).

## Digest Format

The ecosystem digest injected at session start contains:

```
repos:          List of scanned repos with branch, language, uncommitted change count
contractStatus: Total API bridges, how many are exact/compatible/mismatched
mismatches:     Specific contract mismatches with provider/consumer file:line
evolution:      Ranked improvement suggestions with evidence citations
conventions:    Per-repo naming, file org, error handling, testing patterns
apiSurface:     Summary of routes, procedures, and exports across all repos
recentChanges:  Summary of recent git activity across the ecosystem
```

When the digest includes **contract mismatches**, you MUST acknowledge them before proceeding with any work. Do not silently ignore mismatches.

## Skill Registry

Invoke these skills based on the trigger conditions described:

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `ecosystem-grounding` | Session start, after rescan | Ground yourself in the ecosystem state before doing work |
| `cross-repo-impact` | Before API/schema/type changes | Analyze ripple effects across repos |
| `anti-slop-gate` | Before finalizing any code generation | Block hallucinated imports, phantom packages, wrong conventions |
| `convention-enforcer` | During code generation | Match detected codebase patterns |
| `dependency-navigator` | "Where is X used?", tracing dependencies | Cross-repo exploration and tracing |
| `health-audit` | Periodic health checks, `/health` command | Score and assess ecosystem health |
| `ecosystem-planner` | Multi-repo feature planning | Order tasks across repos, identify coordination points |
| `business-evolution` | Session start, `/evolve` command | Surface improvement opportunities with evidence |
| `upgrade-executor` | Executing multi-repo changes | Orchestrate changes provider-first with validation |

## Aggressive Evolution Posture

omni-link is configured with an **aggressive evolution posture**. This means:

- At session start, review the `evolutionOpportunities` in the digest and surface the top suggestions to the user.
- When you notice patterns that match known gaps (incomplete CRUD, missing pagination, no caching, missing rate limiting), proactively mention them.
- Every suggestion MUST include evidence: specific `file:line` references from the actual codebase.
- Never fabricate evidence. If you cannot cite a real file and line, do not make the suggestion.

## Available Commands

| Command | What It Does |
|---------|-------------|
| `/scan` | Force full ecosystem rescan, refresh the digest |
| `/impact` | Analyze impact of uncommitted changes across repos |
| `/health` | Full ecosystem health audit with per-repo scores |
| `/evolve` | Run business evolution analysis, surface suggestions |

## When In Doubt

- If the digest is stale or you suspect changes since last scan: run `/scan`.
- If you are about to modify an API endpoint or shared type: run `/impact` first.
- If generated code references imports you have not verified: run the anti-slop-gate check.
- If you are unsure about a convention: check the digest's `conventionSummary` for the target repo.
