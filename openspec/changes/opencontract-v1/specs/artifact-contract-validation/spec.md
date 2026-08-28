## Purpose

Defines the portable Markdown Artifact Contract and validation protocol that lets agents and downstream tools determine whether managed outputs are structurally valid, semantically trusted, and safely connected to other project artifacts.

## ADDED Requirements

### Requirement: Enforce the artifact-core metadata contract

Every managed Markdown Artifact SHALL have parseable frontmatter containing `contract`, exact `version`, `action`, exact `action_version`, timezone-aware RFC 3339 `created_at`, and an `inputs` array. Contract and action names SHALL be lowercase kebab-case; versions SHALL match `vX.Y.Z`; `inputs` SHALL be unique slash-separated relative paths resolved from the Artifact's directory.

#### Scenario: Valid core metadata is accepted
- **WHEN** a managed Markdown file contains all required fields with valid names, versions, timestamp, and an empty or valid unique inputs array
- **THEN** the artifact-core phase passes

#### Scenario: Invalid metadata is rejected
- **WHEN** a file omits a required field, uses a non-exact version, an invalid name, a non-RFC-3339 timestamp, or duplicate inputs
- **THEN** validation fails in the artifact-core phase with a stable error code and source location

### Requirement: Enforce Contract package authority and declarative structure

Each resolvable Contract SHALL have an authoritative `contract.md` declaring its name, exact version, artifact type, artifact-core version, template, and optional semantic validator, with optional template variants and valid/invalid fixtures. The Contract's declarative rules SHALL validate frontmatter using JSON Schema Draft 2020-12 and Markdown using headings, levels, order, occurrence limits, and minimum content; templates SHALL guide writing but SHALL NOT act as a second authority.

#### Scenario: Required sections and frontmatter are validated
- **WHEN** an Artifact is checked against a Contract with required schema fields and ordered Markdown sections
- **THEN** validation fails for missing, extra-disallowed, misordered, over-counted, or empty required content according to the declared rules

#### Scenario: Template changes do not change validity by themselves
- **WHEN** a Contract template contains a prompt or formatting variation but `contract.md` rules are unchanged
- **THEN** the validator applies the rules from `contract.md` and does not infer additional requirements from the template

### Requirement: Validate references and dependency graphs safely

Artifact inputs SHALL point to other managed Markdown Artifacts within `opencontract/`; absolute paths, directory traversal, duplicate references, and symlink escapes SHALL be rejected. Default validation SHALL check direct inputs for existence, parseability, and valid public metadata. `--recursive` SHALL traverse transitive inputs and detect dependency cycles; Markdown links affected by managed moves SHALL be treated as references for repair and validation.

#### Scenario: Direct input validation
- **WHEN** an Artifact declares a relative input to an existing managed Markdown Artifact
- **THEN** the reference phase validates the target and the default command does not inspect unrelated transitive inputs

#### Scenario: Unsafe or missing input is rejected
- **WHEN** an input is absolute, escapes `opencontract/`, resolves through a symlink escape, targets a directory, or does not exist
- **THEN** the reference phase fails with the path and target details

#### Scenario: Recursive cycle detection
- **WHEN** `--recursive` traverses inputs that eventually point back to an ancestor Artifact
- **THEN** validation fails with a dependency-cycle error and identifies the cycle path

### Requirement: Execute only trusted semantic validators through a bounded protocol

Custom semantic validators SHALL execute only when their entrypoint lies under an explicitly trusted root. The CLI SHALL run the MVP Python validator in an independent subprocess, send a versioned JSON request on stdin, accept protocol JSON only on stdout, reserve stderr for logs, enforce configured timeout and output limits, and convert timeout, missing runtime, malformed JSON, stdout contamination, non-zero exit, and oversized output into deterministic validation errors. Validators SHALL return errors and repair hints but SHALL NOT auto-edit Artifacts.

#### Scenario: Valid validator response
- **WHEN** a trusted Python validator receives a valid request and returns protocol JSON with `valid`, `errors`, and optional `repair_hints`
- **THEN** the semantic-validator phase incorporates that result into the unified ValidationResult

#### Scenario: Untrusted validator is blocked
- **WHEN** a Contract references a validator outside configured trusted roots or from a registry without explicit trust
- **THEN** the validator is not executed and the result marks the semantic phase as skipped or configuration-invalid according to the trust error

#### Scenario: Validator protocol failure is bounded
- **WHEN** the validator times out, emits non-JSON or logs on stdout, exits non-zero, exceeds output limits, or Python is unavailable
- **THEN** validation terminates within the configured bounds and returns a deterministic process/protocol error without hanging the CLI

### Requirement: Produce a stable ValidationResult and CLI contract

`validate` SHALL support a file or directory target, optional `--recursive`, and optional `--json`. Human output SHALL summarize each check and repair hint; JSON output SHALL use protocol `opencontract-validation` version `v1.0.0`, include target/contract metadata, phase statuses (`parse`, `artifact_core`, `contract_structure`, `semantic_validator`, `references`, and where applicable `action_contract`), errors, and warnings. Exit code `0` SHALL mean valid, `1` invalid content, `2` configuration/definition/trust/parameter error, and `3` unexpected validation failure.

#### Scenario: Valid Artifact returns success
- **WHEN** all applicable validation phases pass
- **THEN** human and JSON output report `valid: true` and the process exits `0`

#### Scenario: Invalid Artifact returns repairable failure
- **WHEN** a required phase finds a contract or reference violation
- **THEN** output reports `valid: false` with stable code, phase, path/location, message, and repair hint, and the process exits `1`

#### Scenario: Configuration or runtime error is distinguished
- **WHEN** the Contract cannot be resolved, trust configuration is invalid, or validation cannot run as configured
- **THEN** output identifies the configuration/process failure and the process exits `2` or `3` as specified rather than misreporting an Artifact defect
