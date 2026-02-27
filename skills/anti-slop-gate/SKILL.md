---
name: anti-slop-gate
description: Iron law quality gate that BLOCKS (not warns) on hallucinated imports, unknown packages, wrong conventions, and placeholder code. Enforcement, not suggestion.
---

# Anti-Slop Gate

This is the quality enforcement gate for all code generation. It runs three checks against proposed code and **BLOCKS on failure**. This is not advisory — violations are rejections.

## When to Invoke

- Before finalizing ANY code generation output
- Before presenting code to the user as a solution
- After making modifications to existing files
- When generating new files

## The Three Checks

### 1. Reference Checker

Validates that all imports, API calls, and type references resolve to real entities in the ecosystem manifest.

**Blocks on:**
- `missing-file`: Import path resolves to a file that does not exist in the codebase
- `missing-export`: Named import references an export that does not exist in the target file
- `unknown-route`: API call targets a route not defined in any scanned repo
- `unknown-procedure`: tRPC procedure call references a procedure not in the manifest

### 2. Convention Validator

Enforces detected codebase patterns on generated code.

**Blocks on:**
- `naming`: Variable/function name violates the repo's naming convention (camelCase, snake_case, PascalCase, kebab-case)
- `file-location`: File is placed in the wrong directory per codebase convention
- `error-handling`: Async function uses await without error handling when the codebase convention is try-catch
- `testing`: Test file placement violates co-located or separate-directory convention

### 3. Slop Detector

Catches common AI code generation failures.

**Blocks on (severity: error):**
- `placeholder`: TODO comments, FIXME, HACK, XXX, "not implemented" throws, placeholder console.logs
- `phantom-import`: Package imported that is not in the project's dependency list (hallucinated package)

**Warns on (severity: warning):**
- `duplicate-block`: 3+ lines of duplicate code detected
- `over-commenting`: Comment-to-code ratio exceeds 50%

## Check Workflow

For every code block you generate:

1. **Verify imports**: Every `import` or `require` statement targets a file/package that exists
2. **Verify API calls**: Every `fetch('/api/...')` or `trpc.X.query()` targets a real endpoint
3. **Verify naming**: All identifiers match the target repo's naming convention
4. **Verify no placeholders**: No TODO, FIXME, not-implemented stubs
5. **Verify no phantom packages**: Every external package is in the dependency list

## Rejection Format

When a violation is detected, present it in this format:

```
## BLOCKED — Anti-Slop Gate Failure

### Violations:

1. [REFERENCE] Line 3: Import path './services/user-service.js' resolves to
   'src/services/user-service.ts' which does not exist in the codebase.

2. [SLOP] Line 15: Package 'lodash-es' is not listed in project dependencies —
   possible hallucinated import.

3. [CONVENTION] 'fetch_user_data' does not follow camelCase convention.
   Suggestion: Rename to 'fetchUserData'.

### Resolution Required

[Describe what needs to change to pass the gate]
```

## Enforcement Rules

- **Error-severity violations are blocking.** The code MUST NOT be presented as a solution until all error-severity issues are resolved.
- **Warning-severity issues should be flagged** but do not block. Present them as improvement suggestions.
- **Never downgrade an error to a warning.** If it is a hallucinated import, it is an error. Period.
- **Never skip the gate** because "it is a small change" or "the user is in a hurry." The gate exists to prevent production failures.
- **Self-correct before presenting.** If you detect a violation in your own output, fix it yourself rather than showing broken code with a note.

## Common Failures to Watch For

1. Importing a file at a path that was renamed or moved
2. Using a package name that sounds right but is not installed (e.g., `lodash-es` when only `lodash` is installed)
3. Calling `trpc.getUser.query()` when the actual procedure is `trpc.user.get.query()`
4. Using snake_case in a camelCase codebase or vice versa
5. Leaving TODO stubs in generated code
6. Referencing an API route with the wrong path prefix
