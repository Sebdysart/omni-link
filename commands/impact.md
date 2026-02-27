---
name: impact
description: Analyze the cross-repo impact of uncommitted changes. Shows ripple effects across all configured repositories.
disable-model-invocation: true
---

# /impact — Cross-Repo Impact Analysis

Analyze the impact of uncommitted changes across the entire ecosystem. Detects which files have changed, traces their effects through API bridges, type lineage, and dependency chains, and reports what will be affected.

## Execution

Run the omni-link CLI impact command:

```bash
omni-link impact --config <auto-detect>
```

Config auto-detection follows the same order as `/scan`.

## Output

Display the impact report as a ripple analysis:

For each impact path found:

```
Trigger: [repo]/[file] — [change description]

Affected:
  1. [repo]/[file]:[line] — [reason] — severity: [BREAKING/warning/info]
  2. [repo]/[file]:[line] — [reason] — severity: [BREAKING/warning/info]
```

### Summary

After listing all impact paths:

- **Total triggers**: Number of changed files detected
- **Total affected**: Number of files affected across repos
- **Breaking changes**: Count of BREAKING severity items
- **Warnings**: Count of warning severity items

### If No Impact Found

If no uncommitted changes are detected or no cross-repo impact exists:

```
No cross-repo impact detected. All uncommitted changes are contained within their respective repos.
```

## Recommended Follow-Up

If BREAKING items are found, recommend:
1. Review each breaking change
2. Plan updates using the `ecosystem-planner` skill
3. Execute using the `upgrade-executor` skill
