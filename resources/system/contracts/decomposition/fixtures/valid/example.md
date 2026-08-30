---
contract: decomposition
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Parts

**Contract rule tightening.** Raise section thresholds and add missing sections across
the bundled Contracts. Touches contract.md, templates, and fixtures only.

**Semantic validators.** Add validators for the Contracts whose rules cannot be
expressed as heading checks.

## Dependencies

Semantic validators depend on the rule tightening, because the validators assume the
sections they inspect are already required.
