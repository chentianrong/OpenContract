## Purpose

Provides a deterministic, project-safe workspace and system-definition layer for installing, upgrading, discovering, and adapting OpenContract without taking ownership of user artifacts or project specifications.

## ADDED Requirements

### Requirement: Workspace discovery and safe configuration

The system SHALL search from the current directory toward its ancestors and use the nearest `.opencontract/config.yaml` as the workspace configuration. If no configuration is found, commands SHALL return `WORKSPACE_NOT_FOUND` and SHALL NOT initialize a workspace implicitly. Configured paths and trusted roots SHALL be relative to the workspace root and SHALL resolve within it.

#### Scenario: Nested workspace selects the nearest configuration
- **WHEN** a nested directory and an ancestor both contain `.opencontract/config.yaml`
- **THEN** the command uses the nested configuration and treats its parent directory as the workspace root

#### Scenario: Missing configuration is reported without mutation
- **WHEN** a command runs from a directory with no discoverable configuration
- **THEN** it returns `WORKSPACE_NOT_FOUND` and creates no `.opencontract`, `opencontract`, or harness files

#### Scenario: Escaping path is rejected
- **WHEN** a configured path or trusted root resolves outside the workspace root, including through a symlink
- **THEN** configuration validation fails with an explicit path/configuration error before user content is read or written

### Requirement: Initialize a project-owned workspace

The `init` operation SHALL create the system directories, user `opencontract/specs` and `opencontract/artifacts/archive` roots, default configuration, system manifest, and selected harness adapter. It MUST preserve all pre-existing user files and MUST stop with guidance to use `update` when a workspace already exists.

#### Scenario: Fresh initialization
- **WHEN** `init` is run in a directory without an OpenContract workspace
- **THEN** the required system, cache, extension, specs, artifacts, archive, configuration, manifest, and generated adapter paths are created

#### Scenario: Existing workspace is not reinitialized
- **WHEN** `init` is run where `.opencontract/config.yaml` already exists
- **THEN** the operation stops, reports that the workspace exists, and recommends `update` without deleting or replacing any content

### Requirement: Perform atomic, recoverable system updates

The `update` operation SHALL stage the new system package, validate all bundled definitions and generated adapter templates, cache the current exact versions, atomically replace only `.opencontract/system/`, refresh generated adapters, and run health checks. If any staged validation or replacement step fails, the previous system and generated adapters SHALL be restored.

#### Scenario: Successful update preserves project-owned content
- **WHEN** a valid newer system package is available
- **THEN** the system and generated adapters are updated, the manifest records exact versions, and project extensions, configuration, specs, artifacts, and cache entries remain intact

#### Scenario: Failed update rolls back
- **WHEN** a bundled Action, Contract, adapter, or health check fails validation during update
- **THEN** the command reports failure and the prior system tree and generated adapters remain usable

### Requirement: Resolve exact-version definitions with explicit precedence

Definition resolution SHALL accept only exact `vMAJOR.MINOR.PATCH` references. It SHALL resolve unique project or system definitions, report a source conflict when the same name/version is present in multiple sources, require an explicit project override when both project and system definitions exist for a new unqualified selection, then fall back to cached history and finally an explicit local registry. Missing definitions SHALL produce `ACTION_NOT_FOUND` or `CONTRACT_NOT_FOUND`. Registry-provided validators SHALL be treated as untrusted by default.

#### Scenario: Exact definition resolves from the unique source
- **WHEN** one project or system definition matches the requested name and exact version
- **THEN** that definition is selected without silently upgrading or applying a version range

#### Scenario: Ambiguous sources fail closed
- **WHEN** the requested name and version exists in more than one source without an applicable override
- **THEN** resolution fails with a source-conflict error and does not choose a definition heuristically

#### Scenario: Cache and registry fallback
- **WHEN** no current definition exists but an exact cached version or local registry entry exists
- **THEN** the exact fallback definition is used, registry content is cached, and its semantic validator remains blocked unless explicitly trusted

### Requirement: Install and report generated harness adapters

The system SHALL generate one standard `opencontract` entry Skill for each selected Codex, Claude, or Cursor harness. Generated files SHALL carry a marker so `init` and `update` replace only files owned by OpenContract; the entry Skill SHALL delegate to the system entry Action rather than duplicate concrete Actions. `doctor` SHALL report missing, malformed, conflicting, or stale system, definition, configuration, and adapter state.

#### Scenario: Generated adapter delegates to the system entry point
- **WHEN** a supported harness adapter is installed
- **THEN** its `opencontract` entry invokes or guides loading `.opencontract/system/actions/opencontract/SKILL.md` and does not copy the concrete Action catalog

#### Scenario: User harness files are preserved
- **WHEN** a harness directory contains an unmarked user-authored file with the same general purpose
- **THEN** `init` or `update` leaves that file untouched and reports the ownership conflict for human resolution

#### Scenario: Doctor reports an unhealthy workspace
- **WHEN** a system manifest, definition, adapter marker, or configuration is invalid or missing
- **THEN** `doctor` returns a structured diagnostic identifying the failing component and a repair hint
