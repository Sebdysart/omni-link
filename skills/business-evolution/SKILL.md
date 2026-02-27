---
name: business-evolution
description: Surface business improvement opportunities backed by codebase evidence. Runs evolution analysis at session start and on-demand via /evolve.
---

# Business Evolution

This skill surfaces actionable improvement opportunities for the ecosystem, backed by evidence from the actual codebase. It operates from a CTO/product strategist perspective, finding gaps, bottlenecks, and competitive deficiencies.

## When to Invoke

- At session start: Review `evolutionOpportunities` in the digest and present top items
- When user runs `/evolve`
- When the user asks "What should I build next?" or "How can I improve this?"
- When you notice patterns during work that suggest missing capabilities

## How to Run

Execute the evolution analysis:

```
/evolve
```

This runs the full evolution pipeline:
1. **Gap Analyzer**: Finds incomplete CRUD operations, dead exports, orphaned schemas, routes without handlers
2. **Bottleneck Finder**: Detects missing pagination, caching gaps, rate limiting absence, unbounded queries, sync-in-async patterns
3. **Competitive Benchmarker**: Compares against stack best practices (security headers, input validation, error handling, logging, monitoring)
4. **Upgrade Proposer**: Ranks and merges all findings into prioritized suggestions with ROI estimates

## Suggestion Categories

| Category | What It Covers |
|----------|---------------|
| `feature` | Incomplete features, missing CRUD operations, dead routes, orphaned UI |
| `performance` | Missing pagination, caching, query optimization, async patterns |
| `monetization` | Revenue opportunities identified from existing code patterns |
| `scale` | Rate limiting, connection pooling, queue usage, horizontal scaling |
| `security` | Missing auth checks, input validation, security headers, secrets exposure |

## Suggestion Presentation Format

Present each suggestion in this format:

```
### [CATEGORY] [Title]

**Impact:** [high/medium/low] | **Effort:** [small/medium/large]

[Description of what should be done and why]

**Evidence:**
- `[repo]/[file]:[line]` — [what was found at this location]
- `[repo]/[file]:[line]` — [supporting evidence]

**Affected Repos:** [list]
```

## Evidence Requirements

Every suggestion MUST include at least one evidence citation. Evidence is a specific `file:line` reference from the actual scanned codebase.

**Required format:** `repo/path/to/file.ts:lineNumber` followed by a description of what was found.

**Rules:**
- NEVER fabricate evidence. If you cannot cite a real file and line, do not make the suggestion.
- Evidence must come from the most recent scan. If the digest is stale, run `/scan` first.
- Multiple evidence points strengthen a suggestion. Include all relevant findings.
- Evidence should be verifiable: the user should be able to open the file and see what you describe.

## Session-Start Integration

When the ecosystem digest is loaded at session start:

1. Check if `evolutionOpportunities` contains any items
2. If the evolution config `aggressiveness` is `aggressive`:
   - Present the top 3 suggestions immediately
   - Frame them as "opportunities spotted during ecosystem scan"
3. If `moderate`:
   - Mention that opportunities were found, offer to show details
4. If `on-demand`:
   - Do not present until user runs `/evolve`

## Prioritization

Suggestions are pre-ranked by the upgrade proposer using this priority:

1. **Security issues** (always highest priority)
2. **Breaking bottlenecks** (things that will fail at scale)
3. **High-impact, low-effort** wins (quick improvements with big payoff)
4. **Feature completions** (finishing partially built features)
5. **Performance optimizations** (improving existing functionality)
6. **Monetization opportunities** (revenue-related improvements)

The number of suggestions is capped by `config.evolution.maxSuggestionsPerSession`.

## Dispatching the Evolution-Strategist Agent

For deeper analysis of a specific suggestion, dispatch the `evolution-strategist` agent. It can:

- Research current best practices and industry standards via web search
- Analyze competitive landscape for similar features
- Provide detailed implementation roadmaps
- Estimate business impact with supporting reasoning
