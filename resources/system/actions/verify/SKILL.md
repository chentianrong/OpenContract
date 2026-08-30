---
name: verify
description: Check delivered work against its specified behavior.
metadata:
  version: v1.0.0
---

# Verify

Use this Action to confirm that what was built matches what was specified. Run the
project's build and tests, and check each specified scenario.

Produce a `verification-report` stating what was checked, what passed, what failed with
the actual output, and what could not be verified.

## When to use this Action

Use `verify` when:
- A `specification` defines required behavior and you need to confirm the implementation matches
- An `execution-report` claims work is complete and you need to validate the claim
- The user asks to verify delivery against requirements

Do NOT use `verify` when:
- No specification exists → there's nothing to verify against (use `review` to examine code quality instead)
- You're looking for defects without a spec → use `review`
- You're debugging a known failure → use `debug`

## Process

1. **Read the specification** — Understand the required behavior and scenarios
2. **Run project tests** — Execute the project's test suite; record pass/fail
3. **Check each scenario** — For each scenario in the specification, verify it against the implementation (manually or via tests)
4. **Record results** — For each scenario: passed, failed (with actual vs. expected), or could not be verified
5. **Produce the report** — Write a `verification-report` covering what was checked and the results

## Quality checklist

Before producing the `verification-report`:
- [ ] Every scenario in the specification is addressed (passed, failed, or marked unverifiable)
- [ ] Failed scenarios report actual output vs. expected
- [ ] Project tests were run and results recorded
- [ ] Unverifiable scenarios state why they couldn't be checked

## Common patterns

**Scenario-by-scenario**: Walk through each WHEN/THEN scenario in the specification. Don't skip any. The `verification-report` Contract requires each scenario result to include an outcome keyword (passed, failed, unverifiable).

**Actual vs. expected**: When a scenario fails, state what happened and what should have happened.

**Test coverage check**: If the specification calls for a scenario but no test covers it, that's a finding — mark it as "no test coverage."

**Unverifiable honesty**: If a scenario cannot be verified (requires production data, external system, etc.), say so explicitly. Don't mark it passed.

## Anti-patterns

**Assuming tests are sufficient**: The specification defines required behavior. If tests don't cover a scenario, you must verify it manually or report the gap.

**Passing without checking**: Marking scenarios as passed because tests pass, without confirming the scenarios themselves are tested.

**Vague failures**: "Scenario X failed" without stating what the actual behavior was. Always include actual vs. expected.

**Skipping unverifiable scenarios**: If a scenario can't be verified, report it with the reason. Silence implies it passed.

**Scope drift**: Verifying behavior not in the specification. Stick to what the spec requires.

## Handoff points

- **From**: `execute` (work claims to be complete), `debug` (defect claims to be fixed)
- **To**: `debug` (fix failures found during verification), `review` (examine implementation quality after verification passes), `report` (summarize verification results)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: specification
    version: v1.0.0
    required: false
  - contract: tasks
    version: v1.0.0
    required: false
  - contract: execution-report
    version: v1.0.0
    required: false
outputs: 
  - contract: verification-report
    version: v1.0.0
    required: true
    minCount: 1
```
