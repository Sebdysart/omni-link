---
name: uncertainty-checklist
description: Behavioral self-audit skill. Run before presenting any generated code to verify all claims are grounded, no imports are hallucinated, and no placeholders remain. Prevents overconfident code generation.
---

# Uncertainty Checklist — Pre-Presentation Self-Audit

Run this checklist silently (using `<thinking>` tags) before presenting any generated code to the user. This is not optional — it is the final quality gate before code leaves Claude's context.

## When to Run

- Before presenting any new file or function
- Before suggesting an import or API call
- Before claiming a type name, field name, or route path is correct
- Before saying "this should work" or "this is the correct approach"

## The Checklist

Work through each item in `<thinking>` tags. Only present code when all items pass.

### 1. Import Verification
- [ ] Every `import from '...'` path: have I seen this exact file in the ecosystem manifest or in files I've read this session?
- [ ] Every named import `{ Foo }`: have I verified `Foo` is actually exported from that module?
- [ ] Every external package: is it listed in `package.json`?

**If any fail:** Do not guess. State "I need to run `/scan` to verify this import exists before I can be confident."

### 2. API Call Verification
- [ ] Every `fetch('/api/...')` URL: is this path in the digest's API surface summary?
- [ ] Every tRPC call `trpc.X.Y`: does this procedure name match exactly what was scanned?
- [ ] HTTP method matches the route definition?

**If any fail:** State "The digest shows [actual route]. I'm using [intended route]. Let me correct this."

### 3. Type and Field Verification
- [ ] Every type I'm referencing: did I read its actual definition, or am I working from memory?
- [ ] Every field name I'm accessing: is it in the type's `fields` list from the digest or from a file I read?
- [ ] Optional vs. required correctly handled?

**If any fail:** Read the actual type definition before presenting code. The digest's "Key Type Signatures" section is the authoritative source. Run the anti-slop gate check.

### 4. Placeholder Scan
- [ ] No `// TODO` or `// FIXME` comments?
- [ ] No `throw new Error('not implemented')`?
- [ ] No `console.log('placeholder')` or similar?
- [ ] Every function body has real implementation, not stubs?

**If any fail:** Complete the implementation before presenting.

### 5. Confidence Calibration
- [ ] Am I stating facts I actually verified, or am I guessing?
- [ ] For any claim I'm uncertain about: have I prefixed it with "I believe..." or "Based on the manifest..."?
- [ ] Have I avoided absolute language ("this is correct", "this will work") for anything I haven't verified?

**If any fail:** Add appropriate uncertainty qualifiers or run `/scan` to verify.

## Rejection Format

If you find issues during the checklist, do NOT present the broken code. Instead:

```
Before presenting this code, my uncertainty checklist flagged:

1. [IMPORT] `./services/user-service` — I haven't verified this file exists. Running /scan to confirm.
2. [TYPE] `UserProfile.phoneNumber` — the manifest shows UserProfile has `id`, `email`, `role` but I cannot confirm `phoneNumber` without reading the type file.

Pausing to verify before presenting.
```

## The Core Principle

**A clearly stated "I'm not sure" is better than confident wrong code.**

Hallucinated imports that compile but fail at runtime are worse than honest uncertainty. The uncertainty checklist exists to make overconfident errors structurally impossible.
