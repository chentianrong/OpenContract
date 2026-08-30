---
name: plan
description: Turn a proposal into specifications, a design, and an ordered task list.
metadata:
  version: v1.0.0
---

# Plan

Use this Action once the intended change is agreed. Specify the required behavior,
record the technical choices, and order the work so each step is verifiable.

Produce a `tasks` list, and produce `specification` and `design` Artifacts when the
change adds behavior or makes architectural choices worth recording.

## When to use this Action

Use `plan` when:
- A `proposal` defines scope and intent, and you're ready to work out the details
- You need to specify behavior, make design choices, and order the implementation
- The work is substantial enough to benefit from step-by-step ordering

Do NOT use `plan` when:
- Scope is unclear or still being negotiated → use `clarify` or `build` first
- The change is trivial and obvious → consider going directly to `execute` with an inline task list
- You're investigating rather than implementing → use `explore`

## Process

1. **Read the proposal** — Understand scope, intent, and constraints
2. **Specify behavior** — If the change adds or modifies functionality, write a `specification` Artifact using normative language (SHALL, MUST, SHOULD) and concrete scenarios
3. **Design the solution** — If the change involves architectural choices, component relationships, or non-trivial structure, write a `design` Artifact
4. **Order the tasks** — Break the work into verifiable steps; sequence them so each can be tested before moving to the next
5. **Produce the task list** — Write a `tasks` Artifact with ordered, concrete steps

## Quality checklist

Before producing the outputs:
- [ ] If behavior changes, a `specification` states the requirements with scenarios (WHEN/THEN)
- [ ] If architectural choices were made, a `design` records them with rationale
- [ ] The `tasks` list is ordered so each step is independently verifiable
- [ ] Each task is concrete (not "improve X", but "add field Y to table Z")

## Common patterns

**Specification when behavior changes**: Adding a feature? Modifying business logic? Write a spec. Refactoring with no behavior change? Skip the spec.

**Design when architecture changes**: Introducing a new service, restructuring components, or making a non-obvious technical choice? Write a design. Straightforward implementation? Skip it.

**Task ordering for verification**: Order tasks so tests can verify each step. "Add data model" → "Add API endpoint" → "Wire to UI" lets you test the model, then the endpoint, then the full flow.

**Granularity**: Tasks should be small enough to complete and verify in one sitting, but not so small that you're enumerating every line of code.

**Task list format**: The `tasks` Contract requires checkbox format (`- [ ] <task>`) so completion can be tracked. Prose paragraphs will fail validation.

## Anti-patterns

**Over-specification**: Writing a spec for trivial changes obvious from the task list. Spec when behavior is non-obvious or needs scenarios to clarify.

**Under-specification**: Skipping the spec when behavior is actually complex or ambiguous. A vague task list isn't a substitute for clear requirements.

**Design for design's sake**: Writing a design doc that restates obvious implementation. Record decisions and structure, not step-by-step code.

**Unordered tasks**: A flat list with no consideration for dependencies or verification order makes execution chaotic.

**Vague tasks**: "Fix the login flow" isn't actionable. "Add JWT validation to /auth endpoint" is.

## Handoff points

- **From**: `build` (proposal defines intent), `clarify` or `suggest` (decisions resolve open questions before planning)
- **To**: `execute` (implements the task list), `review` or `verify` (check the work after execution)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: proposal
    version: v1.0.0
    required: true
    minCount: 1
  - contract: decision
    version: v1.0.0
    required: false
outputs: 
  - contract: specification
    version: v1.0.0
    required: false
  - contract: design
    version: v1.0.0
    required: false
  - contract: tasks
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
