---
name: debug-report
version: v1.0.0
artifactType: debug-report
artifactCoreVersion: v1.0.0
description: Symptom, reproduction, root cause, and fix.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Symptom
      level: 2
      required: true
      minimumContent: 10
      maxOccurrences: 1
    - name: Reproduction
      level: 2
      required: true
      minimumContent: 10
      maxOccurrences: 1
    - name: Root Cause
      level: 2
      required: true
      minimumContent: 15
      maxOccurrences: 1
    - name: Fix
      level: 2
      required: true
      minimumContent: 10
      maxOccurrences: 1
---

# Debug Report Contract

This Contract validates the `debug-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the symptom, reproduction, root cause, and fix..
