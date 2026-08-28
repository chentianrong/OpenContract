---
name: suggest
description: Offer options for how to proceed, with a recommendation.
metadata:
  version: v1.0.0
---

# Suggest

Use this Action when several approaches are viable and the choice benefits from being
made explicit before implementation starts.

Produce a `suggestion` recording each option with its trade-offs and a clear
recommendation. When the choice requires authorization rather than advice, use `clarify`
instead.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
  - contract: decomposition
    version: v1.0.0
    required: false
outputs: 
  - contract: suggestion
    version: v1.0.0
    required: true
    minCount: 1
```
