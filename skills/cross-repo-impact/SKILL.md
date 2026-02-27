---
name: cross-repo-impact
description: Analyze cross-repo impact before making changes to APIs, schemas, or shared types. Run impact analysis to see ripple effects.
---

# Cross-Repo Impact Analysis

This skill defines when and how to perform cross-repository impact analysis to prevent breaking changes.

## When to Invoke

**Mandatory** before:
- Changing any API route signature (path, method, input type, output type)
- Modifying a tRPC procedure's input or output schema
- Altering a shared type or interface used across repos
- Changing a database schema or model definition
- Renaming or removing any exported function, type, or constant
- Modifying error response formats

**Recommended** before:
- Adding new required fields to existing types
- Changing authentication or authorization logic
- Modifying middleware that affects multiple routes

## How to Run

Execute the impact analysis command:

```
/impact
```

This runs `omni-link impact` which:
1. Scans all repos for current state
2. Detects uncommitted changes across the ecosystem
3. Builds the ecosystem graph
4. Traces impact paths from changed files through API bridges, type lineage, and dependency chains

## Ripple Report Format

The impact analysis returns an array of `ImpactPath` objects:

```
Trigger:
  repo: [source repo]
  file: [changed file]
  change: [description of change]

Affected:
  1. [repo]/[file]:[line] — [reason] — severity: BREAKING
  2. [repo]/[file]:[line] — [reason] — severity: warning
  3. [repo]/[file]:[line] — [reason] — severity: info
```

### Severity Levels

- **BREAKING**: The affected code will fail at runtime or compile time. Must be fixed before merging.
- **warning**: The affected code may behave unexpectedly. Should be reviewed.
- **info**: The affected code references the changed entity but is likely unaffected. Worth noting.

## Workflow

1. **Before making the change**: Run `/impact` to see current state
2. **Review the ripple report**: Identify all BREAKING and warning items
3. **Plan the change order**: If multiple repos are affected, change the provider first, then consumers
4. **Make the change**: Apply the modification
5. **After making the change**: Run `/impact` again to verify the ripple is resolved
6. **Validate contracts**: Ensure no new mismatches were introduced

## Example

User wants to add a `phoneNumber` field to the User response:

```
> /impact

Trigger: backend/src/routes/user.ts — Adding phoneNumber to User response

Affected:
  1. ios-app/Models/User.swift:12 — User struct missing phoneNumber field — severity: warning
  2. ios-app/Services/UserService.swift:34 — Decodes User response — severity: info
  3. shared-types/src/user.ts:8 — SharedUser type — severity: warning

Action: Update User.swift to add optional phoneNumber, update shared-types
```

## Blocking Rule

If the impact report shows any **BREAKING** severity items, you MUST:
1. Present all breaking items to the user
2. Propose a migration plan (provider-first ordering)
3. Get explicit user confirmation before proceeding
4. Execute changes in the correct order using the `upgrade-executor` skill

Never silently make a breaking cross-repo change.
