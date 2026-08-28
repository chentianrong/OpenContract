---
name: verify
description: Check delivered work against its specified behavior.
metadata:
  version: v1.0.0
---

# Verify

Use this Action to confirm that what was built matches what was specified. Run the
project's build and tests, and check each specified scenario.

Produce a `verification-report` stating what was checked, what passed, what failed with
the actual output, and what could not be verified.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: specification
    version: v1.0.0
    required: false
  - contract: tasks
    version: v1.0.0
    required: false
  - contract: execution-report
    version: v1.0.0
    required: false
outputs: 
  - contract: verification-report
    version: v1.0.0
    required: true
    minCount: 1
```
