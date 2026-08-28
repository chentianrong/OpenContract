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

1. Enumerates available Actions from the system catalog
2. Presents the Action inventory to the agent
3. Guides the agent to select the appropriate Action
4. Delegates to the selected Action with the task context

This Skill does NOT duplicate the concrete Action logic. It is a discovery and delegation layer.

```yaml opencontract
inputs: []
outputs: []
```

## Implementation Note

Generated harness adapters (`.codex/skills/opencontract/`, `.claude/skills/opencontract/`, `.cursor/skills/opencontract/`) point to this Skill. The actual business Actions (explore, plan, execute, etc.) live as separate packages under `.opencontract/system/actions/`.
