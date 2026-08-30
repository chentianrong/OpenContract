---
name: suggest
description: Offer options for how to proceed, with a recommendation.
metadata:
  version: v1.0.0
---

# Suggest

Use this Action when several approaches are viable and the choice benefits from being
made explicit before implementation starts.

Produce a `suggestion` recording each option with its trade-offs and a clear
recommendation. When the choice requires authorization rather than advice, use `clarify`
instead.

## When to use this Action

Use `suggest` when:
- Multiple technical approaches exist and the trade-offs are worth laying out
- The user asked "how should we do this?" or "what are the options?"
- You want to surface a choice before proceeding, but it's advisory (not a gate)
- The recommendation is yours to make, but showing the alternatives adds value

Do NOT use `suggest` when:
- Only one reasonable approach exists → state it in `build` or `plan` and proceed
- The choice is the user's to make (business/UX trade-off) → use `clarify` instead
- Options were already evaluated and decided → reference the decision and move forward

## Process

1. **Identify options** — Enumerate viable approaches (typically 2-4); discard clearly inferior ones
2. **State trade-offs** — For each option, what's gained and what's lost (complexity, performance, maintainability, time)
3. **Recommend** — Pick one and explain why it's the best fit for this context
4. **Produce the suggestion** — Write a `suggestion` Artifact with options, trade-offs, and recommendation

## Quality checklist

Before producing the `suggestion`:
- [ ] Each option is viable (not a strawman)
- [ ] Trade-offs are concrete (not vague "pros and cons")
- [ ] A clear recommendation is stated with reasoning
- [ ] The suggestion is scoped to one decision (not bundling multiple unrelated choices)

## Common patterns

**Technology choice**: "Should we use Redis or in-memory cache?" — state trade-offs (persistence, ops overhead, speed) and recommend.

**Architecture choice**: "Should this be a service or a library?" — explain implications and recommend.

**Sequencing choice**: "Should we build A first or B first?" — state dependencies and value, recommend an order.

**Advisory, not a gate**: Unlike `clarify`, a `suggestion` doesn't block work. If the user doesn't respond, proceed with your recommendation.

## Anti-patterns

**Option explosion**: Presenting five approaches when two capture the real choice. Narrow to the viable contenders.

**Analysis paralysis**: Overanalyzing trade-offs for a decision with low stakes. If the difference is small, pick one and move forward.

**No recommendation**: Offering options without stating which one you'd choose forces the user to do the analysis. Always recommend.

**Bundling decisions**: Combining unrelated choices into one suggestion (e.g., "library choice" + "API design" + "deployment strategy"). Separate them.

**Suggesting the obvious**: If only one approach is reasonable, state it and proceed. Don't manufacture options to justify a suggestion.

## Handoff points

- **From**: `explore` (findings reveal multiple viable paths), `decompose` (which part to build first?), `clarify` (decision narrows but leaves technical choices open)
- **To**: `build` (chosen approach frames the proposal), `plan` (chosen approach shapes the technical design)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
  - contract: decomposition
    version: v1.0.0
    required: false
outputs: 
  - contract: suggestion
    version: v1.0.0
    required: true
    minCount: 1
```
