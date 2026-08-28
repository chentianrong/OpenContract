---
name: suggestion
version: v1.0.0
artifactType: suggestion
artifactCoreVersion: v1.0.0
description: Multiple viable options with trade-offs and a recommendation.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Options
      level: 2
      required: true
      minimumContent: 1
    - name: Recommendation
      level: 2
      required: true
      minimumContent: 1
---

# Suggestion Contract

This Contract validates the `suggestion` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the multiple viable options with trade-offs and a recommendation..
