---
name: explore
description: Investigate an open question or unfamiliar area and capture what was learned.
metadata:
  version: v1.0.0
---

# Explore

Use this Action when the goal is still vague, the problem space is unfamiliar, or a
decision needs evidence before it can be framed. Exploration is deliberately
unstructured: read code, run experiments, and follow leads.

Persist a `note` only when a finding is worth carrying into later work. A purely
conversational exploration that reaches an answer immediately needs no Artifact.

## When to use this Action

Use `explore` when:
- The request is open-ended ("how does X work?", "what options do we have?")
- You need to understand unfamiliar code or systems before proposing a direction
- Evidence is needed to frame a decision or narrow a problem space
- The user asked a question that requires investigation rather than immediate action

Do NOT use `explore` when:
- The goal is already clear and actionable → use `build` to state intent, then `plan`
- You're implementing a known approach → use `execute`
- You're diagnosing a specific defect → use `debug` instead

## Process

1. **Frame the question** — State what you're investigating and what finding would be useful
2. **Follow leads** — Read code, run experiments, trace dependencies; prioritize verifiable facts over speculation
3. **Record findings** — If a discovery is worth carrying forward (non-obvious behavior, architectural constraint, reusable insight), write a `note` Artifact
4. **Conversational closure** — If the exploration answered the question immediately and nothing needs persistence, close conversationally without producing an Artifact

## Quality checklist

Before producing a `note` (if one is needed):
- [ ] The finding is non-obvious and would be useful in later Actions
- [ ] The note states what was learned, not just what was done
- [ ] Assertions are grounded in evidence (code you read, output you observed)

## Common patterns

**Targeted investigation**: Start narrow. Read the relevant files first; only widen scope if the answer isn't there.

**Trace dependencies**: When understanding a feature, follow the call chain rather than reading unrelated code.

**Note worthy findings**: Architecture decisions, non-obvious invariants, failure modes, reusable patterns. Don't note trivial facts.

**Conversational when sufficient**: Many explorations resolve in dialogue. Only produce a `note` when the finding has forward value.

## Anti-patterns

**Speculation without verification**: Guessing how code behaves instead of reading or running it.

**Over-documenting**: Producing a `note` for facts obvious from the code itself, or for conversations that already reached closure.

**Scope creep**: Exploring unrelated areas because they're interesting. Stay focused on the question that triggered the exploration.

**Summarizing without insight**: A `note` that restates what the code already says adds no value. Record the non-obvious part.

## Handoff points

- **From**: User questions, ambiguous requirements, or as a precursor to any Action when context is missing
- **To**: `clarify` (frame a decision from findings), `suggest` (propose options grounded in evidence), `decompose` (break down what you learned), `build` (state intent now that the landscape is clear)

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: note
    version: v1.0.0
    required: false
```
