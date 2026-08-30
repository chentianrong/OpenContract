---
name: decomposition
version: v1.0.0
artifactType: decomposition
artifactCoreVersion: v1.0.0
description: A large goal broken into independently workable parts.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Parts
      level: 2
      required: true
      minimumContent: 30
      maxOccurrences: 1
    - name: Dependencies
      level: 2
      required: false
      minimumContent: 10
---

# Decomposition Contract

This Contract validates the `decomposition` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the a large goal broken into independently workable parts..
