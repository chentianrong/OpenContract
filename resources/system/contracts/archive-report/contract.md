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
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Updates
      level: 2
      required: true
      minimumContent: 1
    - name: Destination
      level: 2
      required: true
      minimumContent: 1
---

# Archive Report Contract

This Contract validates the `archive-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the canonical spec updates, repaired references, and final archive destination..
