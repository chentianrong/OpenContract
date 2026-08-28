---
name: review
description: Review changed work for correctness and for simplification opportunities.
metadata:
  version: v1.0.0
---

# Review

Use this Action to examine work that is already written: look for defects that would
change behavior, and for reuse or simplification that would reduce it.

Produce a `review-report` with each finding anchored to a file and line, stating the
concrete failure scenario rather than a general concern.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: execution-report
    version: v1.0.0
    required: false
  - contract: tasks
    version: v1.0.0
    required: false
outputs: 
  - contract: review-report
    version: v1.0.0
    required: true
    minCount: 1
```
