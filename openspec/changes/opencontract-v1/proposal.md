## Why

Agent work is currently difficult to audit and reuse because action guidance, generated Markdown, project specifications, and validation rules have no shared contract or portable tool boundary. OpenContract v1.0.0 establishes a Markdown-first contract system and a small CLI so agents can choose their own actions while every managed result remains structurally and semantically verifiable.

## What Changes

- Introduce an npm-published TypeScript/Node.js 22+ ESM CLI named `opencontract`.
- Add upward workspace discovery with `.opencontract/config.yaml`, safe project-relative paths, and explicit `WORKSPACE_NOT_FOUND` errors.
- Add `init`, `update`, and `doctor` for installing and validating the system layer without overwriting project-owned specs, artifacts, extensions, or configuration.
- Define immutable, exact-versioned Agent Skill actions and Markdown Artifact Contracts, including the shared `artifact-core@v1.0.0` metadata contract.
- Add declaration-driven validation for YAML frontmatter, Markdown AST structure, references, dependency graphs, and trusted Python semantic validators.
- Add `validate` and `validate-action` commands with human-readable output, a stable `--json` ValidationResult protocol, and documented exit codes.
- Add local definition resolution, project/system overrides, exact-version caches, and local registry lookup with validator trust boundaries.
- Ship the `opencontract` entry Skill, twelve MVP business Actions, fourteen MVP Contracts, and generated Codex/Claude/Cursor harness adapters.
- Define task/ActionRun/Artifact directory structure, SDD delta/canonical contracts, decision authorization semantics, and archive-report evidence requirements for agent-driven lifecycle work.
- Add unit, contract-fixture, integration, security, cross-platform, and Skills conformance tests covering the complete initialization-to-update verification path.

## Capabilities

### New Capabilities

- `workspace-system-management`: Workspace discovery, configuration, system package installation/update, definition resolution, cache/registry behavior, doctor checks, and generated harness adapters.
- `artifact-contract-validation`: Artifact-core metadata, Contract packages, declarative Markdown/frontmatter rules, trusted Python validators, references/dependency checks, ValidationResult, and CLI validation behavior.
- `action-run-contracts`: Agent Skill action definitions, action discovery/inspection, the MVP Action and Contract catalog, and ActionRun validation.
- `sdd-and-artifact-lifecycle`: Managed task/ActionRun/Artifact persistence, SDD specification/design modes, Decision authorization, and archive evidence/reference semantics.

### Modified Capabilities

None. This is the initial OpenContract capability set.

## Impact

- Adds the `@opencontract/cli` package, its `opencontract` executable, and the TypeScript source/test tree described by the design document.
- Adds system-owned `.opencontract/` content, generated Harness adapters under `.codex/`, `.claude/`, and `.cursor/`, and user-owned `opencontract/specs/` and `opencontract/artifacts/` roots.
- Introduces dependencies on Commander, YAML/frontmatter parsing, unified/remark, AJV Draft 2020-12, SemVer handling, Python subprocess execution, Vitest, and `skills-ref` validation in CI.
- Establishes stable CLI commands, exact-version definition references, Artifact metadata, validation JSON, error codes, and exit codes that downstream agents and tooling may consume.
