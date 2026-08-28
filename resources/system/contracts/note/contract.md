---
name: note
version: v1.0.0
artifactType: note
artifactCoreVersion: v1.0.0
description: An informal observation, finding, or idea captured during exploration.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
---

# Note Contract

This Contract validates the `note` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the an informal observation, finding, or idea captured during exploration..
