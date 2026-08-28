---
name: report
version: v1.0.0
artifactType: report
artifactCoreVersion: v1.0.0
description: A standalone summary of a body of work.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Summary
      level: 2
      required: true
      minimumContent: 1
---

# Report Contract

This Contract validates the `report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the a standalone summary of a body of work..
