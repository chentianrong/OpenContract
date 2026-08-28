---
name: design
version: v1.0.0
artifactType: design
artifactCoreVersion: v1.0.0
description: Architectural decisions and component relationships.
template: template.md
variants:
  - name: change
    file: template.md
  - name: canonical
    file: canonical.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs, mode]
    properties:
      mode:
        enum: [change, canonical]
      scope:
        type: string
        pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
    allOf:
      - if:
          properties:
            mode:
              const: change
          required: [mode]
        then:
          required: [scope]
  sections:
    - name: Overview
      level: 2
      required: true
      minimumContent: 1
validator:
  runtime: python
  entrypoint: validator.py
---

# Design Contract

Records architectural decisions and component relationships. Two modes serve
different purposes, and the mode is declared in frontmatter rather than inferred
from the body.

## Modes

`mode: change` records a proposed or decided architectural change. It names the
`scope` it affects and structures the body around what changes and why. This is
the form an agent writes while designing a solution.

`mode: canonical` describes the current effective architecture. It carries no
delta markers, because a canonical document states what is true now rather than
what changed. This is the form that lives under `opencontract/specs/`.

## Content structure

A change document typically includes:
- **Overview**: what is being changed and why
- **Affected components**: which parts of the system are touched
- **Design decisions**: the choices made and their rationales
- **Trade-offs**: what was considered and why this approach was selected

A canonical document typically includes:
- **Overview**: what this scope covers
- **Components**: the parts and their relationships
- **Decisions**: the standing architectural choices
- **Constraints**: the non-negotiable requirements the design must satisfy

The semantic validator enforces that change mode declares a scope and that
canonical mode uses descriptive rather than change-oriented language.
