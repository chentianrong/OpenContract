---
name: opencontract
description: Entry point for OpenContract agent-driven work - discovers and delegates to system Actions.
metadata:
  version: v1.0.0
---

# OpenContract Entry Skill

This is the harness entry point for OpenContract. When an agent invokes `opencontract`, this Skill discovers the available Actions and Contracts from the system tree and guides the agent through selecting and executing the appropriate Action for the current task.

## Usage

The agent calls this Skill with a goal or task description. This Skill:

1. **Enumerates available Actions** from the system catalog
2. **Presents the Action inventory** to the agent with descriptions
3. **Guides selection** based on the task characteristics
4. **Delegates** to the selected Action with the task context

This Skill does NOT duplicate the concrete Action logic. It is a discovery and delegation layer.

## Action selection guide

When the goal is:
- **Vague or unfamiliar** → delegate to `explore` to investigate before committing to a direction
- **Ambiguous or requires user choice** → delegate to `clarify` to resolve before proceeding
- **Too large for one plan** → delegate to `decompose` to break into parts
- **Multiple viable approaches** → delegate to `suggest` to present options
- **Clear intent, needs formalization** → delegate to `build` to write a proposal
- **Agreed proposal, needs detail** → delegate to `plan` to specify and design
- **Ordered task list, ready to implement** → delegate to `execute` to carry out the work
- **Wrong behavior, cause unknown** → delegate to `debug` to diagnose and fix
- **Code written, needs quality check** → delegate to `review` to examine for defects
- **Implementation complete, needs verification** → delegate to `verify` to check against specification
- **Effort complete, needs summary** → delegate to `report` to summarize outcomes
- **Work done or abandoned, needs closure** → delegate to `archive` to close the ActionRun

## Common patterns

**Sequential flow**: Many tasks naturally flow through multiple Actions: `explore` → `build` → `plan` → `execute` → `verify` → `archive`.

**Branching on findings**: `explore` might reveal the need to `decompose`, or `clarify` a choice before building.

**Iteration**: `execute` → `review` → `debug` → `verify` may loop until quality gates pass.

**Direct delegation**: If the user explicitly named an Action or the task unambiguously maps to one, delegate immediately without re-explaining the inventory.

## Anti-patterns

**Reimplementing Action logic**: This Skill orchestrates; it does not execute the Actions' work itself.

**Overriding user intent**: If the user asks for a specific Action by name, delegate to it. Don't second-guess unless it's clearly wrong.

**Analysis paralysis**: If the right Action is obvious, delegate. Don't enumerate all 13 Actions every time.

## Implementation Note

Generated harness adapters (`.codex/skills/opencontract/`, `.claude/skills/opencontract/`, `.cursor/skills/opencontract/`) point to this Skill. The actual business Actions (explore, plan, execute, etc.) live as separate packages under `.opencontract/system/actions/`.

```yaml opencontract
inputs: []
outputs: []
```
