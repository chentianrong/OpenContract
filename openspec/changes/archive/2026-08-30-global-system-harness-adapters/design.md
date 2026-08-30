## Context

See proposal.md for motivation.

OpenContract v1.0.0 uses project-local `.opencontract/system/` directories containing bundled Actions and Contracts. Path validation in `src/workspace/discovery.ts` currently rejects all absolute paths via `validateRelative()`, which prevents referencing `~/.opencontract/system`. The `initWorkspace()` function in `src/workspace/init.ts` copies the system tree into each project and generates a single delegating adapter per harness at `.claude/skills/opencontract/SKILL.md`. The `update` command in `src/system/update.ts` replaces the project-local system tree.

This design moves to a global `~/.opencontract/` installation shared across projects, generates per-Action adapters with inlined guidance, and auto-migrates v1.0.0 projects on first update.

## Goals / Non-Goals

**Goals:**
- Install system once at `~/.opencontract/`, eliminate per-project duplication
- Generate independent `/oc:explore`, `/oc:build`, etc. commands visible to harness completion
- Support user-level (`~/.claude/`) and project-level (`<project>/.claude/`) adapters with override semantics
- Migrate v1.0.0 projects transparently on `opencontract update` without data loss
- Fail loudly on adapter namespace collisions to prevent partial installations

**Non-Goals:**
- Multi-version global systems (deferred to v1.2.0+; cache already preserves old versions)
- Namespace customization beyond `oc:` prefix (deferred; users can manually edit generated files)
- XDG Base Directory compliance (cross-platform simplicity via `~/.opencontract` preferred)
- Registry-based system distribution (continue bundling in npm package)

## Decisions

### Decision 1: Distinguish system paths from workspace paths in validation

**Choice:** Introduce `validateSystemPath()` alongside existing `validateRelative()`. System paths (`system`, `cache`, `trust.validatorRoots[]`) may be absolute and must resolve under `~/`. Workspace paths (`projectActions`, `specs`, `artifacts`, etc.) remain relative-only.

**Rationale:** Allows `system: ~/.opencontract/system` while preserving existing safety guarantees for user content. Workspace paths escaping the project directory would bypass git tracking and break portability. System paths reference a global installation outside the workspace, so absolute is appropriate.

**Alternatives considered:**
- **Symlink approach:** Projects keep local `.opencontract/system/` as symlink to global. Rejected because symlinks behave inconsistently across platforms (especially Windows) and don't solve the "update each project" problem by default.
- **Allow all absolute paths:** Rejected because workspace paths like `specs: /tmp/specs` would violate git-tracked project boundaries.

### Decision 2: Inline Action guidance verbatim into generated adapters

**Choice:** Generated adapters copy the Action's SKILL.md content (prose + contracts block) verbatim into the adapter file. Agents read complete guidance without additional file hops.

**Rationale:** The design doc's "Open Question #3" proposes starting with references for simpler generation, but the actual `generators.ts` implementation inlines content. Inlining ensures adapters are self-contained: an agent invoking `/oc:explore` sees the complete Action contract without needing to resolve `~/.opencontract/system/actions/explore/SKILL.md`. This matches how harness commands typically work (guidance is inline, not referenced). References would require agents to perform a second read, complicating the interaction model.

**Alternatives considered:**
- **Reference to system Action:** Adapter says "Load guidance from ~/.opencontract/system/actions/explore/SKILL.md". Rejected because it adds a hop and assumes the agent knows how to resolve system paths. Inlining is simpler for agents.

### Decision 3: All-or-nothing adapter generation per (harness, location) pair

**Choice:** Before writing any files for a (harness, location) pair (e.g., Claude user-level), probe all target paths. If any collision exists (file present without `<!-- opencontract:generated -->` marker), write zero files for that pair and exit with error listing collisions. Use `--force` to overwrite.

**Rationale:** Partial installations (6 of 13 commands present) are harder to diagnose than complete success or complete failure. All-or-nothing ensures users never have a half-working adapter set. The design doc's "Adapter Generation Implementation" section originally showed per-file skipping, but the "Risks and Mitigations" section explicitly calls for fail-loud all-or-nothing as the correct behavior.

**Alternatives considered:**
- **Skip conflicting files individually:** Write some adapters, skip others. Rejected because partial state is confusing and users may not notice missing commands.

### Decision 4: Interactive prompts with `@clack/prompts` for harness selection

**Choice:** Add `@clack/prompts` dependency for `install` and `init` interactive modes. Use checkbox for harness selection, confirm for yes/no prompts, spinner for progress. Non-interactive mode requires explicit `--harness` flag.

**Rationale:** Checkbox UI improves UX for multi-select harness choice and aligns with modern CLI patterns (e.g., `create-vite`, `create-next-app`). Non-interactive mode preserves CI/automation workflows without prompts.

**Alternatives considered:**
- **Text-based prompts:** Ask "Which harnesses? (comma-separated)". Rejected because checkbox is more discoverable and less error-prone.
- **No prompts, require flags:** Rejected because interactive UX matters for developer experience.

### Decision 5: Auto-migration on `opencontract update` with timestamped backup

**Choice:** `update` detects `.opencontract/system/manifest.yaml`, migrates automatically, backs up old system to `.opencontract/system.backup-<timestamp>`, and reports outcome. No user confirmation required.

**Rationale:** Migration is safe (backup created before mutation), idempotent (re-running has no effect if already migrated), and transparent (user sees what happened). Requiring confirmation adds friction without adding safety. Timestamped backup allows verification and rollback.

**Alternatives considered:**
- **Prompt before migration:** "Migrate to global system? (Y/n)". Rejected because migration is the intended upgrade path and backup provides safety.
- **Separate `migrate` command:** Rejected because that adds an extra step for users; `update` is the natural place for upgrade logic.

### Decision 6: Project-level adapters override user-level adapters

**Choice:** Generate adapters at `~/.claude/` (user-level) and `<project>/.claude/` (project-level). Harness loads project-level first if present, falls back to user-level. Both are generated with identical content.

**Rationale:** User-level provides cross-project defaults. Project-level allows per-project customization (e.g., a project disables certain Actions or customizes guidance). Override semantics match how harness discovery typically works (local overrides global).

**Alternatives considered:**
- **User-level only:** Rejected because projects can't customize adapters without editing global files (affects all projects).
- **Project-level only:** Rejected because requires re-generating adapters in every project, defeating the purpose of global installation.

## Risks / Trade-offs

### Risk: Global system version conflicts across projects

**Scenario:** User has multiple projects expecting different OpenContract versions. Global system at v1.2.0 breaks a project expecting v1.1.0.

**Mitigation:**
- Document testing recommendation: verify projects after global updates
- Future: allow `system: ~/.opencontract/cache/1.1.0` to pin to cached version (deferred to v1.2.0+)
- Rollback: `~/.opencontract/cache/` preserves old versions; users can manually restore

### Risk: User home directory on network filesystem

**Scenario:** `~/.opencontract/` on NFS or similar has poor performance or consistency issues.

**Mitigation:**
- Fallback: projects can use `system: .opencontract/system` (relative path) to opt out of global model
- Documentation: note performance considerations for network home directories
- Future: `OPENCONTRACT_HOME` environment variable to relocate global root (deferred)

### Risk: Migration data loss

**Scenario:** Migration fails mid-way; user loses system tree or cache.

**Mitigation:**
- Transactional migration: backup before modifying, verify global system exists before deleting local
- Detailed logging: log each migration step for troubleshooting
- Rollback: keep `.opencontract/system.backup-*` until user explicitly deletes

### Trade-off: Adapter duplication between user-level and project-level

Generated adapters are duplicated at `~/.claude/` and `<project>/.claude/`. For 13 Actions × 2 formats × 3 harnesses, this is ~78KB per location. Acceptable because adapters are derived artifacts (regenerated on update) and disk space is cheap. The alternative (project references user-level) breaks project portability and complicates harness lookup.

### Trade-off: Inlining increases adapter file size

Each adapter inlines the full Action SKILL.md content (~1-2KB per adapter). Total size for 13 Actions × 2 formats is ~50KB per harness. Acceptable because it eliminates file hops and simplifies agent interaction. Disk space cost is negligible compared to `node_modules/`.

## Migration Plan

### Phase 1: Path validation and config changes
- Add `validateSystemPath()` to `src/workspace/discovery.ts`
- Update `resolvePaths()` to call `validateSystemPath()` for system paths
- Update `DEFAULT_CONFIG` to keep `.opencontract/system` for backward compatibility
- Test: config with `system: ~/.opencontract/system` loads without error

### Phase 2: Adapter generation
- Create `src/system/generators.ts` with `generateAdapters()` function
- Implement `renderCommand()` and `renderSkill()` with inlining logic
- Reuse the existing `GENERATED_MARKER` constant and `isGenerated()` helper from `src/system/harnesses.ts`; extend that module with per-Action target-path helpers replacing the single-entry `SUPPORTED_HARNESSES` relative paths
- Implement all-or-nothing collision detection
- Test: generate adapters for mock Actions, verify marker and content

### Phase 3: Global install command
- Add `@clack/prompts` dependency
- Create `src/cli/commands/install.ts` with interactive and non-interactive modes
- Create `src/cli/prompts.ts` with shared prompt utilities
- Create `src/system/install.ts` with installation logic
- Test: mock prompts, verify `~/.opencontract/` creation and adapter generation

### Phase 4: Update init command
- Modify `src/workspace/init.ts` to check for global system
- Add interactive prompt to run `install` if missing
- Update directory creation to skip `.opencontract/system/`
- Update config generation to use `~/.opencontract/system`
- Integrate adapter generation for project-level
- Test: mock prompts, verify no local system copy

### Phase 5: Migration logic
- Create `src/system/migration.ts` with `migrateToGlobalSystem()`
- Implement cache merge without overwriting
- Implement config rewrite
- Implement backup with timestamp
- Implement legacy adapter removal
- Integrate into `src/system/update.ts`
- Test: mock v1.0.0 project, verify migration steps and backup

### Phase 6: Update command changes
- Modify `src/system/update.ts` to support `--global`/`--project` flags
- Add staging and atomic replacement for global updates
- Integrate migration detection for project updates
- Test: verify global update atomicity and project adapter regeneration

### Phase 7: Uninstall command
- Create `src/cli/commands/uninstall.ts`
- Implement removal of global system, config, cache (optional), and user-level adapters
- Test: verify clean removal and `--keep-cache` behavior

### Rollout
- **v1.1.0-alpha.1:** Phases 1-2 (path validation, generators)
- **v1.1.0-beta.1:** Phases 3-5 (install, init, migration)
- **v1.1.0-rc.1:** Phases 6-7 (update, uninstall)
- **v1.1.0:** Stable release

### Deprecation timeline
- **v1.1.0:** Auto-migration on `update`, no breaking changes
- **v1.2.0:** Remove auto-migration code (old backups remain on disk)
- **v2.0.0:** Remove support for local system paths in config

## Open Questions

None. The design is ready for implementation.
