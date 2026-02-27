---
name: evolve
description: Run business evolution analysis. Finds gaps, bottlenecks, and competitive deficiencies, then presents ranked improvement suggestions with evidence.
disable-model-invocation: true
---

# /evolve — Business Evolution Analysis

Run the full evolution analysis pipeline to surface improvement opportunities backed by codebase evidence.

## Execution

Run the omni-link CLI evolve command:

```bash
omni-link evolve --config <auto-detect>
```

Config auto-detection follows the same order as `/scan`.

## Pipeline

The evolution engine runs four analysis stages:

1. **Gap Analyzer**: Incomplete CRUD, dead exports, orphaned schemas, routes without handlers
2. **Bottleneck Finder**: Missing pagination, caching gaps, rate limiting absence, unbounded queries
3. **Competitive Benchmarker**: Security, performance, reliability, observability best practices
4. **Upgrade Proposer**: Merges, deduplicates, and ranks all findings by impact/effort ratio

Results are filtered by the configured `evolution.categories` and capped at `evolution.maxSuggestionsPerSession`.

## Output

Present each suggestion in this format:

```
### [N]. [CATEGORY] [Title]

Impact: [high/medium/low] | Effort: [small/medium/large]

[Description]

Evidence:
- [repo]/[file]:[line] — [finding]
- [repo]/[file]:[line] — [finding]

Affected repos: [list]
```

### Summary

After listing all suggestions:

- **Total opportunities found**: [count]
- **By category**: feature: N, performance: N, security: N, scale: N, monetization: N
- **Quick wins** (high impact, small effort): [count]

## If No Suggestions

If the evolution engine finds no actionable suggestions:

```
No evolution opportunities found. The ecosystem is well-optimized for the configured categories.
```
