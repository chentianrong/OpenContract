## Purpose

Defines how OpenContract describes discoverable agent Actions, their reusable input/output contracts, and the validation boundary for a tracked ActionRun without turning the CLI into a workflow scheduler or executor.

## Requirements

### Requirement: Describe Actions as standard Agent Skills

Every concrete Action SHALL be defined by a standards-compliant `SKILL.md` whose parent directory name matches frontmatter `name`, includes a useful `description`, and declares an exact `metadata.version` in `vX.Y.Z` form. Its `yaml opencontract` block SHALL declare machine-readable input and output Artifact contracts, requiredness, and minimum counts; non-structured Actions MAY declare empty inputs and outputs.

#### Scenario: Valid Action definition is discoverable
- **WHEN** a Skill directory contains matching name, description, exact version, and a parseable OpenContract input/output declaration
- **THEN** the Action can be listed, inspected, and resolved by exact name/version

#### Scenario: Invalid Skill metadata is rejected
- **WHEN** a Skill has a mismatched directory/name, missing description/version, invalid version, or malformed contract block
- **THEN** definition validation fails and the Action is not offered as a valid definition

### Requirement: Discover Actions and Contracts through stable inspection commands

The CLI SHALL provide `action list`, `action inspect <name>`, `contract list`, and `contract inspect <name> --version <vX.Y.Z>` views that use the same exact-version resolution and precedence rules as validation. Inspection SHALL expose names, descriptions or contract metadata, versions, source, and declared inputs/outputs without executing an Action.

#### Scenario: Listing shows available definitions
- **WHEN** a configured workspace contains system and project definitions
- **THEN** list commands return the available valid definitions with exact versions and source information

#### Scenario: Inspection distinguishes missing definitions
- **WHEN** a requested Action or Contract cannot be resolved exactly
- **THEN** inspect returns the corresponding not-found error and does not silently select another version

### Requirement: Ship the v1.0.0 Action and Contract catalog

The system distribution SHALL include the `opencontract` entry Action plus the twelve business Actions `explore`, `clarify`, `decompose`, `suggest`, `build`, `plan`, `execute`, `debug`, `review`, `verify`, `report`, and `archive`, all at exact version `v1.0.0`. It SHALL include the fourteen Contracts `note`, `decision`, `decomposition`, `suggestion`, `proposal`, `specification`, `design`, `tasks`, `execution-report`, `debug-report`, `review-report`, `verification-report`, `report`, and `archive-report`, all at exact version `v1.0.0`.

#### Scenario: Catalog completeness
- **WHEN** a fresh system installation is inspected
- **THEN** all required entry/business Actions and Contracts are present at `v1.0.0` and pass Skills/Contract conformance checks

#### Scenario: Action output boundary is respected
- **WHEN** a tracked ActionRun is evaluated against its Action definition
- **THEN** required output Contract names and minimum counts are enforced while additional valid declared or optional Artifacts remain permitted

### Requirement: Validate a tracked ActionRun against its Action contract

`validate-action` SHALL accept an Action directory whose name matches `{YYYYMMDDTHHmmss}-{short-description}`, scan only managed Markdown outputs directly under that directory, require consistent `action` and `action_version`, resolve and validate each output Artifact, merge their direct inputs, and check the Action's required input/output names, exact versions, requiredness, and counts. Non-Markdown attachments MAY remain in the directory but SHALL not participate in Contract validation; ordinary Markdown without managed frontmatter SHALL NOT be mixed into the Action directory.

#### Scenario: Valid ActionRun passes
- **WHEN** a correctly named Action directory contains consistent, valid managed outputs satisfying the Action's declared inputs and outputs
- **THEN** `validate-action` reports a valid ActionRun

#### Scenario: Missing required output fails
- **WHEN** a tracked ActionRun lacks a required output or has too few instances for a minimum count
- **THEN** the action-contract phase fails and identifies the missing contract/count

#### Scenario: Inconsistent or stray Markdown fails
- **WHEN** outputs disagree on Action identity/version or an ordinary frontmatter-free Markdown file is mixed into the Action directory
- **THEN** validation fails before declaring the ActionRun valid

### Requirement: Keep the CLI non-orchestrating

The MVP CLI SHALL expose discovery, inspection, initialization, update, health, and validation operations only. It MUST NOT provide `run`, `next`, `execute`, or `archive` commands, MUST NOT maintain a central workflow state or database, and MUST NOT decide the next Action or automatically modify source code or Artifacts.

#### Scenario: Unsupported orchestration command
- **WHEN** a user invokes an orchestration command such as `opencontract run` or `opencontract next`
- **THEN** the CLI reports that the command is unavailable rather than executing or scheduling an Action

#### Scenario: Validation does not mutate content
- **WHEN** validation finds errors
- **THEN** it returns diagnostics and repair hints while leaving source, Artifact, and task files unchanged
