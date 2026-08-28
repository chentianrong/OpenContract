---
name: build
description: Turn an agreed direction into a written proposal of what will change.
metadata:
  version: v1.0.0
---

# Build

Use this Action to state the intended change before designing or planning it: why the
change is needed, what will change, and what the impact is.

Produce a `proposal`. Keep it about scope and intent; technical choices belong in
`design` and step ordering belongs in `plan`.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: suggestion
    version: v1.0.0
    required: false
  - contract: decision
    version: v1.0.0
    required: false
outputs: 
  - contract: proposal
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
