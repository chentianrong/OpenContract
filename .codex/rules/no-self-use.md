# OpenContract Project Development Rules

When working on the OpenContract project itself, **do not use OpenContract skills or commands**. This project is the implementation of the OpenContract system, and using its own capabilities during development would create circular dependencies and confusion.

## Prohibited during OpenContract development:

- Do NOT invoke `/oc:*` commands (e.g., `/oc:explore`, `/oc:build`, `/oc:validate`)
- Do NOT use `oc-*` skills (e.g., `oc-explore`, `oc-build`)
- Do NOT call `opencontract` CLI commands unless explicitly testing the CLI itself

## Allowed:

- Use `/opsx:*` commands for managing OpenSpec change workflows
- Use standard development workflows (read, edit, test, commit)
- Test OpenContract commands when explicitly verifying CLI behavior

This rule prevents self-referential confusion and ensures clean separation between developing OpenContract and using OpenContract.
