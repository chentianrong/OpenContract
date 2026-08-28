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
      minimumContent: 1
---

# Review Report Contract

This Contract validates the `review-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the findings from a correctness and simplification review..
