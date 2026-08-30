---
name: execute
description: Implement planned tasks and record what was actually done.
metadata:
  version: v1.0.0
---

# Execute

Use this Action to carry out a task list. Implement the specified behavior, verify it
with the project's own build and tests, and keep changes scoped to the tasks.

Produce an `execution-report` recording which tasks completed, what was verified, and
anything left out with the reason. Do not silently narrow specified behavior.

## When to use this Action

Use `execute` when:
- You have a `tasks` Artifact with ordered, concrete steps
- The design decisions are already settled (via `plan` or `design`)
- The work is ready to be implemented and verified

Do NOT use `execute` when:
- Requirements are still vague → use `explore` or `clarify` first
- The approach needs design → use `plan` first
- You're investigating a bug → use `debug` instead

## Process

1. **Read inputs** — Load the `tasks` Artifact; if `specification` or `design` exist, read them to understand the intent
2. **Implement in order** — Complete tasks sequentially; verify each with project build/tests before moving to the next
3. **Track deviations** — If a task cannot be completed as specified, record the reason and what was done instead
4. **Verify the whole** — Run the full project test suite; ensure no regressions beyond the intended changes
5. **Produce the report** — Write an `execution-report` stating which tasks completed, which were skipped, and what verification was run

## Quality checklist

Before producing the `execution-report`:
- [ ] Every specified task is either completed or explicitly listed as skipped with a reason
- [ ] Project build and tests pass (or failures are documented in the report)
- [ ] Code changes match the scope in the `tasks` Artifact (no unrelated changes)
- [ ] If behavior was narrowed from the specification, the deviation is recorded

## Common patterns

**Iterative verification**: After each task, run relevant tests. Don't wait until all tasks are done to discover a broken assumption.

**Scope containment**: If you discover related improvements while implementing, note them separately rather than expanding scope mid-execution.

**Deviation transparency**: When a task proves infeasible as written, state what you did instead and why in the report — the `verify` Action will check the deviation against the spec.

## Anti-patterns

**Silent narrowing**: Skipping a task without recording it in the report. The user and downstream Actions cannot know what was delivered.

**Scope creep**: Adding features or refactorings not in the `tasks` list. Keep changes focused; suggest improvements separately.

**Verification theater**: Running tests but not reading the output. If tests fail, stop and report the failure rather than proceeding.

**Guess-driven implementation**: Implementing without reading the `specification` or `design` inputs when they exist. The task list is the "what"; the spec/design are the "why" and "how".

## Handoff points

- **From**: `plan` (produces the `tasks` input), `clarify` or `suggest` (resolves choices before implementation)
- **To**: `review` (examines the code for defects), `verify` (checks delivery against specification), `debug` (fixes defects found post-execution)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: tasks
    version: v1.0.0
    required: true
    minCount: 1
  - contract: specification
    version: v1.0.0
    required: false
  - contract: design
    version: v1.0.0
    required: false
outputs: 
  - contract: execution-report
    version: v1.0.0
    required: true
    minCount: 1
```
