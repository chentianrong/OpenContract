---
name: debug
description: Diagnose a defect and record the root cause and the fix.
metadata:
  version: v1.0.0
---

# Debug

Use this Action when behavior is wrong and the cause is not yet known. Reproduce the
failure first, then narrow to a root cause before changing code.

Produce a `debug-report` recording the symptom, the reproduction, the root cause, and
the fix. If the same approach fails twice, change approach rather than tweaking further.

## When to use this Action

Use `debug` when:
- Observed behavior does not match expected behavior (a defect)
- The root cause is not yet known
- You need to investigate before you can fix

Do NOT use `debug` when:
- The fix is obvious from the symptom → implement directly and document in the commit
- You're adding new behavior → use `plan` and `execute`
- You're exploring how something works → use `explore`

## Process

1. **Reproduce the failure** — Find the minimal steps to trigger the defect; confirm it's repeatable
2. **Narrow the cause** — Use logging, debugging tools, or code inspection to isolate where the defect originates
3. **Identify the root cause** — State why the defect happens (not just where)
4. **Fix it** — Change the code to address the root cause
5. **Verify the fix** — Confirm the reproduction steps no longer trigger the defect, and that no new defects were introduced
6. **Produce the report** — Write a `debug-report` covering symptom, reproduction, root cause, and fix

## Quality checklist

Before producing the `debug-report`:
- [ ] The reproduction steps are minimal and repeatable
- [ ] The root cause is identified (not just the symptom)
- [ ] The fix addresses the root cause (not a workaround)
- [ ] The fix is verified (original reproduction no longer fails)
- [ ] No regressions were introduced (project tests still pass)

## Common patterns

**Minimal reproduction**: Strip away unrelated context. If the bug appears "sometimes", find what makes it deterministic.

**Root cause over symptom**: "Null pointer at line 42" is the symptom. "User object not initialized when session expires" is the root cause.

**Fix the cause, not the symptom**: If the symptom is a crash, don't just catch the exception — fix why the exception happens.

**Verify no regressions**: Run the full test suite. A fix that breaks something else isn't done.

## Anti-patterns

**Guessing without reproducing**: Changing code based on a hypothesis without confirming the defect is repeatable.

**Symptom-driven fixes**: Wrapping the crash in a try-catch without understanding why it crashed.

**Iterative tweaking**: Trying small variations on the same approach after it fails. If it didn't work twice, change strategy.

**Scope creep**: Fixing unrelated issues discovered during debugging. Note them separately; stay focused on the original defect.

**Skipping verification**: Assuming the fix works without re-running the reproduction. Always verify.

## Handoff points

- **From**: `execute` (defect found during implementation), `review` or `verify` (defect found during examination), user-reported bug
- **To**: `review` (examine the fix for correctness), `verify` (confirm the fix against requirements), `report` (summarize the debugging session if part of a larger effort)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: execution-report
    version: v1.0.0
    required: false
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: debug-report
    version: v1.0.0
    required: true
    minCount: 1
```
