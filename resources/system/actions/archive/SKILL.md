---
name: archive
description: Close out completed or abandoned work and move Artifacts to archive.
metadata:
  version: v1.0.0
---

# Archive

Use this Action to formally close an ActionRun: mark work as complete or abandoned,
summarize the outcome, and move the Artifacts to archive.

Produce an `archive-report` stating what was archived, the final status, and any
unfinished work or follow-ups. This Action moves files on disk, completing the lifecycle.

## When to use this Action

Use `archive` when:
- An ActionRun is complete (all tasks done, outcomes verified) and should be closed
- An ActionRun is abandoned (no longer relevant, superseded, or blocked) and should be cleared from active work
- The user asks to close out or archive a piece of work
- You need to clean up active Artifacts to reduce workspace clutter

Do NOT use `archive` when:
- Work is still in progress → finish it first
- An ActionRun has active follow-up tasks → complete or explicitly defer them before archiving

## Process

1. **Assess completeness** — Is the work done? Are there unfinished tasks or open items?
2. **Summarize outcome** — State what was delivered or why the work was abandoned
3. **Identify follow-ups** — If any tasks were deferred or new work was identified, note them
4. **Produce the archive-report** — Write an `archive-report` covering status, outcome, and follow-ups
5. **Move Artifacts** — The OpenContract system moves the ActionRun and its Artifacts to `opencontract/artifacts/archive/` after the report is validated

## Quality checklist

Before producing the `archive-report`:
- [ ] The final status is clear (completed or abandoned)
- [ ] Outcomes are summarized (what was delivered or why work stopped)
- [ ] Unfinished work or follow-ups are explicitly noted (or stated as none)
- [ ] The report is concise (a closure summary, not a full retrospective)

## Common patterns

**Clean closure**: When work is complete, state what was delivered and confirm no loose ends.

**Honest abandonment**: If work was superseded, blocked, or deprioritized, say so explicitly. Don't pretend it's done.

**Follow-up tracking**: If tasks were deferred or new issues surfaced, list them. The archive report is the handoff.

**Reference other Artifacts**: The archive-report can reference the constituent Artifacts (execution-report, review-report, etc.) rather than repeating their content.

## Anti-patterns

**Archiving incomplete work silently**: Marking something as complete when tasks remain undone. State what's unfinished.

**No follow-up tracking**: Closing work with "we'll fix that later" but not recording what "that" is.

**Archiving prematurely**: Closing an ActionRun while it's still active. Let the work finish first.

**Verbose retrospectives**: The archive-report is a closure summary, not a post-mortem. Keep it factual and brief.

**Skipping abandonment reasons**: If work was abandoned, state why. "Deprioritized", "Superseded by X", "Blocked on Y" are all valid.

## Handoff points

- **From**: `report` (summarizes the effort before closure), `execute` or `verify` (work is complete), user decision to abandon
- **To**: End of lifecycle (Artifacts move to archive), or follow-up Actions if new work was identified

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: archive-report
    version: v1.0.0
    required: true
    minCount: 1
```
