---
name: decision
version: v1.0.0
artifactType: decision
artifactCoreVersion: v1.0.0
description: A question requiring human authorization, with options and a recommendation.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Question
      level: 2
      required: true
      minimumContent: 1
    - name: Options
      level: 2
      required: true
      minimumContent: 1
    - name: Recommendation
      level: 2
      required: true
      minimumContent: 1
---

# Decision Contract

This Contract validates the `decision` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the a question requiring human authorization, with options and a recommendation..
