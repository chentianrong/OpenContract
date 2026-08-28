---
name: clarify
description: Resolve an ambiguity by asking the user and recording the decision.
metadata:
  version: v1.0.0
---

# Clarify

Use this Action when work cannot proceed correctly under any assumption: the requirement
is genuinely ambiguous, the trade-off is the user's to make, or the change is material
enough to need authorization.

Record the question, the options considered, and the recommendation as a `decision`.
Leave it `pending` until the user answers; a gated operation must not proceed on a
pending Decision.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: false
outputs: 
  - contract: decision
    version: v1.0.0
    required: true
    minCount: 1
```
