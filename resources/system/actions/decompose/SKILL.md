---
name: decompose
description: Break a large goal into independently workable parts.
metadata:
  version: v1.0.0
---

# Decompose

Use this Action when a goal is too large to hold in one plan, or when parts of it can
proceed in parallel or be delivered separately.

Produce a `decomposition` that names each part, states its boundary, and records the
dependencies between parts. Do not plan the parts here — that is `plan`.

## When to use this Action

Use `decompose` when:
- A goal spans multiple independent subsystems or capabilities
- The work is too large to fit in a single task list
- Parts can proceed in parallel or be delivered incrementally
- Dependencies between parts need to be made explicit before planning

Do NOT use `decompose` when:
- The goal is already scoped to a single subsystem or flow → use `build` then `plan` directly
- You're ordering tasks within a single deliverable → that's `plan`'s job
- The goal is vague and needs investigation first → use `explore`

## Process

1. **Understand the whole** — Read the goal; if parts are unclear, explore or clarify first
2. **Identify boundaries** — Find natural seams: subsystems, capabilities, or independently deliverable features
3. **Name each part** — Give each part a clear, descriptive name (not "Part 1", "Part 2")
4. **State dependencies** — Record what must complete before what (e.g., "Auth must complete before Dashboard")
5. **Produce the decomposition** — Write a `decomposition` Artifact with parts and their dependency graph

## Quality checklist

Before producing the `decomposition`:
- [ ] Each part has a clear boundary and can be understood independently
- [ ] Each part is named descriptively (not generic labels)
- [ ] Dependencies between parts are explicit (what blocks what)
- [ ] The decomposition does not prescribe how to implement the parts (that's for `plan`)

## Common patterns

**Layer-based decomposition**: Foundation layer first (data model, core APIs), then service layer, then UI.

**Feature-based decomposition**: Authentication, Billing, Notifications — each is independently valuable and can proceed in parallel where dependencies allow.

**Incremental delivery**: Break into parts that can ship separately, each adding value. State the delivery order.

**Dependency-first ordering**: Explicitly call out which parts block others; this guides sequencing without over-specifying.

## Anti-patterns

**Fake decomposition**: Breaking a single feature into "design", "implementation", "testing" isn't decomposition — those are phases, not parts. Decompose by capability or subsystem.

**Over-granularity**: Decomposing into dozens of tiny parts. Each part should be independently workable and take at least a few tasks to complete.

**Under-specification**: Parts with vague boundaries like "Backend" and "Frontend" don't clarify the work. Name capabilities, not layers.

**Planning in disguise**: Specifying tasks or technical choices in the decomposition. State what each part is, not how to build it.

## Handoff points

- **From**: `explore` (findings reveal the goal is multi-part), `clarify` (decision defines scope and reveals multiple parts), user request for a large goal
- **To**: `build` or `plan` (each part becomes its own planning cycle), `suggest` (propose which part to tackle first)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: decomposition
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
