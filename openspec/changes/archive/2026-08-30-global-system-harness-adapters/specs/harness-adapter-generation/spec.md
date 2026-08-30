## Purpose

Generates per-Action slash commands and skills for each system Action, replacing the single-entry delegating adapter with independent commands that provide better discoverability and align with ecosystem patterns.

## ADDED Requirements

### Requirement: Generate per-Action slash commands and skills with inlined guidance

Adapter generation SHALL create two files per Action per harness: a slash command at `.claude/commands/oc/<action>.md` and a skill at `.claude/skills/oc-<action>/SKILL.md`. Each generated file SHALL carry the marker `<!-- opencontract:generated -->` in the first line. The adapter content SHALL inline the Action's SKILL.md guidance verbatim, including prose body and declared contracts block, so agents can read the complete Action guidance without additional file hops. Generated adapters SHALL use the `oc:` namespace prefix for all commands and skills.

#### Scenario: Generate adapters for all system Actions
- **WHEN** adapter generation runs for the Claude harness with 13 system Actions
- **THEN** the generator creates 13 slash command files at `.claude/commands/oc/*.md` and 13 skill files at `.claude/skills/oc-*/SKILL.md`, each with `<!-- opencontract:generated -->` marker and inlined Action guidance

#### Scenario: Generated adapter inlines complete Action guidance
- **WHEN** adapter generation processes the `explore` Action
- **THEN** the generated `/oc:explore` command and `oc-explore` skill both contain the Action's prose description, usage guidance, declared contracts block, and available commands section without referencing external files

#### Scenario: Legacy single-entry opencontract Action is skipped
- **WHEN** adapter generation enumerates system Actions
- **THEN** the generator skips any Action named `opencontract` and does not create adapters for it

### Requirement: Install adapters at user-level and project-level with override semantics

Adapter generation SHALL install adapters at user-level (`~/.claude/`, `~/.cursor/`, etc.) and project-level (`<project>/.claude/`, `<project>/.cursor/`, etc.). Project-level adapters SHALL take precedence over user-level adapters when both exist. User-level adapters provide cross-project defaults; project-level adapters allow per-project customization or overrides.

#### Scenario: User-level adapters are shared across projects
- **WHEN** `opencontract install` generates user-level adapters at `~/.claude/commands/oc/`
- **THEN** all projects can invoke `/oc:explore` and other commands without project-level adapters

#### Scenario: Project-level adapters override user-level
- **WHEN** a project has `.claude/commands/oc/explore.md` and `~/.claude/commands/oc/explore.md` both exist
- **THEN** the harness uses the project-level adapter

#### Scenario: Project init generates project-level adapters
- **WHEN** `opencontract init` runs with harness selection
- **THEN** the command generates project-level adapters at `<project>/.claude/commands/oc/` and `<project>/.claude/skills/oc-*/` for selected harnesses

### Requirement: Detect namespace collisions with all-or-nothing generation

Adapter generation SHALL probe every target path before writing. If any target path exists and lacks the `<!-- opencontract:generated -->` marker, the entire (harness, location) pair SHALL be treated as a collision: no files SHALL be written for that pair, and the command SHALL exit with code 1 listing the colliding paths. The user MAY use `--force` to overwrite colliding files or manually remove/rename them. Partial installations (some adapters written, others skipped due to collision) SHALL NOT occur.

#### Scenario: Collision detection aborts entire harness-location generation
- **WHEN** `opencontract install` finds `~/.claude/commands/oc/explore.md` exists without the generated marker
- **THEN** the command writes zero files to `~/.claude/commands/oc/` and `~/.claude/skills/oc-*/`, exits with code 1, and lists the colliding path

#### Scenario: Force flag overwrites colliding files
- **WHEN** `opencontract install --force` encounters collision at `~/.claude/commands/oc/explore.md`
- **THEN** the command overwrites that file and all other target paths, regenerates all adapters, and exits with code 0

#### Scenario: Generated files are safely regenerated
- **WHEN** all target paths either do not exist or carry `<!-- opencontract:generated -->` marker
- **THEN** adapter generation proceeds and overwrites generated files without error

#### Scenario: Project-level collision does not block user-level
- **WHEN** `opencontract init` detects collision at `.claude/commands/oc/build.md` but `~/.claude/commands/oc/` is clean
- **THEN** the command writes zero project-level adapters, exits with code 1, and user-level adapters remain installed

### Requirement: Preserve user-authored adapter files

Generated adapters SHALL only replace files carrying the `<!-- opencontract:generated -->` marker. User-authored files (no marker) SHALL be preserved unless `--force` is specified. When `update` or `init` encounters a user-authored file at a target path, it SHALL skip that file and report the ownership conflict for manual resolution.

#### Scenario: User-authored file is preserved during update
- **WHEN** `opencontract update` finds `.claude/skills/oc-explore/SKILL.md` exists without the generated marker
- **THEN** the command skips that file, reports the ownership conflict, and does not overwrite it

#### Scenario: Generated files are replaced during update
- **WHEN** `opencontract update` finds `.claude/commands/oc/build.md` with the generated marker
- **THEN** the command overwrites that file with the regenerated content

### Requirement: Support multiple harnesses with consistent generation

Adapter generation SHALL support Codex, Claude, and Cursor harnesses. The generation logic SHALL be identical for all harnesses except for output directory naming (`.codex/`, `.claude/`, `.cursor/`). Each harness's adapters SHALL use the same `oc:` namespace, inlining strategy, and frontmatter structure.

#### Scenario: Generate adapters for multiple harnesses
- **WHEN** `opencontract install` runs with `--harness claude,cursor`
- **THEN** the command generates identical adapter structure at `~/.claude/` and `~/.cursor/` with only directory paths differing

#### Scenario: Harness adapter frontmatter is consistent
- **WHEN** adapters are generated for Claude and Cursor harnesses
- **THEN** both use the same frontmatter fields (`name`, `description`, `allowed-tools`, `category`, `tags` for commands; `name`, `description`, `allowed-tools`, `metadata` for skills)
