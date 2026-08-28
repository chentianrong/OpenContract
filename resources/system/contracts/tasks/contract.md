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
      minimumContent: 1
---

# Tasks Contract

This Contract validates the `tasks` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the an ordered, verifiable task list..
