---
contract: decision
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
status: pending
---

## Question

Should the cache be persisted across restarts, or is an in-memory cache acceptable?

## Options

**Option A — in-memory only.** Simplest to build and no new dependency, but a restart
loses every entry and the first requests after deploy are slow.

**Option B — Redis.** Survives restarts and can be shared between instances, at the
cost of running and monitoring another service.

## Recommendation

Option A, because the cache only holds derived data that is cheap to recompute.
