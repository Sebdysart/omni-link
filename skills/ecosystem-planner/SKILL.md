---
name: ecosystem-planner
description: Plan multi-repo features and changes with correct task ordering, coordination points, and contract validation checkpoints.
---

# Ecosystem Planner

This skill handles planning work that spans multiple repositories. It ensures tasks are ordered correctly (API provider before consumer), coordination points are identified, and contract validation happens at each step.

## When to Invoke

- User wants to implement a feature that touches multiple repos
- User asks to plan a migration or refactoring across repos
- A change requires coordinated updates to API + client + shared types
- When breaking down a large cross-repo task into subtasks

## Planning Principles

### 1. Provider-First Ordering

Changes MUST be ordered so that the **provider** (the repo that defines the API/type) is updated before the **consumer** (the repo that calls/uses it).

**Correct order:**
1. Shared types / schemas (if a shared-types repo exists)
2. Backend / API provider
3. Frontend / mobile client (consumer)
4. Tests across all repos

**Wrong order:**
- Updating the iOS client before the backend endpoint exists
- Changing a shared type without updating the provider first

### 2. Coordination Points

Identify where repos must be in sync:

- **API contract boundary**: The provider's response shape must match the consumer's expected shape
- **Type boundary**: Shared types must be updated before both provider and consumer
- **Migration boundary**: Database migrations must complete before API changes that depend on new columns
- **Deploy boundary**: Provider must be deployed before consumer in production

### 3. Contract Validation Checkpoints

Insert validation checkpoints into the plan:

```
Step 1: Update shared types
  -> CHECKPOINT: Run /scan to verify type alignment
Step 2: Update backend API
  -> CHECKPOINT: Run /impact to verify no new mismatches
Step 3: Update iOS client
  -> CHECKPOINT: Run /scan to verify contracts are exact/compatible
Step 4: Run tests across all repos
```

## Planning Format

Present multi-repo plans in this format:

```
## Multi-Repo Plan: [Feature Name]

### Affected Repos
- [repo1] — [what changes]
- [repo2] — [what changes]

### Task Order

#### Phase 1: Schema/Type Updates
1. [ ] [repo] — [specific change] — [file(s) affected]
   CHECKPOINT: /scan — verify type alignment

#### Phase 2: Provider Updates
2. [ ] [repo] — [specific change] — [file(s) affected]
3. [ ] [repo] — [specific change] — [file(s) affected]
   CHECKPOINT: /impact — verify no breaking changes

#### Phase 3: Consumer Updates
4. [ ] [repo] — [specific change] — [file(s) affected]
5. [ ] [repo] — [specific change] — [file(s) affected]
   CHECKPOINT: /scan — verify all contracts exact/compatible

#### Phase 4: Validation
6. [ ] Run tests across all repos
7. [ ] Final /health check

### Parallel Opportunities
- Steps [X] and [Y] can run in parallel (no dependency)
- Steps [A] and [B] MUST be sequential ([A] provides the API that [B] consumes)

### Risks
- [risk description and mitigation]
```

## Parallel Subagent Opportunities

When tasks are independent, they can be dispatched to subagents in parallel:

- **Independent repo changes**: If step 4 (update iOS models) and step 5 (update web frontend models) do not depend on each other, they can run in parallel
- **Independent test suites**: Tests for different repos can run in parallel after all code changes
- **Documentation updates**: Can run in parallel with test execution

Flag parallel opportunities explicitly so the user (or orchestrator) can take advantage of them.

## Contract Validation at Each Step

After each phase, validate:

1. **Type alignment**: Do shared types still match across repos? (Run `/scan`)
2. **API compatibility**: Do consumer calls still match provider signatures? (Run `/impact`)
3. **Test passage**: Do existing tests still pass?
4. **No regressions**: Has the health score degraded? (Run `/health`)

If validation fails at any checkpoint:
- STOP the plan
- Identify the mismatch
- Fix it before proceeding to the next phase
- Re-run validation

## Example: Adding a New User Field

```
## Multi-Repo Plan: Add phoneNumber to User

### Affected Repos
- shared-types — Add phoneNumber to User type
- backend — Add phoneNumber to DB schema, API response, validation
- ios-app — Add phoneNumber to User model, display in profile

### Task Order

#### Phase 1: Schema
1. [ ] shared-types/src/user.ts — Add phoneNumber?: string
   CHECKPOINT: /scan

#### Phase 2: Backend
2. [ ] backend — DB migration: add phone_number column (nullable)
3. [ ] backend/src/routes/user.ts — Include phoneNumber in response
4. [ ] backend/src/schemas/user.ts — Add zod validation
   CHECKPOINT: /impact

#### Phase 3: iOS
5. [ ] ios-app/Models/User.swift — Add phoneNumber: String?
6. [ ] ios-app/Screens/Profile/ProfileView.swift — Display phone number
   CHECKPOINT: /scan

#### Phase 4: Validation
7. [ ] Run all backend tests
8. [ ] Run all iOS tests
9. [ ] Final /health
```
