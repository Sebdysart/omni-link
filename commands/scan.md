---
name: scan
description: Force a full ecosystem rescan. Scans all configured repos, rebuilds the ecosystem graph, and outputs a fresh context digest.
disable-model-invocation: true
---

# /scan — Full Ecosystem Rescan

Force a full rescan of the ecosystem. This re-runs the scanner on all configured repos, rebuilds the ecosystem graph (API bridges, type lineage, contract mismatches, impact paths), and produces a fresh token-budgeted digest.

## Execution

Run the omni-link CLI scan command:

```bash
omni-link scan --config <auto-detect>
```

Config auto-detection order:
1. `.omni-link.json` in the current working directory
2. `~/.claude/omni-link.json` as global fallback

If no config is found, display:
```
omni-link: No config found. Create .omni-link.json in your project root or ~/.claude/omni-link.json to enable ecosystem scanning.
```

## Output

Display the scan results to the user:

1. **Repos scanned**: List each repo with name, language, branch, and uncommitted change count
2. **Contract status**: Total bridges, exact/compatible/mismatch counts
3. **Active mismatches**: List any contract mismatches with severity and file:line details
4. **Convention summary**: Per-repo conventions detected
5. **Evolution opportunities**: Top suggestions found during scan
6. **Timestamp**: When the scan completed

## After Scan

The fresh digest replaces the previous session context. All subsequent work should reference the updated digest state.
