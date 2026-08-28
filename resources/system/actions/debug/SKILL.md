---
name: debug
description: Diagnose a defect and record the root cause and the fix.
metadata:
  version: v1.0.0
---

# Debug

Use this Action when behavior is wrong and the cause is not yet known. Reproduce the
failure first, then narrow to a root cause before changing code.

Produce a `debug-report` recording the symptom, the reproduction, the root cause, and
the fix. If the same approach fails twice, change approach rather than tweaking further.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: execution-report
    version: v1.0.0
    required: false
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: debug-report
    version: v1.0.0
    required: true
    minCount: 1
```
