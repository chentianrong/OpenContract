---
contract: verification-report
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Checked

Verified every scenario in the specification Contract's canonical.md fixture: that delta
mode rejects documents with no delta sections, that canonical mode rejects documents
carrying delta sections, that every requirement heading is followed by normative language
and at least one scenario.

## Results

**Scenario: Delta mode without delta sections** — PASSED. Validator returned
`valid: false` with code `SPEC_DELTA_SECTION_MISSING`.

**Scenario: Canonical mode with delta sections** — PASSED. Validator returned
`valid: false` with code `SPEC_CANONICAL_DELTA_FORBIDDEN`.

**Scenario: Requirement without normative language** — PASSED. Validator rejected with
`SPEC_REQUIREMENT_NOT_NORMATIVE`.

**Scenario: Requirement without scenario** — PASSED. Validator rejected with
`SPEC_REQUIREMENT_NO_SCENARIO`.
