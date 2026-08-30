---
contract: debug-report
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Symptom

Fixture conformance test fails with "template: artifact-core field 'status' missing"
for decision and archive-report Contracts.

## Reproduction

Run `pnpm test:run test/contract-fixtures.test.ts` after adding `status` to the
frontmatter schema but before updating the template.

## Root Cause

The template validator checks that every required frontmatter field appears in
template.md. The schema was updated but the template was not.

## Fix

Added `status: pending` to decision/template.md and `status: completed` to
archive-report/template.md.
