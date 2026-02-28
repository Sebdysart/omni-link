---
name: apply
description: Execute operations that were previewed in simulate-only (dry-run) mode. Run /verify first, then /apply to commit the changes.
disable-model-invocation: true
---

# /apply — Execute Dry-Run Plan

When `simulateOnly: true` is set in your omni-link config, all scan and analysis operations run in preview mode — they describe what they would do without executing. `/apply` disables the guard and runs the actual operation.

## Prerequisites

Before running `/apply`, you MUST complete ALL of the following:

1. **Run `/verify`** on all generated code — it must return PASS
2. **Review the dry-run summary** — confirm the proposed changes match your intent
3. **Confirm there are no contract mismatches** in the current digest that you haven't addressed

If any prerequisite is not met, resolve it before running `/apply`.

## Execution

Open your omni-link config file (`~/.claude/omni-link.json` or `.omni-link.json` in the repo root) and temporarily set:

```json
{
  "simulateOnly": false
}
```

Then trigger the operation you want to run (e.g. `/scan`, `/impact`, `/health`). After the operation completes and you have verified the results, restore `"simulateOnly": true` to re-enable dry-run mode.

## What Gets Executed

When you run `/apply`:

1. The full scan pipeline runs against all configured repos
2. The ecosystem graph is rebuilt with fresh data
3. The context digest is refreshed in your session
4. Any evolution or impact analysis you requested during dry-run is re-run with real data

## Safety Notes

- `/apply` runs the **read-only** scan pipeline — it does not write code to your repos
- It refreshes the ecosystem manifest used by omni-link to verify your code
- Code generation is still under your control — `/apply` only refreshes the ground truth data Claude uses

## After /apply

Run `/verify` again on any pending generated code to confirm it validates against the fresh manifest.

## Disabling Dry-Run Permanently

To disable dry-run mode entirely, remove or set `"simulateOnly": false` in your `~/.claude/omni-link.json` or `.omni-link.json` config file.
