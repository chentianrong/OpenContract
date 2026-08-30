---
contract: report
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Summary

Tightened the declarative rules on the bundled Contracts and added semantic validators
for the four report types whose requirements heading rules cannot express.

## Outcomes

Every Contract now declares a content threshold per section, and four Contracts gained
a validator.

## Decisions

Thresholds are expressed in characters rather than words, matching what the validation
engine already measures.

## Learnings

A `minimumContent` of 1 is indistinguishable from no rule at all — an empty section with
a single stray character satisfied it.
