## Why

OpenContract v1.0.0 duplicates ~100KB+ of system definitions across every initialized project, requires running `opencontract update` in each project directory individually, and uses a single `/opencontract` entry point that hides the Action inventory from command completion. This creates project bloat, update friction, and poor discoverability. Moving to a global installation model with per-Action commands aligns with ecosystem patterns (like openspec's `/opsx:propose`, `/opsx:apply`) and eliminates redundancy.

## What Changes

- Install system Actions, Contracts, and cache once in `~/.opencontract/` shared across all projects
- Generate independent slash commands (`/oc:explore`, `/oc:build`, etc.) and skills (`oc-explore`, `oc-build`, etc.) for each Action in the `oc:` namespace
- Install adapters at both user-level (`~/.claude/`) and project-level (`<project>/.claude/`), with project-level taking precedence
- Modify path resolution to allow absolute system paths (e.g., `system: ~/.opencontract/system`) while keeping workspace paths relative
- Add `opencontract install` command with interactive harness selection and non-interactive mode for CI/automation
- Add `opencontract uninstall` command to remove global installation
- Modify `opencontract init` to prompt for global install if missing, generate project-level adapters, and skip copying system tree locally
- Modify `opencontract update` with `--global`/`--project` flags for scoped updates
- Auto-migrate v1.0.0 projects on first `update`: move cache to global, rewrite config, backup old system tree, remove legacy single-entry adapter
- Implement all-or-nothing adapter generation per (harness, location) pair with fail-loud collision detection
- Inline Action SKILL.md content verbatim into generated adapters so agents see guidance without additional hops

## Capabilities

### New Capabilities

- `global-system-installation`: Install, update, and uninstall system definitions at `~/.opencontract/`, manage global config defaults, validate absolute system paths under user home directory, and provide interactive/non-interactive installation modes
- `harness-adapter-generation`: Generate per-Action slash commands (`.claude/commands/oc/*.md`) and skills (`.claude/skills/oc-*/SKILL.md`) with inlined guidance, install at user-level and project-level with override semantics, detect namespace collisions with all-or-nothing generation per harness-location pair, and respect generated markers for safe regeneration
- `global-system-migration`: Detect v1.0.0 local system trees, migrate cache to global directory without overwriting existing versions, rewrite project config to reference `~/.opencontract/system`, backup old system tree with timestamp, and remove legacy single-entry adapters

### Modified Capabilities

None. This extends the v1.0.0 workspace and harness adapter model without changing existing contract validation, action-run contracts, or artifact lifecycle requirements.

## Impact

- Adds new CLI commands: `opencontract install`, `opencontract uninstall`
- Modifies CLI commands: `opencontract init` (adds prompts, skips local system copy), `opencontract update` (adds `--global`/`--project` flags, runs migration)
- Adds global directory: `~/.opencontract/` with `system/`, `cache/`, and optional `config.yaml`
- Changes default path resolution in `src/workspace/discovery.ts` to distinguish system paths (can be absolute under `~/`) from workspace paths (must be relative)
- Adds modules: `src/system/generators.ts` (adapter generation), `src/system/migration.ts` (v1.0 to v1.1 migration), `src/cli/commands/install.ts`, `src/cli/commands/uninstall.ts`, `src/cli/prompts.ts` (interactive prompts)
- Adds dependency: `@clack/prompts` for interactive CLI (checkbox, confirm, spinner)
- Modifies generated adapter format: from single `.claude/skills/opencontract/SKILL.md` to 13 commands + 13 skills per harness per location with `<!-- opencontract:generated -->` marker
- Affects existing v1.0.0 projects: auto-migrated on next `opencontract update`, old system backed up to `.opencontract/system.backup-<timestamp>`
- Deprecation timeline: v1.2.0 removes auto-migration code, v2.0.0 removes support for local system paths in config
