---
name: health-audit
description: Run and interpret ecosystem health audits. Produces per-repo and overall scores, identifies risk zones, and provides actionable recommendations.
---

# Health Audit

This skill defines how to run, interpret, and present ecosystem health reports.

## When to Invoke

- User runs `/health`
- Periodic check-ins on ecosystem quality
- Before starting a large refactoring effort
- When evaluating whether the codebase is ready for a release
- When the user asks "How healthy is my codebase?"

## How to Run

Execute the health audit command:

```
/health
```

This runs `omni-link health` which scans all repos, builds the ecosystem graph, and computes health scores.

## Report Format

Present the health report in this format:

```
## Ecosystem Health Report

**Overall Score: [score]/100**

### Per-Repo Scores

| Repo | Overall | Tests | Quality | Dead Code | TODOs |
|------|---------|-------|---------|-----------|-------|
| backend | 82/100 | 75 | 90 | 85 | 78 |
| ios-app | 71/100 | 60 | 80 | 70 | 74 |
| shared-types | 95/100 | 90 | 100 | 95 | 95 |

### Risk Zones
[List areas scoring below 60]

### Recommendations
[Prioritized list of improvements]
```

## Scoring Criteria

Health scores are computed from four dimensions, weighted as follows:

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Test Coverage | 30% | Percentage of code covered by tests. Unknown coverage scores 40. |
| Code Quality | 25% | Lint errors (-2 pts each) and type errors (-4 pts each) |
| Dead Code | 25% | Ratio of unused exports to total exports |
| TODO Burden | 20% | Count of TODO/FIXME/HACK comments. Logarithmic decay. |

### Score Interpretation

| Range | Meaning |
|-------|---------|
| 90-100 | Excellent — minimal tech debt, well-tested |
| 75-89 | Good — healthy with some improvement opportunities |
| 60-74 | Fair — noticeable tech debt, action recommended |
| 40-59 | Poor — significant issues, prioritize remediation |
| 0-39 | Critical — major risk, immediate attention needed |

## Risk Zone Identification

Flag as a risk zone when:

- Any individual dimension scores below 50
- A repo's overall score is below 60
- Test coverage is unknown (null) across multiple repos
- Dead code ratio exceeds 30% of total exports
- TODO count exceeds 20 in a single repo
- Type errors exist (indicates broken compilation)

## Actionable Recommendations

For each risk zone, provide specific recommendations:

**Low test score (<60):**
- Identify the most critical untested paths (API routes, data mutations)
- Suggest specific test files to create

**Low quality score (<70):**
- If lint errors: identify the most common lint rule violations
- If type errors: these are compilation failures — must fix first

**High dead code (>30%):**
- List the unused exports
- Recommend removal or verify if they are used dynamically

**High TODO burden (>15 items):**
- Categorize TODOs by urgency
- Identify which are stale vs. actively needed

## Dispatching the Repo-Analyst Agent

For deep dives into a single repo's health, dispatch the `repo-analyst` agent. It can:

- Explore specific directories for dead code
- Trace unused exports to determine if they are safe to remove
- Identify specific test gaps
- Analyze error handling coverage

## Ecosystem-Level Health Concerns

Beyond per-repo scores, flag ecosystem-level issues:

- **Contract mismatches**: Any breaking mismatches reduce effective ecosystem health
- **Stale repos**: Repos with no recent commits may have drifted from the ecosystem
- **Convention divergence**: Repos using different conventions increase cognitive load
- **Missing bridges**: Expected cross-repo connections that do not exist
