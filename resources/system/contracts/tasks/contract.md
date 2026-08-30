---
name: tasks
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
description: An ordered, verifiable task list.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Tasks
      level: 2
      required: true
      minimumContent: 20
      maxOccurrences: 1
validator:
  runtime: python
  entrypoint: validator.py
---

# Tasks Contract

This Contract validates the `tasks` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Format

The Tasks section must be a checkbox list so completion can be tracked:

```markdown
## Tasks

- [ ] Add validation pipeline for new Contract
- [ ] Update fixtures to match new rules
- [ ] Run full test suite and verify conformance
```

Each task opens with `- [ ]` (unchecked) or `- [x]` (checked). The validator rejects prose paragraphs under the Tasks heading because they cannot be marked complete.
