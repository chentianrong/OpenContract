## Purpose

Provides a global installation model for OpenContract system definitions, eliminating per-project duplication by installing Actions, Contracts, and cache once in `~/.opencontract/` and sharing them across all projects.

## Requirements

### Requirement: Install global system with interactive harness selection

The `opencontract install` command SHALL create `~/.opencontract/system/` with bundled Actions and Contracts, `~/.opencontract/cache/`, and optionally `~/.opencontract/config.yaml` with global defaults. In interactive mode (default), it SHALL prompt the user to select harnesses via a checkbox interface, detect existing harness directories in `~/` and pre-check them, and show installation progress. In non-interactive mode (`--non-interactive`), it SHALL require the `--harness` flag with a comma-separated list and skip all prompts.

#### Scenario: Fresh interactive installation with harness selection
- **WHEN** user runs `opencontract install` and `~/.opencontract/system/` does not exist
- **THEN** the command shows a welcome screen, prompts for harness selection with detected harnesses pre-checked, creates `~/.opencontract/system/` and `~/.opencontract/cache/`, installs system Actions and Contracts, generates user-level adapters for selected harnesses, writes selected harnesses to `~/.opencontract/config.yaml`, and reports installation complete

#### Scenario: Installation already exists without force flag
- **WHEN** user runs `opencontract install` and `~/.opencontract/system/manifest.yaml` already exists without `--force`
- **THEN** the command exits with code 1 and message "Already installed. Use --force to reinstall."

#### Scenario: Force reinstallation overwrites existing system
- **WHEN** user runs `opencontract install --force` and global system exists
- **THEN** the command overwrites `~/.opencontract/system/`, regenerates all user-level adapters for previously selected harnesses, and updates `manifest.yaml` with new version and timestamp

#### Scenario: Non-interactive installation requires harness flag
- **WHEN** user runs `opencontract install --non-interactive` without `--harness`
- **THEN** the command exits with code 2 and error message indicating `--harness` is required

#### Scenario: Non-interactive installation succeeds with explicit harnesses
- **WHEN** user runs `opencontract install --non-interactive --harness claude,cursor`
- **THEN** the command creates global system, generates user-level adapters for Claude and Cursor only, saves selected harnesses to config, and exits with code 0 without showing any prompts

### Requirement: Uninstall global system with optional cache preservation

The `opencontract uninstall` command SHALL remove `~/.opencontract/system/`, `~/.opencontract/config.yaml`, and user-level harness adapters (`~/.claude/commands/oc/`, `~/.claude/skills/oc-*/`, etc.). By default it SHALL also remove `~/.opencontract/cache/`; with `--keep-cache` it SHALL preserve the cache directory. It SHALL NOT remove project-level installations.

#### Scenario: Uninstall removes global system and cache
- **WHEN** user runs `opencontract uninstall` and `~/.opencontract/` exists
- **THEN** the command removes `~/.opencontract/system/`, `~/.opencontract/config.yaml`, `~/.opencontract/cache/`, and user-level harness adapters, and exits with code 0

#### Scenario: Uninstall preserves cache with flag
- **WHEN** user runs `opencontract uninstall --keep-cache`
- **THEN** the command removes `~/.opencontract/system/`, `~/.opencontract/config.yaml`, and user-level adapters, but leaves `~/.opencontract/cache/` intact

#### Scenario: Uninstall with nothing installed
- **WHEN** user runs `opencontract uninstall` and `~/.opencontract/` does not exist
- **THEN** the command exits with code 1 and message "Nothing to uninstall"

### Requirement: Resolve absolute system paths under user home directory

Path resolution SHALL distinguish system paths (`system`, `cache`, `trust.validatorRoots[]`) from workspace paths (`projectActions`, `projectContracts`, `specs`, `artifacts`, `archive`, `registries[]`). System paths MAY be absolute and MUST resolve under the user home directory after expanding `~/`. Workspace paths MUST remain relative to the workspace root and MUST NOT escape it. Absolute system paths outside the user home directory SHALL be rejected with `PATH_OUTSIDE_HOME`.

#### Scenario: Absolute system path under home resolves successfully
- **WHEN** config specifies `system: ~/.opencontract/system`
- **THEN** path validation expands `~/` to user home directory, verifies the expanded path is under user home, and returns the expanded absolute path

#### Scenario: Relative system path resolves relative to workspace
- **WHEN** config specifies `system: .opencontract/system`
- **THEN** path validation resolves it relative to workspace root, verifies it does not escape workspace, and returns the resolved absolute path

#### Scenario: Absolute system path outside home is rejected
- **WHEN** config specifies `system: /etc/opencontract/system`
- **THEN** path validation fails with `PATH_OUTSIDE_HOME` error before reading or writing any content

#### Scenario: Workspace paths remain relative and cannot be absolute
- **WHEN** config specifies `specs: /tmp/specs`
- **THEN** path validation fails with `PATH_NOT_RELATIVE` error

### Requirement: Initialize projects with global system reference

The `opencontract init` command SHALL check if `~/.opencontract/` exists. In interactive mode, if global system is missing, it SHALL prompt "Global system not found. Would you like to install it now? (Y/n)" and run `install` if user confirms, then continue with project initialization. In non-interactive mode (`--non-interactive`), if global system is missing, it SHALL exit with error "Global system not installed. Run 'opencontract install' first." Project initialization SHALL create `.opencontract/config.yaml` with `system: ~/.opencontract/system` and `cache: ~/.opencontract/cache`, create project directories (`.opencontract/actions/`, `.opencontract/contracts/`, `opencontract/specs/`, `opencontract/artifacts/`, `opencontract/artifacts/archive/`), and generate project-level adapters for selected harnesses. It SHALL NOT copy the system tree to `.opencontract/system/`.

#### Scenario: Interactive init prompts to install global system if missing
- **WHEN** user runs `opencontract init` in interactive mode and `~/.opencontract/` does not exist
- **THEN** the command prompts to install global system, runs `install` if user confirms, then proceeds with project initialization

#### Scenario: Non-interactive init fails if global system missing
- **WHEN** user runs `opencontract init --non-interactive` and `~/.opencontract/` does not exist
- **THEN** the command exits with code 2 and error message "Global system not installed. Run 'opencontract install' first."

#### Scenario: Init creates project config referencing global system
- **WHEN** user runs `opencontract init` and `~/.opencontract/` exists
- **THEN** the command creates `.opencontract/config.yaml` with `system: ~/.opencontract/system` and `cache: ~/.opencontract/cache`, and does not create `.opencontract/system/` directory

#### Scenario: Init with existing workspace reports error
- **WHEN** user runs `opencontract init` and `.opencontract/config.yaml` already exists
- **THEN** the command exits with `WORKSPACE_EXISTS` error and recommends using `update`

### Requirement: Update global and project systems independently

The `opencontract update` command SHALL support `--global` and `--project` flags for scoped updates. With `--global` (or when run outside a project), it SHALL stage a new system tree to `~/.opencontract/.staging-<random>/`, validate the staged tree, snapshot the current system to `~/.opencontract/cache/<version>/`, atomically replace `~/.opencontract/system/`, and regenerate user-level harness adapters. With `--project` (or when run inside a project), it SHALL regenerate project-level harness adapters from the current global system and run migration detection. With no flags inside a project, it SHALL update both global and project.

#### Scenario: Global update stages, validates, and replaces system
- **WHEN** user runs `opencontract update --global`
- **THEN** the command stages new system to `.staging-<random>/`, validates bundled Actions and Contracts, snapshots current system to `cache/<version>/`, atomically replaces `~/.opencontract/system/`, regenerates user-level adapters, and reports success

#### Scenario: Project update regenerates project-level adapters
- **WHEN** user runs `opencontract update --project` inside a project
- **THEN** the command regenerates project-level harness adapters from current global system, runs migration detection, and reports success

#### Scenario: Update inside project updates both by default
- **WHEN** user runs `opencontract update` inside a project without flags
- **THEN** the command updates global system and regenerates project-level adapters

#### Scenario: Failed update rolls back and preserves prior system
- **WHEN** staged system validation fails during `opencontract update --global`
- **THEN** the command removes the staging directory, leaves `~/.opencontract/system/` unchanged, and exits with code 2
