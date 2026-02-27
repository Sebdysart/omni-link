---
name: health
description: Full ecosystem health audit. Computes per-repo and overall health scores across test coverage, code quality, dead code, and TODO burden.
disable-model-invocation: true
---

# /health — Ecosystem Health Audit

Run a comprehensive health audit across all configured repositories. Produces per-repo scores and an overall ecosystem health rating.

## Execution

Run the omni-link CLI health command:

```bash
omni-link health --config <auto-detect>
```

Config auto-detection follows the same order as `/scan`.

## Output

Present the health report in this format:

```
## Ecosystem Health Report

Overall Score: [score]/100

### Per-Repo Scores

| Repo | Overall | Tests (30%) | Quality (25%) | Dead Code (25%) | TODOs (20%) |
|------|---------|-------------|---------------|-----------------|-------------|
| [name] | [score] | [score] | [score] | [score] | [score] |

### Score Interpretation

90-100: Excellent | 75-89: Good | 60-74: Fair | 40-59: Poor | 0-39: Critical
```

### Risk Zones

Flag any dimension scoring below 50 or any repo scoring below 60 overall:

```
### Risk Zones

- [repo] Tests: [score]/100 — [explanation]
- [repo] Dead Code: [score]/100 — [explanation]
```

### Recommendations

Provide 3-5 prioritized, actionable recommendations:

```
### Recommendations

1. [Highest priority] — [specific action] — affects [repo]
2. [Next priority] — [specific action] — affects [repo]
3. [Next priority] — [specific action] — affects [repo]
```

## Scoring Weights

| Dimension | Weight | Scoring |
|-----------|--------|---------|
| Test Coverage | 30% | Direct percentage. Unknown = 40. |
| Code Quality | 25% | 100 minus (lint errors x 2 + type errors x 4) |
| Dead Code | 25% | 100 x (1 - dead exports / total exports) |
| TODO Burden | 20% | Logarithmic decay from 100. 0 TODOs = 100. |

## If Health Cannot Be Computed

If no repos are configured or scan fails:

```
Unable to compute health scores. Ensure .omni-link.json is configured and run /scan first.
```
