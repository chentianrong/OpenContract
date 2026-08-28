---
name: specification
version: v1.0.0
artifactType: specification
artifactCoreVersion: v1.0.0
description: Required behavior described with normative language and verifiable scenarios.
template: template.md
variants:
  - name: delta
    file: template.md
  - name: canonical
    file: canonical.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs, mode]
    properties:
      mode:
        enum: [delta, canonical]
      capability:
        type: string
        pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
    allOf:
      - if:
          properties:
            mode:
              const: delta
          required: [mode]
        then:
          required: [capability]
  sections:
    - name: Purpose
      level: 2
      required: true
      minimumContent: 1
validator:
  runtime: python
  entrypoint: validator.py
---

# Specification Contract

Describes required behavior. Two modes serve different purposes, and the mode is
declared in frontmatter rather than inferred from the body.

## Modes

`mode: delta` records a change to a capability. It names the `capability` it
changes and groups requirements under `## ADDED Requirements`,
`## MODIFIED Requirements`, or `## REMOVED Requirements`. This is the form an
agent writes while planning work.

`mode: canonical` describes current effective behavior. It carries no delta
markers, because a canonical document states what is true now rather than what
changed. This is the form that lives under `opencontract/specs/`.

## Requirement structure

Under a delta section, each requirement is a `### Requirement: <name>` heading
whose body uses normative language (SHALL, MUST, SHOULD, MAY) and includes at
least one verifiable scenario:

```markdown
### Requirement: Reject expired tokens

The API SHALL reject a request whose token has expired.

#### Scenario: Expired token is rejected
- **WHEN** a request carries a token whose `exp` is in the past
- **THEN** the API responds 401 and does not process the request
```

The semantic validator enforces the parts a heading rule cannot: that delta mode
uses at least one delta section, that canonical mode uses none, that each
requirement states normative behavior, and that each has a scenario with both a
WHEN and a THEN.
