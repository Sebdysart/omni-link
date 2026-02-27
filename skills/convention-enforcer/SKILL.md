---
name: convention-enforcer
description: Detect and enforce codebase conventions during code generation. Covers naming, file organization, error handling, and testing patterns.
---

# Convention Enforcer

This skill ensures all generated code matches the detected conventions of the target repository. Conventions are extracted by the scanner during ecosystem analysis and stored in each repo's manifest.

## When to Invoke

- During all code generation (new files and modifications)
- When the user asks "how should I name/organize/structure this?"
- When reviewing code for convention compliance
- When creating new files to determine correct location

## Convention Categories

### 1. Naming Conventions

Each repo has a detected naming convention: `camelCase`, `snake_case`, `PascalCase`, `kebab-case`, or `mixed`.

**Rules:**
- Variables and functions: Follow the repo's detected convention
- Classes, interfaces, types, enums: Always PascalCase regardless of repo convention
- Constants (UPPER_SNAKE_CASE): Allowed in any convention
- Single-character names: Exempt from convention checks
- Private/internal names (prefixed with `_`): Exempt from convention checks

**Auto-correction suggestions:**
- `fetch_user_data` in a camelCase repo -> suggest `fetchUserData`
- `getUserData` in a snake_case repo -> suggest `get_user_data`
- `userservice` for a class -> suggest `UserService`

### 2. File Organization

The scanner detects where different types of files belong:

- Route handlers: Which directory contains API routes
- Models/types: Where type definitions live
- Services: Where business logic is organized
- Tests: Co-located vs. separate directory

**Rules:**
- New route handlers go in the detected routes directory
- New types go in the detected types directory
- Test files follow the detected testing pattern (co-located or separate)

### 3. Error Handling

The scanner detects the repo's error handling pattern:

- `try-catch`: Async functions should wrap await calls in try-catch
- `.catch()`: Promise chains should have .catch() handlers
- Other patterns as detected

**Rules:**
- If the convention is `try-catch`, every async function with `await` must have a try-catch block
- Generate error handling that matches the existing pattern

### 4. Testing Patterns

Detected patterns for test organization:

- `co-located`: Test files live next to source files (`user.ts` + `user.test.ts`)
- `separate-directory`: Test files live in `tests/` or `__tests__/` directory

**Rules:**
- New test files must follow the detected placement pattern
- Test file naming should match existing conventions (`.test.ts` vs `.spec.ts`)

## How to Use During Code Generation

1. **Check the digest** for the target repo's conventions:
   ```
   conventionSummary: {
     "backend": "camelCase, routes-in-src/routes/, try-catch, separate-directory tests",
     "ios-app": "camelCase, Screens/ organization, do-try-catch, co-located tests"
   }
   ```

2. **Apply conventions** to all generated code:
   - Name identifiers according to the convention
   - Place files in the correct directory
   - Include error handling that matches the pattern
   - Create test files in the right location

3. **Present corrections** when existing code violates conventions:
   ```
   Convention note: This repo uses camelCase. The function `get_user_data`
   should be renamed to `getUserData` to match the codebase convention.
   ```

## Convention Conflict Resolution

When conventions conflict across repos (e.g., backend uses camelCase, shared-types uses snake_case):

1. The **target repo's convention wins** for code placed in that repo
2. For shared types, follow the shared-types repo convention
3. When generating API contracts, match the provider's convention for the API surface and the consumer's convention for client code
4. Document any necessary convention translations at the boundary

## Interaction with Anti-Slop Gate

The convention enforcer feeds into the anti-slop-gate. Convention violations with severity `error` will cause the anti-slop gate to BLOCK the code. Self-correct convention issues before presenting code rather than relying on the gate to catch them.
