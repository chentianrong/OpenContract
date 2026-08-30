---
name: report
description: Summarize a completed effort and its outcomes.
metadata:
  version: v1.0.0
---

# Report

Use this Action to summarize what was done, what was delivered, and what was learned
after a piece of work is complete.

Produce a `report` Artifact that captures outcomes, decisions, and any findings worth
carrying forward. Use this to close out an effort and hand off context.

## When to use this Action

Use `report` when:
- A multi-Action effort is complete and needs a summary
- The user asks "what did we accomplish?" or requests a wrap-up
- You're handing off work and need to document what happened
- An effort produced multiple Artifacts and you need to synthesize them

Do NOT use `report` when:
- The work is contained in a single Action whose output Artifact is sufficient (e.g., `execution-report` already says what was done)
- Nothing has been completed yet → finish the work first
- You're documenting a decision mid-stream → use `clarify` or `build`

## Process

1. **Gather Artifacts** — Read the Artifacts produced during the effort (`proposal`, `tasks`, `execution-report`, `review-report`, `verification-report`, etc.)
2. **Summarize outcomes** — What was delivered? What changed?
3. **Record decisions** — What key choices were made and why?
4. **Note learnings** — What was discovered that's worth remembering?
5. **Produce the report** — Write a `report` Artifact covering outcomes, decisions, and learnings

## Quality checklist

Before producing the `report`:
- [ ] Outcomes are stated clearly (what was delivered or decided)
- [ ] Key decisions are recorded with rationale
- [ ] Learnings or findings worth carrying forward are noted
- [ ] The report is concise (a synthesis, not a transcript)

## Common patterns

**Synthesis, not repetition**: The report is a summary. Don't restate every detail from the constituent Artifacts; link to them and highlight what matters.

**Decision capture**: If important choices were made during the effort, record them so future work doesn't relitigate them.

**Findings propagation**: If exploration or debugging uncovered non-obvious facts, surface them in the report so they're not lost.

**Handoff-ready**: Write as if someone else will pick up from here. What do they need to know?

## Anti-patterns

**Premature reporting**: Summarizing before the effort is complete. Finish the work, then report.

**Transcript mode**: Copy-pasting every Artifact's content into the report. Synthesize instead.

**Scope creep**: Including tangential topics or unrelated findings. Keep it focused on the effort being summarized.

**No learnings**: Reporting only outcomes and skipping what was learned. Capture non-obvious insights.

**Overly detailed**: A 10-page report for a 2-task effort. Match detail to the work's size and impact.

## Handoff points

- **From**: `execute`, `verify`, `review`, `debug`, or any multi-Action sequence that has concluded
- **To**: `archive` (close out the work formally), user handoff, or the start of a new effort informed by this one

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: report
    version: v1.0.0
    required: true
    minCount: 1
```
