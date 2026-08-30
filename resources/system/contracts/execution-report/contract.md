---
name: execution-report
version: v1.0.0
artifactType: execution-report
artifactCoreVersion: v1.0.0
description: What was implemented, what was verified, and what remains.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Completed
      level: 2
      required: true
      minimumContent: 15
      maxOccurrences: 1
    - name: Verified
      level: 2
      required: true
      minimumContent: 10
      maxOccurrences: 1
    - name: Skipped
      level: 2
      required: false
      minimumContent: 10
---

# Execution Report Contract

This Contract validates the `execution-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the what was implemented, what was verified, and what remains..
