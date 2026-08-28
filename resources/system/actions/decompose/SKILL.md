---
name: decompose
description: Break a large goal into independently workable parts.
metadata:
  version: v1.0.0
---

# Decompose

Use this Action when a goal is too large to hold in one plan, or when parts of it can
proceed in parallel or be delivered separately.

Produce a `decomposition` that names each part, states its boundary, and records the
dependencies between parts. Do not plan the parts here — that is `plan`.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: decomposition
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
