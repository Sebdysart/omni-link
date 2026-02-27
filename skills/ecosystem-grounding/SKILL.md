---
name: ecosystem-grounding
description: Ground yourself in the current ecosystem state. Use at session start and after any rescan to understand repo layout, contract status, and active mismatches.
---

# Ecosystem Grounding

This skill defines how to orient yourself in the multi-repo ecosystem before doing any work.

## When to Invoke

- At session start, after the digest is injected
- After running `/scan` to refresh ecosystem state
- When switching context between repositories
- When the user asks about the overall state of their ecosystem

## Grounding Workflow

### Step 1: Read the Digest State Block

Parse the ecosystem digest for these critical sections:

1. **Repos**: Which repos are scanned, their languages, branches, and uncommitted changes
2. **Contract Status**: How many API bridges exist, and how many are exact vs. compatible vs. mismatched
3. **Mismatches**: Specific contract mismatches with severity (breaking/warning/info)
4. **Conventions**: Per-repo naming, file organization, error handling, and testing patterns
5. **Recent Changes**: What has changed recently across the ecosystem

### Step 2: Contract Mismatch Acknowledgment Gate

If the digest contains **any contract mismatches**, you MUST:

1. List each mismatch with its severity
2. Identify the provider and consumer (file:line for each)
3. State whether the mismatch is `breaking`, `warning`, or `info`
4. Explicitly acknowledge the mismatches before proceeding

**Do not proceed with any code generation until mismatches are acknowledged.** This is a gate, not a suggestion.

Example acknowledgment format:

```
## Ecosystem Status

Scanned: 3 repos (backend, ios-app, shared-types)
Contract Status: 12 bridges — 10 exact, 1 compatible, 1 MISMATCH

### Active Mismatches (must resolve or acknowledge)

1. [BREAKING] `User.avatarUrl` — backend returns `string | null` but iOS expects `String` (non-optional)
   - Provider: backend/src/routes/user.ts:45
   - Consumer: ios-app/Services/UserService.swift:23

Acknowledged. Proceeding with awareness of the avatarUrl nullability mismatch.
```

### Step 3: Briefing Format

Present the grounding briefing to the user in this format:

```
## Ecosystem Briefing

**Repos**: [count] repos scanned ([names])
**Branches**: [list current branches]
**Uncommitted**: [count] files with uncommitted changes
**Contracts**: [total] bridges — [exact] exact, [compatible] compatible, [mismatches] mismatched
**Health**: [overall score]/100
**Top Evolution Opportunity**: [title from digest]
```

## When to Request a Rescan

Request `/scan` when:

- The user has made changes to API endpoints, shared types, or database schemas since the last scan
- The digest `generatedAt` timestamp is more than 1 hour old
- The user has switched branches in any repo
- The user reports that something "should exist" but it is not in the digest
- You encounter a reference that should be in the manifest but is not found

## Using the Digest During Work

Throughout the session, refer back to the digest for:

- **Import verification**: Check that any import path you generate exists in the repo's export list
- **Type checking**: Verify that types you reference match the type registry
- **Route verification**: Confirm API routes exist before generating client calls
- **Convention matching**: Use the convention summary to match naming and patterns
- **Dependency checking**: Verify packages exist in the external dependency list before importing
