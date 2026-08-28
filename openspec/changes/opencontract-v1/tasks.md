## 1. Package and domain foundation

- [x] 1.1 Scaffold the `@opencontract/cli` ESM package, Node.js 22 engine constraint, `opencontract` bin, TypeScript configuration, Vitest configuration, and `src/`/`test/` layout; verify `pnpm install`, type-check, and an initial test command succeed.
- [x] 1.2 Add the runtime dependencies and package-resource strategy for Commander, YAML/frontmatter parsing, unified/remark, AJV Draft 2020-12, SemVer, and Python subprocess execution; verify a production build includes all bundled resources.
- [x] 1.3 Define shared domain types for workspace roots, definitions, Artifact metadata, Contracts, Actions, validation phases, errors, warnings, and exit codes; verify serialization round-trips in unit tests without terminal-specific strings.
- [x] 1.4 Implement centralized error-code and repair-hint catalogs, including `WORKSPACE_NOT_FOUND`, `ACTION_NOT_FOUND`, `CONTRACT_NOT_FOUND`, path/configuration errors, and validator process/protocol errors; verify each public error maps to the documented exit-code class.

## 2. Workspace configuration and path safety

- [x] 2.1 Implement nearest-ancestor `.opencontract/config.yaml` discovery and default/config parsing, including relative path normalization and trusted-root validation; verify nested-workspace precedence, missing-workspace behavior, invalid YAML, and root-escape rejection.
- [x] 2.2 Implement realpath/symlink-aware path guards for configured roots, Artifact inputs, registries, and generated files; verify absolute paths, `..` traversal, symlink escapes, and directory targets are rejected on POSIX and Windows path fixtures.
- [x] 2.3 Implement `init` directory creation and default configuration/manifest generation for system, cache, project extension, specs, artifacts, and archive roots; verify a fresh initialization creates the documented tree and a second initialization is non-destructive.

## 3. Definition model and bundled catalog

- [x] 3.1 Implement parsers for Action `SKILL.md` frontmatter/OpenContract YAML and Contract packages (`contract.md`, template, variants, validator declaration, fixtures); verify malformed metadata and name/version mismatches are rejected with locations.
- [x] 3.2 Implement exact-version definition resolution across project, system, cache, and local registry sources, including source conflicts, explicit overrides, registry caching, and untrusted-registry validator marking; verify unique, ambiguous, missing, cached, and overridden cases.
- [x] 3.3 Author the `opencontract` entry Skill, twelve v1.0.0 business Action Skills, fourteen v1.0.0 Contract packages, manifest entries, templates, and valid/invalid fixtures; verify package inventory and all metadata pass parser/conformance tests.
- [x] 3.4 Implement `action list`, `action inspect`, `contract list`, and `contract inspect --version` application services and presentation models; verify exact versions, source information, declared inputs/outputs, and not-found behavior are exposed without executing Actions.

## 4. Markdown and Artifact core validation

- [x] 4.1 Implement Markdown/frontmatter parsing that preserves body offsets and heading AST information for diagnostics; verify valid parsing, malformed YAML, missing delimiters, heading levels, and line/column mapping.
- [x] 4.2 Implement `artifact-core@v1.0.0` metadata validation for required fields, kebab-case names, exact versions, RFC 3339 timestamps, unique relative inputs, and managed-root boundaries; verify valid and invalid core fixtures return stable phase/error data.
- [x] 4.3 Implement Contract declarative rule evaluation using Draft 2020-12 frontmatter schemas and Markdown heading/order/occurrence/minimum-content rules; verify required, misordered, duplicate, empty, and allowed-extra cases against fixture expectations.
- [x] 4.4 Implement the shared Contract fixture harness and `contract test <name> --version <vX.Y.Z>` command; verify every bundled Contract’s valid fixtures pass, invalid fixtures fail with expected codes, and templates contain core metadata plus required sections.

## 5. Reference graph and semantic validator pipeline

- [x] 5.1 Implement direct input resolution and recursive graph traversal with visited realpaths, cycle detection, managed Markdown-link discovery, and per-file/directories summaries; verify missing/unsafe inputs, direct-only behavior, recursive cycles, and deterministic traversal order.
- [x] 5.2 Implement trusted-root checks and the Python validator subprocess runner with versioned stdin JSON, stdout-only protocol parsing, stderr capture, timeout, output-size limits, missing-runtime handling, and non-zero/malformed/contaminated response mapping; verify every bounded failure mode terminates and returns the documented error class.
- [x] 5.3 Implement the ordered validation pipeline (`parse`, `artifact_core`, `contract_structure`, `semantic_validator`, `references`, optional `action_contract`) with prerequisite skipping and normalized errors/warnings; verify phase status and aggregation for single files, directories, and recursive dependencies.
- [x] 5.4 Implement human and `opencontract-validation@v1.0.0` JSON presenters with target/contract metadata, phase statuses, locations, messages, warnings, and repair hints; verify golden output fixtures and exit codes `0`/`1`/`2`/`3`.
- [x] 5.5 Wire `validate <file-or-directory> [--recursive] [--json]` to the validation service without mutating source files; verify valid, invalid, configuration-error, and unexpected-error invocations leave all inputs unchanged.

## 6. ActionRun validation and non-orchestration boundary

- [x] 6.1 Implement ActionRun directory-name parsing and direct managed-Markdown enumeration for `{YYYYMMDDTHHmmss}-{short-description}` directories; verify timestamp/description violations, non-Markdown attachments, stray ordinary Markdown, and nested-file handling.
- [x] 6.2 Implement ActionRun contract checking for uniform `action`/`action_version`, merged inputs, required output names/versions, requiredness, minimum counts, and per-output Artifact validation; verify valid runs, missing outputs, inconsistent metadata, and extra valid outputs.
- [x] 6.3 Wire `validate-action <action-directory> [--json]` and ensure unsupported `run`, `next`, `execute`, and `archive` commands fail closed; verify action-level JSON/human summaries and absence of filesystem mutation or scheduling.

## 7. System updates, health checks, and harness adapters

- [x] 7.1 Implement package-resource installation for the system tree and generated Codex/Claude/Cursor entry Skills with stable ownership markers; verify adapters delegate to the system entry Skill and do not duplicate concrete Actions.
- [x] 7.2 Implement transactional `update` staging, complete definition/fixture/adapter validation, exact-version cache snapshots, atomic system replacement, marked-adapter refresh, rollback, and cleanup; verify successful updates preserve project-owned roots and injected failures restore the previous tree.
- [x] 7.3 Implement `doctor` checks for configuration, manifest, definition catalog, trusted roots, caches, generated markers, and adapter conflicts; verify structured diagnostics identify the failing component and include repair hints.
- [x] 7.4 Add `update`/`doctor` CLI wiring and operation-result presentation with configuration/process versus unexpected-failure exit classes; verify fresh, healthy, stale, conflicting, and rollback-recovered workspaces.

## 8. SDD and managed Artifact lifecycle contracts

- [x] 8.1 Author and validate v1.0.0 Contracts/templates/fixtures for `note`, `decision`, `decomposition`, `suggestion`, `proposal`, `specification`, `design`, `tasks`, and all execution/debug/review/verification/report/archive-report types; verify delta/canonical and change/canonical modes plus normative scenario structure.
- [x] 8.2 Implement managed task/ActionRun/Artifact path helpers and checks for timestamped two-level directories, root placement, immutable archive paths, and Artifact `created_at`/input semantics; verify persisted, unpersisted, malformed, and archived layouts.
- [x] 8.3 Implement Decision state validation and authorization-query helpers for pending/decided status, decider, selected option, decision timestamp, and archived immutability; verify pending decisions block gated operations while decided inputs remain traceable.
- [x] 8.4 Implement reusable archive reference discovery/repair and validation services for relative `inputs` and Markdown links, without adding an archive CLI command; verify successful repair, conflict handoff, unsafe-repair halt, and immutable archive destination fixtures.

## 9. CLI, packaging, and user-facing behavior

- [x] 9.1 Implement Commander root command and subcommands for `init`, `update`, `doctor`, `action`, `contract`, `validate`, `validate-action`, and `contract test`; verify help text, argument errors, and command dispatch use application services.
- [x] 9.2 Centralize process lifecycle handling so all commands emit human output by default, JSON only when requested, and documented exit codes without stack traces for expected failures; verify golden CLI snapshots on Linux, macOS, and Windows-compatible shells.
- [x] 9.3 Export reusable library entry points for workspace discovery, definition inspection, Artifact validation, ActionRun validation, and presentation-independent results; verify a Node consumer can import the package without invoking the CLI.
- [x] 9.4 Configure npm package files, resource inclusion, provenance/version metadata, and a reproducible build; verify a packed tarball installs globally or via `pnpm dlx` and `opencontract --help` resolves bundled definitions.

## 10. Integration, security, and conformance verification

- [x] 10.1 Add end-to-end fixtures covering initialization, managed Artifact generation, single/directory/recursive validation, ActionRun validation, inspection, `doctor`, and update success; verify the complete happy path from a clean temporary project.
- [x] 10.2 Add failure-path integration tests for update rollback, source conflicts, path escapes, missing definitions, invalid Contract fixtures, reference cycles, and every validator trust/protocol boundary; verify no unsafe mutation or hanging child process occurs.
- [x] 10.3 Add CI matrices for Linux, macOS, and Windows with Node.js 22 and current LTS, including Python-present and Python-missing validator cases; verify platform-aware path and subprocess assertions pass.
- [x] 10.4 Run `skills-ref validate` for the entry Skill and all twelve business Actions, run the complete Vitest suite, and verify coverage includes every requirement scenario and all fourteen Contract fixture pairs.

## 11. Documentation and release readiness

- [x] 11.1 Update README and add Quick Start, configuration, Contract/Action authoring, validation JSON, trust-boundary, and harness-adapter examples; verify commands and directory paths match the shipped CLI and fixtures.
- [x] 11.2 Document version immutability, cache/registry precedence, update rollback, archive reference rules, and the explicit non-goals (no scheduler/executor/archive CLI); verify documentation review finds no unsupported v1 behavior.
- [x] 11.3 Perform a clean checkout/rebuild/package smoke test and publish a release checklist for `@opencontract/cli@1.0.0`; verify the packed artifact, manifest catalog, generated adapters, and conformance fixtures are all present before implementation is declared ready.
