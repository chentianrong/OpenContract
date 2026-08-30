## Purpose

Automatically migrates v1.0.0 projects with local system trees to the v1.1.0 global system model, preserving cache history and project content while eliminating duplication.

## ADDED Requirements

### Requirement: Detect v1.0.0 local system structure

Migration detection SHALL check for `.opencontract/system/manifest.yaml` in the project directory. If present, the project is a v1.0.0 workspace requiring migration. Detection SHALL run automatically during `opencontract update` when executed inside a project.

#### Scenario: Detect v1.0.0 project with local system
- **WHEN** `opencontract update` runs inside a project and `.opencontract/system/manifest.yaml` exists
- **THEN** migration detection identifies the project as v1.0.0 and triggers migration

#### Scenario: Skip migration for v1.1.0 projects
- **WHEN** `opencontract update` runs inside a project and `.opencontract/system/` does not exist
- **THEN** migration detection identifies the project as already migrated and skips migration logic

### Requirement: Install global system if missing during migration

If migration detection identifies a v1.0.0 project and `~/.opencontract/system/` does not exist, migration SHALL install the global system by invoking the installation logic before proceeding with project migration.

#### Scenario: Migration installs global system when missing
- **WHEN** migration runs for a v1.0.0 project and `~/.opencontract/` does not exist
- **THEN** migration installs global system to `~/.opencontract/`, then proceeds with project-specific migration steps

#### Scenario: Migration reuses existing global system
- **WHEN** migration runs for a v1.0.0 project and `~/.opencontract/system/` already exists
- **THEN** migration skips global installation and proceeds directly with project migration

### Requirement: Migrate cache to global directory without overwriting

Migration SHALL copy `.opencontract/cache/` to `~/.opencontract/cache/` if the project cache exists. It SHALL merge cache entries without overwriting existing versions in the global cache. Each cached version is immutable; if both local and global cache contain the same version, the global version takes precedence and the local copy is skipped.

#### Scenario: Merge project cache into global cache
- **WHEN** migration runs and `.opencontract/cache/v1.0.0/` exists locally
- **THEN** migration copies `v1.0.0/` to `~/.opencontract/cache/v1.0.0/` if it does not already exist there

#### Scenario: Skip overwriting existing cached versions
- **WHEN** migration finds `~/.opencontract/cache/v1.0.0/` already exists
- **THEN** migration skips copying the local `v1.0.0/` and reports that version already exists in global cache

#### Scenario: Handle empty local cache
- **WHEN** migration runs and `.opencontract/cache/` does not exist or is empty
- **THEN** migration skips cache copy step and proceeds with config update

### Requirement: Rewrite project config to reference global system

Migration SHALL update `.opencontract/config.yaml` to change `system: .opencontract/system` to `system: ~/.opencontract/system` and `cache: .opencontract/cache` to `cache: ~/.opencontract/cache`. If `trust.validatorRoots` contains `.opencontract/system`, it SHALL be updated to `~/.opencontract/system`. All other config fields SHALL remain unchanged.

#### Scenario: Update system and cache paths to global
- **WHEN** migration rewrites `.opencontract/config.yaml`
- **THEN** `system` is set to `~/.opencontract/system`, `cache` is set to `~/.opencontract/cache`, and all other fields preserve their original values

#### Scenario: Update trust validator roots
- **WHEN** migration rewrites config and `trust.validatorRoots` contains `.opencontract/system`
- **THEN** that entry is updated to `~/.opencontract/system` and other roots remain unchanged

### Requirement: Backup old system tree with timestamp

Migration SHALL rename `.opencontract/system/` to `.opencontract/system.backup-<timestamp>` where `<timestamp>` is ISO 8601 format with colons and dots replaced by dashes (e.g., `2026-08-29T12-34-56-789Z`). The backup SHALL be created after config update succeeds and SHALL preserve the complete system tree for manual verification.

#### Scenario: Backup old system tree
- **WHEN** migration completes config update successfully
- **THEN** `.opencontract/system/` is renamed to `.opencontract/system.backup-<timestamp>` with current timestamp

#### Scenario: Backup preserves complete system content
- **WHEN** migration creates backup
- **THEN** the backup directory contains all Actions, Contracts, and manifest from the original `.opencontract/system/`

### Requirement: Remove legacy single-entry adapter if generated

Migration SHALL check for `.claude/skills/opencontract/SKILL.md`, `.cursor/skills/opencontract/SKILL.md`, and `.codex/skills/opencontract/SKILL.md`. If any file exists and carries the `<!-- opencontract:generated -->` marker, migration SHALL remove its parent directory (`skills/opencontract/`). User-authored files (no marker) SHALL be preserved with a warning that manual removal is needed.

#### Scenario: Remove generated legacy adapter
- **WHEN** migration finds `.claude/skills/opencontract/SKILL.md` with the generated marker
- **THEN** migration removes `.claude/skills/opencontract/` directory recursively

#### Scenario: Preserve user-authored legacy adapter
- **WHEN** migration finds `.cursor/skills/opencontract/SKILL.md` without the generated marker
- **THEN** migration skips removal, preserves the file, and reports that manual cleanup is needed

#### Scenario: Handle missing legacy adapter
- **WHEN** migration checks for legacy adapters and none exist
- **THEN** migration skips legacy adapter removal step and proceeds

### Requirement: Generate new per-Action adapters after migration

Migration SHALL generate project-level per-Action adapters at `.claude/commands/oc/`, `.claude/skills/oc-*/`, etc. for harnesses listed in the project's `harnesses` config field. Adapter generation SHALL follow the same collision detection and all-or-nothing rules as `init` and `update`.

#### Scenario: Generate new adapters for project harnesses
- **WHEN** migration completes and project config specifies `harnesses: ["claude", "cursor"]`
- **THEN** migration generates project-level adapters at `.claude/` and `.cursor/` with per-Action commands and skills

#### Scenario: Adapter collision during migration reports error
- **WHEN** migration attempts to generate adapters and detects collision at `.claude/commands/oc/explore.md`
- **THEN** migration reports collision error, writes zero adapters for that harness-location pair, and exits with code 1

### Requirement: Report migration outcome with backup location

Migration SHALL report success with a summary listing the backup path, config changes, cache merge outcome, legacy adapter removal, and new adapter generation. The message SHALL include guidance for verifying the migration and instructions for removing the backup when verification is complete.

#### Scenario: Report successful migration
- **WHEN** migration completes all steps successfully
- **THEN** the command outputs a summary with backup location `.opencontract/system.backup-<timestamp>`, config updates, cache merge result, and new adapter paths, and suggests running `rm -rf .opencontract/system.backup-*` after verification

#### Scenario: Report partial migration failure
- **WHEN** migration completes config update and backup but adapter generation fails due to collision
- **THEN** the command reports success for completed steps, reports adapter collision error, and exits with code 1
