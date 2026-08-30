---
name: review
description: Review changed work for correctness and for simplification opportunities.
metadata:
  version: v1.0.0
---

# Review

Use this Action to examine work that is already written: look for defects that would
change behavior, and for reuse or simplification that would reduce it.

Produce a `review-report` with each finding anchored to a file and line, stating the
concrete failure scenario rather than a general concern.

## When to use this Action

Use `review` when:
- Code has been written and you need to check it for defects or improvement opportunities
- An `execution-report` indicates work is complete and ready for review
- The user asks for a code review or quality check

Do NOT use `review` when:
- No code has been written yet → use `plan` to design first
- You're verifying against a specification → use `verify` instead (that's requirements checking)
- You're debugging a known defect → use `debug`

## Process

1. **Read the context** — If an `execution-report` or `tasks` list exists, read it to understand what changed and why
2. **Examine for correctness** — Look for logic errors, edge cases, incorrect assumptions, or defects that would cause wrong behavior
3. **Examine for simplification** — Look for duplication, unnecessary complexity, or opportunities to reuse existing code
4. **Anchor findings** — For each issue, state the file, line, and concrete failure scenario (not vague concerns)
5. **Produce the report** — Write a `review-report` with findings, each with location and scenario

## Quality checklist

Before producing the `review-report`:
- [ ] Each finding is anchored to a file and line number
- [ ] Each finding states a concrete failure scenario (input → wrong output)
- [ ] Findings distinguish defects (wrong behavior) from simplifications (better structure)
- [ ] Vague concerns ("this could be better") are excluded; only concrete, actionable issues are listed

## Common patterns

**Concrete failure scenarios**: "If input is negative, this crashes" beats "edge cases not handled."

**Distinguish defect from style**: A defect changes behavior. A simplification improves structure without changing behavior. Label them clearly.

**Anchor precisely**: "File X, line Y, function Z" lets the defect be fixed without re-finding it. The `review-report` Contract requires the format `**path/to/file.ext:42** — description`.

**Scope to the change**: Focus on what was modified. If you notice unrelated issues, note them separately.

## Anti-patterns

**Vague findings**: "This function is complex" doesn't state a defect. "When count is zero, this divides by zero and crashes" does.

**Style nitpicking**: Complaining about formatting, naming, or minor style choices that don't affect behavior. Focus on correctness and simplification.

**Unfounded speculation**: "This might not scale" without evidence isn't actionable. State concrete issues.

**Reviewing the world**: Examining the entire codebase instead of focusing on what changed. Review the work, not everything nearby.

**No location anchors**: Findings without file/line references force someone to hunt for the issue. Always anchor.

## Handoff points

- **From**: `execute` (work is complete), user request for review
- **To**: `debug` (fix a defect found in review), `execute` (address simplification findings), `verify` (check behavior against requirements after defects are fixed)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: execution-report
    version: v1.0.0
    required: false
  - contract: tasks
    version: v1.0.0
    required: false
outputs: 
  - contract: review-report
    version: v1.0.0
    required: true
    minCount: 1
```
