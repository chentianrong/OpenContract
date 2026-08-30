---
contract: review-report
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

**src/validation/contract-rules.ts:150** — When heading depth does not match the rule's
declared level, the error message says "uses heading level X" but does not state what
level was expected. The detail field carries it, but the message itself is incomplete.
Scenario: a Contract requires level 2, the document uses level 3, the user sees
"Section Foo uses heading level 3" with no hint that level 2 is required.

**src/definitions/parser.ts:92** — The opencontract YAML block extraction regex allows
leading whitespace before the fence, but the regex does not anchor to the start of a
line (`^`), so it could match mid-line. Scenario: a commented example fence inside a
code block would incorrectly trigger the match.
