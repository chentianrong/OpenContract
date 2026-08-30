---
name: review-report
version: v1.0.0
artifactType: review-report
artifactCoreVersion: v1.0.0
description: Findings from a correctness and simplification review.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Findings
      level: 2
      required: true
      minimumContent: 15
      maxOccurrences: 1
validator:
  runtime: python
  entrypoint: validator.py
---

# Review Report Contract

This Contract validates the `review-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Format

Each finding must be anchored to a file location:

```markdown
## Findings

**src/validation/pipeline.ts:42** — When input is null, this crashes without logging the cause. Scenario: API receives malformed JSON, pipeline throws TypeError, no diagnostic reaches the user.

**src/actions/plan.ts:150-158** — This loop recomputes the dependency graph on every iteration. With 10 tasks it runs 100 times; with 100 tasks it would timeout.
```

The validator requires the `**path/to/file.ext:line** — description` format because unanchored findings cannot be acted on. The description content is not validated—agents judge what to report.
