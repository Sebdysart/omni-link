---
name: upgrade-executor
description: Orchestrate coordinated multi-repo changes with provider-first ordering, contract validation at each step, and rollback planning.
---

# Upgrade Executor

This skill handles the execution of coordinated changes across multiple repositories. It ensures changes are applied in the correct order, validated at each step, and can be rolled back if something goes wrong.

## When to Invoke

- Executing a plan produced by the `ecosystem-planner` skill
- Applying a fix for a contract mismatch identified by `cross-repo-impact`
- Implementing an upgrade suggested by `business-evolution`
- Any time changes must be applied to multiple repos in a specific order

## Execution Protocol

### Step 1: Pre-Flight Check

Before making any changes:

1. Run `/scan` to get current ecosystem state
2. Verify no blocking contract mismatches exist (or acknowledge them)
3. Confirm the change plan with the user
4. Record the current state for rollback:
   - Current branch and HEAD SHA for each affected repo
   - List of files that will be modified

### Step 2: Provider-First Execution

Apply changes in strict order:

```
1. Shared types / schema definitions (if applicable)
   -> Validate: /scan — types still aligned?

2. Database migrations (if applicable)
   -> Validate: migration runs without error

3. API provider (backend)
   -> Validate: /impact — no new breaking paths?
   -> Validate: backend tests pass

4. API consumers (frontend, mobile, other services)
   -> Validate: /scan — all contracts exact or compatible?
   -> Validate: consumer tests pass

5. Final ecosystem validation
   -> Run /health — score should not decrease
```

### Step 3: Contract Validation at Each Step

After each change:

1. Run `/scan` or `/impact` as appropriate
2. Check for new contract mismatches
3. If a mismatch is introduced:
   - STOP execution
   - Report the mismatch with file:line details
   - Determine if it is expected (will be fixed in a later step) or unexpected
   - If unexpected: trigger rollback protocol

### Step 4: Impact Re-Analysis

After ALL changes are applied:

1. Run `/impact` to verify the full ecosystem
2. Run `/health` to verify no health score degradation
3. Run `/scan` to produce a fresh digest
4. Present a summary of what changed and the new ecosystem state

## Rollback Plan

Every execution must have a rollback plan. If something fails mid-execution:

### Automatic Rollback Triggers
- A contract mismatch with severity `breaking` is introduced and was not in the plan
- Tests fail in a repo that was just modified
- Health score drops by more than 10 points

### Rollback Steps
1. Identify which repos have been modified
2. For each modified repo (in reverse order of application):
   - Revert uncommitted changes: `git checkout -- .`
   - If already committed: `git revert HEAD` (or reset to recorded SHA)
3. Run `/scan` to verify ecosystem is back to pre-change state
4. Report what happened and why rollback was needed

### Partial Rollback
If changes to repos A and B succeeded but repo C failed:
- Assess if A and B changes are independently valid
- If yes: keep A and B, rollback C, report partial success
- If no: rollback all three

## Execution Report Format

After completion, present:

```
## Upgrade Execution Report

### Changes Applied
1. [repo]/[file] — [what changed]
2. [repo]/[file] — [what changed]

### Validation Results
- Contract Status: [X] exact, [Y] compatible, [Z] mismatched
- Tests: [all passing / N failures]
- Health Score: [before] -> [after]

### Status: [SUCCESS / PARTIAL / ROLLED BACK]
[Additional notes if partial or rolled back]
```

## Interaction with Cross-Repo Reviewer

For each change step, the `cross-repo-reviewer` agent can be dispatched to:
- Verify the change does not introduce cross-repo safety issues
- Check that API contracts remain compatible
- Validate that type lineage is preserved
- Confirm no unintended side effects across repo boundaries

## Safety Rules

1. **Never apply changes to all repos simultaneously.** Always sequential, provider first.
2. **Never skip validation checkpoints.** Even if the change "looks correct."
3. **Always record pre-change state** before starting execution.
4. **Stop on unexpected breaking changes.** Do not continue hoping the next step will fix it.
5. **Report honestly.** If execution partially failed, say so. Do not hide failures.
