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
      minimumContent: 10
      maxOccurrences: 1
    - name: Results
      level: 2
      required: true
      minimumContent: 15
      maxOccurrences: 1
validator:
  runtime: python
  entrypoint: validator.py
---

# Verification Report Contract

This Contract validates the `verification-report` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Format

Each scenario in the Results section must declare an outcome:

```markdown
## Results

**Scenario: User can log in with valid credentials** — PASSED.

**Scenario: API rejects expired tokens** — FAILED. Expected 401 Unauthorized, got 200 OK with stale data.

**Scenario: Rate limiting triggers after 100 requests** — Could not be verified (requires production traffic pattern).
```

The validator checks that each scenario line includes an outcome keyword (passed, failed, unverifiable, etc.). How the outcome is justified is not validated—agents judge what evidence suffices.
