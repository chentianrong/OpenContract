---
name: clarify
description: Resolve an ambiguity by asking the user and recording the decision.
metadata:
  version: v1.0.0
---

# Clarify

Use this Action when work cannot proceed correctly under any assumption: the requirement
is genuinely ambiguous, the trade-off is the user's to make, or the change is material
enough to need authorization.

Record the question, the options considered, and the recommendation as a `decision`.
Leave it `pending` until the user answers; a gated operation must not proceed on a
pending Decision.

## When to use this Action

Use `clarify` when:
- The requirement has two equally valid interpretations and guessing wrong would waste work
- The trade-off is a business or UX decision only the user can make
- The change is destructive, expensive, or otherwise requires explicit authorization
- Multiple paths exist and the choice is the user's, not a technical judgment call

Do NOT use `clarify` when:
- A reasonable default exists → state the assumption and proceed
- The choice is a standard technical judgment → make it and document in `design` or `specification`
- You're offering options for consideration → use `suggest` instead (advice, not a gate)

## Process

1. **State the ambiguity** — Explain what cannot be decided without user input
2. **Present options** — Enumerate the viable choices with their implications
3. **Recommend** — Unless truly neutral, state which option you'd pick and why
4. **Ask the user** — Pose the question clearly; wait for an answer
5. **Record the decision** — Produce a `decision` Artifact with `status: pending` before the user answers; update to `status: approved` or `status: rejected` once they respond

## Quality checklist

Before producing the `decision`:
- [ ] The question cannot be reasonably defaulted (genuinely blocks progress)
- [ ] Options are enumerated with their trade-offs stated
- [ ] A recommendation is included unless the choice is truly neutral
- [ ] The decision is marked `pending` until the user responds

## Common patterns

**Authorization gate**: For destructive or expensive operations, clarify first even when the path is obvious. The user's explicit approval is the deliverable.

**Disambiguation**: When a spec says "users" but the system has three user types, clarify which ones are in scope before building.

**Trade-off ownership**: Performance vs. maintainability, cost vs. reliability — when the trade-off is not technical, clarify.

**Update on response**: Once the user answers, update the `decision` Artifact's `status` field to `approved` or `rejected` and record their choice.

## Anti-patterns

**Overclarifying**: Asking for every minor choice that has a sensible default. Clarify only when guessing wrong would materially harm the work.

**Option explosion**: Presenting five options when two capture the real choice. More options obscure the decision.

**No recommendation**: Offering options without guidance forces the user to do your analysis. Recommend unless genuinely neutral.

**Proceeding on pending**: Implementing before the user answers a `pending` decision defeats the gate. Wait for approval.

## Handoff points

- **From**: `explore` (findings reveal an ambiguity), any Action where progress blocks on a user choice
- **To**: `build` (user's decision frames the intent), `suggest` (decision narrows the options for a follow-up choice), `plan` (decision unblocks planning)

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: decision
    version: v1.0.0
    required: true
    minCount: 1
```
