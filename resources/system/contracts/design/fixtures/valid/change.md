---
contract: design
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
mode: change
scope: example-scope
---

## Overview

State what is being changed and why this change is needed.

## Affected Components

List the parts of the system this change touches.

## Decisions

### Use a central event bus

Route events through a central bus instead of point-to-point messaging, because
it decouples producers from consumers and simplifies adding new subscribers.

## Trade-offs

What alternatives were considered and why this approach was selected.
