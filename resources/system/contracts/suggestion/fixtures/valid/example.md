---
contract: suggestion
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Options

**Option A — validate in the parser.** Errors surface at parse time with exact line
numbers, but the parser takes on rules that are not structural.

**Option B — validate in a separate pass.** Keeps the parser focused and makes the
rules testable on their own, at the cost of walking the document twice.

## Recommendation

Option B, because the rules will keep growing and a separate pass keeps them isolated.
