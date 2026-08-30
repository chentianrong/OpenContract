---
contract: proposal
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Why

Contract rules currently accept documents whose required sections are technically
present but empty, so validation passes on artifacts that carry no usable content.

## What Changes

Raise the per-section minimum content thresholds and add the sections that reports
already rely on in practice. Out of scope: changing the validation engine itself.

## Impact

Artifacts that previously passed with placeholder sections will now fail with a
SECTION_EMPTY error naming the section and the required length.
