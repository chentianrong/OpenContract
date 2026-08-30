---
name: archive-report
version: v1.0.0
artifactType: archive-report
artifactCoreVersion: v1.0.0
description: Canonical Spec updates, repaired references, and final archive destination.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs, status]
    properties:
      status:
        enum: [completed, abandoned]
  sections:
    - name: Status
      level: 2
      required: true
      minimumContent: 10
      maxOccurrences: 1
    - name: Outcome
      level: 2
      required: true
      minimumContent: 15
      maxOccurrences: 1
    - name: Follow-ups
      level: 2
      required: false
      minimumContent: 10
---

# Archive Report Contract

This Contract validates the `archive-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the canonical spec updates, repaired references, and final archive destination..
