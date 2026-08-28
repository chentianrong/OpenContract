---
name: execute
description: Implement planned tasks and record what was actually done.
metadata:
  version: v1.0.0
---

# Execute

Use this Action to carry out a task list. Implement the specified behavior, verify it
with the project's own build and tests, and keep changes scoped to the tasks.

Produce an `execution-report` recording which tasks completed, what was verified, and
anything left out with the reason. Do not silently narrow specified behavior.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: tasks
    version: v1.0.0
    required: true
    minCount: 1
  - contract: specification
    version: v1.0.0
    required: false
  - contract: design
    version: v1.0.0
    required: false
outputs: 
  - contract: execution-report
    version: v1.0.0
    required: true
    minCount: 1
```
