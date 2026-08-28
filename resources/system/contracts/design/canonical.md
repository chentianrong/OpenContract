---
contract: design
version: v1.0.0
action: archive
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
mode: canonical
---

## Overview

State what this scope covers and what its responsibilities are.

## Components

Describe the parts and their relationships.

## Decisions

### Use a central event bus

Events are routed through a central bus rather than point-to-point, because it
decouples producers from consumers and simplifies adding new subscribers.

## Constraints

The non-negotiable requirements this design must satisfy.
