---
name: explore
description: Investigate an open question or unfamiliar area and capture what was learned.
metadata:
  version: v1.0.0
---

# Explore

Use this Action when the goal is still vague, the problem space is unfamiliar, or a
decision needs evidence before it can be framed. Exploration is deliberately
unstructured: read code, run experiments, and follow leads.

Persist a `note` only when a finding is worth carrying into later work. A purely
conversational exploration that reaches an answer immediately needs no Artifact.

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: note
    version: v1.0.0
    required: false
```
