---
name: verify
description: Run the Validator critic agent against the most recently generated code. Returns a structured PASS/FAIL verdict with line-level evidence.
disable-model-invocation: true
---

# /verify — Validator Review Pass

Dispatch the **Validator** critic agent against the most recently generated code block. The Validator checks for hallucinated imports, phantom packages, unverified API calls, type mismatches, and placeholder patterns.

## When to Use

- After any non-trivial code generation (new files, new functions, cross-repo changes)
- When you suspect Claude may have hallucinated an import path or type name
- Before committing code that references cross-repo contracts
- After `/scan` completes and you want to validate pending generated code against the fresh manifest

## Execution

The Validator agent runs automatically after code generation when anti-hallucination mode is active. To trigger manually:

```
/verify
```

This dispatches the `validator` agent with:
- The most recently generated code block as input
- The current ecosystem digest as reference
- Read-only access to scan the actual codebase for verification

## Output

The Validator returns one of three verdicts:

### PASS
All checks passed. Imports verified, API calls confirmed, no placeholders, no phantom packages. Code is safe to present or commit.

### FAIL
One or more error-severity violations found. The specific violations are listed with line numbers and fix instructions. **Do not commit until the main agent fixes all violations and re-runs /verify.**

### INCONCLUSIVE
The Validator could not fully verify one or more references (e.g., files outside the scanned repos, dynamic imports). Treat as FAIL for cross-repo code; treat as advisory for within-repo code.

## After a FAIL

1. The main agent reviews each violation from the Validator
2. The main agent corrects the code
3. `/verify` runs again automatically
4. Repeat until PASS or INCONCLUSIVE

## After INCONCLUSIVE

Run `/scan` to refresh the ecosystem manifest, then run `/verify` again. If still INCONCLUSIVE, investigate the specific unverifiable references manually before proceeding.

## Anti-Hallucination Guarantee

When `/verify` returns PASS, you have a structural guarantee that:
- Every import path resolves to a real file in the scanned codebase
- Every package name is in the project dependency list
- Every API call targets a route that exists in the manifest
- No placeholder code was left in the output

This guarantee is only as fresh as the last `/scan`. If the ecosystem has changed since the last scan, run `/scan` then `/verify`.
