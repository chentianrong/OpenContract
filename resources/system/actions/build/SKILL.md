---
name: build
description: Turn an agreed direction into a written proposal of what will change.
metadata:
  version: v1.0.0
---

# Build

Use this Action to state the intended change before designing or planning it: why the
change is needed, what will change, and what the impact is.

Produce a `proposal`. Keep it about scope and intent; technical choices belong in
`design` and step ordering belongs in `plan`.

## When to use this Action

Use `build` when:
- The direction is agreed (via user request, `clarify`, or `suggest`) but not yet written down
- You're ready to define scope and intent before diving into design or tasks
- The goal is clear enough to state but needs planning before implementation
- You need to confirm "this is what we're building" before investing in technical details

Do NOT use `build` when:
- The goal is still vague or exploratory → use `explore` first
- Multiple directions are viable and the choice is open → use `suggest` or `clarify` first
- The proposal already exists → use `plan` to work out the details

## Process

1. **State the need** — Why is this change being made? What problem does it solve or what value does it add?
2. **Define scope** — What will change? Be specific about boundaries (what's in, what's out)
3. **Describe impact** — Who/what is affected? Are there risks, dependencies, or migrations?
4. **Produce the proposal** — Write a `proposal` Artifact covering need, scope, and impact

## Quality checklist

Before producing the `proposal`:
- [ ] The need is stated clearly (why this change matters)
- [ ] Scope is explicit (what's in and what's out)
- [ ] Impact is assessed (affected systems, users, risks)
- [ ] The proposal avoids prescribing technical implementation (save for `plan`)

## Common patterns

**Scope framing**: Be explicit about what's not included. "This adds read-only API access; write access is out of scope."

**Impact assessment**: Call out migrations, breaking changes, dependencies on other systems, or user-facing implications.

**Justification**: State the user need or business value. "Support mobile clients" is stronger than "add an API."

**Lightweight when small**: For a small, obvious change, the proposal can be brief. Scale detail to the change's size.

## Anti-patterns

**Design creep**: Specifying technical choices (libraries, architectures, data structures) in the proposal. Save those for `plan` and `design`.

**Vague scope**: "Improve the API" doesn't define boundaries. What improves? What's excluded?

**Solution-first**: Jumping to "how" (implementation) before stating "why" (need) and "what" (scope).

**Over-engineering**: Writing a 10-page proposal for a 1-hour change. Match detail to impact.

**Skipping the proposal**: Going straight to `plan` without confirming scope. A proposal is the contract; the plan is the execution.

## Handoff points

- **From**: `explore` (findings clarify the need), `clarify` (decision defines scope), `suggest` (recommendation is accepted), user request
- **To**: `plan` (turns the proposal into a specification, design, and tasks)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: suggestion
    version: v1.0.0
    required: false
  - contract: decision
    version: v1.0.0
    required: false
outputs: 
  - contract: proposal
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
