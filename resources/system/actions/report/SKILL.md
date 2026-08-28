---
name: report
description: Summarize a body of work for a reader who did not follow it.
metadata:
  version: v1.0.0
---

# Report

Use this Action to produce a standalone account of what was done and what it means,
leading with the outcome rather than the chronology.

Produce a `report`. Draw on the task's existing Artifacts as inputs rather than re-
deriving their content.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: execution-report
    version: v1.0.0
    required: false
  - contract: verification-report
    version: v1.0.0
    required: false
  - contract: review-report
    version: v1.0.0
    required: false
outputs: 
  - contract: report
    version: v1.0.0
    required: true
    minCount: 1
```
