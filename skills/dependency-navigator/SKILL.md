---
name: dependency-navigator
description: Navigate cross-repo dependencies to answer "Where is X used?", trace dependency chains, and assess change impact.
---

# Dependency Navigator

This skill enables cross-repo exploration: tracing where entities are used, following dependency chains, and assessing what would be affected by a proposed change.

## When to Invoke

- User asks "Where is X used?" or "What depends on X?"
- User wants to understand how repos are connected
- Before refactoring a shared entity (type, function, route)
- When investigating why a change in one repo affects another
- When exploring the architecture to understand data flow

## Workflows

### "Where is X used?"

Trace all usages of an entity across the entire ecosystem.

**Process:**
1. Identify what X is: a type, function, API route, tRPC procedure, or package
2. Search the ecosystem graph for references:
   - **Type**: Check `sharedTypes` in the graph for all instances across repos
   - **Function/Export**: Check `bridges` for cross-repo usage, check internal deps for in-repo usage
   - **Route**: Check `bridges` for consumers calling that route
   - **Procedure**: Check `bridges` for consumers invoking that procedure
3. Present results grouped by repo:

```
## Where is `UserProfile` used?

### backend (provider)
- src/types/user.ts:15 — Type definition (source of truth)
- src/routes/user.ts:8 — Used as return type for GET /api/user/:id
- src/services/user-service.ts:23 — Used in getUserProfile()

### ios-app (consumer)
- Models/UserProfile.swift:5 — Codable struct (consumer copy)
- Services/UserService.swift:18 — Decoded from API response
- Screens/Profile/ProfileView.swift:12 — Displayed in UI

### shared-types (canonical)
- src/user.ts:10 — Canonical type definition
```

### Dependency Chain Tracing

Follow the chain: A imports B which imports C.

**Process:**
1. Start from the target entity
2. Walk the `dependencies.internal` graph for in-repo chains
3. Walk the `bridges` graph for cross-repo chains
4. Present the full chain:

```
## Dependency Chain: UserProfile

UserService.swift
  └─ imports UserProfile from Models/UserProfile.swift
       └─ mirrors backend UserProfile from src/types/user.ts
            └─ used by GET /api/user/:id in src/routes/user.ts
                 └─ queries users table via src/services/user-service.ts
```

### Type Tracing Across Repos

Trace how a type concept appears in different repos and whether instances are aligned.

**Process:**
1. Find the type in `sharedTypes` (TypeLineage entries)
2. Check `alignment`: `aligned`, `diverged`, or `subset`
3. If diverged, identify specific field differences
4. Present the lineage:

```
## Type Lineage: User

Alignment: DIVERGED

| Field       | backend (provider) | ios-app (consumer) | Status |
|-------------|--------------------|--------------------|--------|
| id          | string             | String             | OK     |
| email       | string             | String             | OK     |
| avatarUrl   | string | null      | String             | MISMATCH — nullability |
| createdAt   | string (ISO)       | Date               | OK (decoded) |
| phoneNumber | string?            | —                  | MISSING in consumer |
```

### Impact Assessment for Proposed Changes

Before making a change, assess what would break.

**Process:**
1. Identify the entity being changed
2. Trace all dependents using the above workflows
3. Classify impact severity for each dependent:
   - **Breaking**: The dependent will fail (type mismatch, missing field, removed export)
   - **Warning**: The dependent may behave differently (added optional field, changed default)
   - **Info**: The dependent references it but is unlikely affected
4. Present the assessment and recommend running `/impact` for the full automated analysis

## Navigation Tips

- The ecosystem graph's `bridges` array shows all cross-repo API connections
- The `sharedTypes` array shows all type concepts that appear in multiple repos
- The `contractMismatches` array shows where types have diverged
- The `impactPaths` array shows pre-computed ripple effects
- For deeper exploration, use the `repo-analyst` agent for single-repo deep dives
