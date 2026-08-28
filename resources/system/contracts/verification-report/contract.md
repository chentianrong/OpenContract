---
name: verification-report
version: v1.0.0
artifactType: verification-report
artifactCoreVersion: v1.0.0
description: What was checked, what passed, what failed, what could not be verified.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Checked
      level: 2
      required: true
      minimumContent: 1
    - name: Results
      level: 2
      required: true
      minimumContent: 1
---

# Verification Report Contract

This Contract validates the `verification-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the what was checked, what passed, what failed, what could not be verified..
