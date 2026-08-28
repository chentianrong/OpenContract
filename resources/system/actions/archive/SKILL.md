---
name: archive
description: Fold validated task facts into canonical Specs and archive the task.
metadata:
  version: v1.0.0
---

# Archive

Use this Action when a task is complete and its durable facts belong in the canonical
Specs. Determine which content is a new project fact, apply the needed
create/merge/rewrite/split/remove changes, and validate the result.

Because managed `inputs` are relative, rewrite affected inputs and Markdown links before
moving the task directory under the archive root. If a reference cannot be repaired
safely, or a merge would cause a material conflict, stop and request a decided Decision
instead of guessing.

## Declared contracts

```yaml opencontract
inputs: 
  - contract: report
    version: v1.0.0
    required: false
  - contract: verification-report
    version: v1.0.0
    required: false
  - contract: decision
    version: v1.0.0
    required: false
outputs: 
  - contract: archive-report
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```
