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
