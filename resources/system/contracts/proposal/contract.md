---
name: proposal
version: v1.0.0
artifactType: proposal
artifactCoreVersion: v1.0.0
description: "A statement of intended change: why, what, and impact."
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Why
      level: 2
      required: true
      minimumContent: 1
    - name: What Changes
      level: 2
      required: true
      minimumContent: 1
    - name: Impact
      level: 2
      required: true
      minimumContent: 1
---

# Proposal Contract

This Contract validates the `proposal` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the a statement of intended change: why, what, and impact..
