## 1. Path Validation and Config Changes

- [x] 1.1 Add `validateSystemPath()` function to `src/workspace/discovery.ts` that expands `~/`, validates absolute paths are under user home, and validates relative paths against workspace root; verify test coverage for `~/.opencontract/system`, relative `.opencontract/system`, `/etc/opencontract` rejection, and workspace paths remaining relative-only
- [x] 1.2 Update `resolvePaths()` in `src/workspace/discovery.ts` to call `validateSystemPath()` for `system`, `cache`, and `trust.validatorRoots[]` fields instead of `validateRelative()`; verify existing tests still pass and new test with `system: ~/.opencontract/system` loads without error
- [x] 1.3 Add test cases in `test/workspace-discovery.test.ts` covering absolute system paths under home, relative system paths, rejection of paths outside home, and workspace paths rejecting absolute values; verify all tests pass

## 2. Adapter Generation Module

- [x] 2.1 Create `src/system/generators.ts` with `generateAdapters()` function, `AdapterGenerateOptions` interface, and `GenerateResult` interface; verify module exports expected types
- [x] 2.2 Implement `actionBody()` helper that parses Action SKILL.md, extracts prose and contracts block, and drops the leading heading; verify it correctly splits content for a sample Action fixture
- [x] 2.3 Implement `renderCommand()` that generates slash command frontmatter and inlines Action guidance with `oc:` namespace; verify generated output includes `<!-- opencontract:generated -->` marker, correct frontmatter, and inlined prose
- [x] 2.4 Implement `renderSkill()` that generates skill frontmatter and inlines Action guidance with `oc-<action>` naming; verify generated output matches expected format with marker and inlined content
- [x] 2.5 Implement all-or-nothing collision detection in `generateAdapters()`: probe all target paths before writing, fail with code 1 and list collisions if any non-generated file exists, respect `--force` flag to overwrite; verify test that creates user file without marker causes generation to fail with zero files written
- [x] 2.6 Implement adapter file generation loop in `generateAdapters()` that skips legacy `opencontract` Action, creates per-Action commands at `.claude/commands/oc/<action>.md` and skills at `.claude/skills/oc-<action>/SKILL.md`, returns paths of generated and skipped files; verify generating for 3 mock Actions creates 6 files (3 commands + 3 skills)
- [x] 2.7 Create `test/system/generators.test.ts` with tests for collision detection, force overwrite, generated marker presence, content inlining, and multi-harness generation; verify all generator tests pass

## 3. Global Install Command

- [x] 3.1 Add `@clack/prompts` to `package.json` dependencies and run `pnpm install`; verify package installs successfully
- [x] 3.2 Create `src/cli/prompts.ts` with harness checkbox prompt helper, home directory harness detection, and shared prompt utilities; verify prompts module exports expected functions
- [x] 3.3 Create `src/system/install.ts` with `installGlobalSystem()` function that creates `~/.opencontract/system/`, copies bundled Actions and Contracts, writes manifest, creates cache directory, and saves global config; verify test with temp directory creates expected structure
- [x] 3.4 Create `src/cli/commands/install.ts` with `install` command supporting `--force`, `--non-interactive`, and `--harness` flags; implement interactive mode with welcome screen and harness checkbox; verify non-interactive mode requires `--harness` flag or exits with code 2
- [x] 3.5 Integrate adapter generation into install command: call `generateAdapters()` for selected harnesses at user-level `~/.claude/`, handle collision errors, report installation progress; verify installation generates correct number of user-level adapters
- [x] 3.6 Add exit code handling: code 0 for success, code 1 for already installed without `--force`, code 2 for validation/permission errors; verify command exits with correct codes in test scenarios
- [x] 3.7 Create `test/cli/commands/install.test.ts` with mocked prompts covering fresh install, already-exists rejection, force reinstall, non-interactive mode, and harness selection; verify all install command tests pass
- [x] 3.8 Create `test/integration/global-install.test.ts` with end-to-end test that runs `opencontract install`, verifies `~/.opencontract/system/` structure, checks user-level adapters exist, and validates manifest content; verify integration test passes

## 4. Update Init Command

- [x] 4.1 Update `initWorkspace()` in `src/workspace/init.ts` to check for global system existence via `~/.opencontract/system/manifest.yaml`; verify function detects missing global system
- [x] 4.2 Add interactive prompt in init command: if global system missing, ask "Global system not found. Would you like to install it now? (Y/n)" and run `installGlobalSystem()` if confirmed; verify mocked test calls install when user confirms
- [x] 4.3 Add non-interactive mode check: if `--non-interactive` and global system missing, exit with code 2 and error "Global system not installed. Run 'opencontract install' first."; verify test with missing global system fails correctly
- [x] 4.4 Update directory creation in `initWorkspace()` to skip `.opencontract/system/` and `.opencontract/cache/` directories; verify init creates project directories but not local system tree
- [x] 4.5 Update `generateDefaultConfig()` in init to write `system: ~/.opencontract/system` and `cache: ~/.opencontract/cache` instead of relative paths, and update `trust.validatorRoots` to reference global system; verify generated config contains global paths
- [x] 4.6 Integrate project-level adapter generation into init: call `generateAdapters()` for selected harnesses at project-level `.claude/`, handle collisions, report generation progress; verify init creates project-level adapters
- [x] 4.7 Add harness selection prompt in interactive init: show checkbox with harnesses from global config pre-selected, allow user to override for project-specific selection; verify test with mocked prompts respects user selection
- [x] 4.8 Update `test/workspace-init.test.ts` with new behavior: no local system copy, global path references in config, project-level adapter generation; verify all init tests pass with updated expectations
- [x] 4.9 Create integration test in `test/integration/global-install.test.ts` that runs install then init, verifies project config references global system, checks project-level adapters exist, and validates no local system tree created; verify integration test passes

## 5. Migration Logic

- [x] 5.1 Create `src/system/migration.ts` with `migrateToGlobalSystem()` function and `MigrationResult` interface; verify module exports expected types
- [x] 5.2 Implement v1.0.0 detection logic: check for `.opencontract/system/manifest.yaml` in project, return `{ needed: false }` if not present; verify detection correctly identifies v1.0.0 vs v1.1.0 projects
- [x] 5.3 Implement global system installation check: if `~/.opencontract/system/manifest.yaml` missing, call `installGlobalSystem()`; verify migration installs global system when needed
- [x] 5.4 Implement cache migration: copy `.opencontract/cache/*` to `~/.opencontract/cache/` without overwriting existing versions, create cache directory if missing; verify cache merge skips existing versions and preserves both local and global content
- [x] 5.5 Implement config rewrite: update `system`, `cache`, and `trust.validatorRoots[]` to reference global paths, preserve all other fields unchanged; verify rewritten config contains global paths and retains original harnesses/validator settings
- [x] 5.6 Implement system backup: rename `.opencontract/system/` to `.opencontract/system.backup-<timestamp>` with ISO 8601 format and colons/dots replaced by dashes; verify backup directory contains original system content
- [x] 5.7 Implement legacy adapter removal: check for `.claude/skills/opencontract/SKILL.md`, `.cursor/skills/opencontract/SKILL.md`, `.codex/skills/opencontract/SKILL.md`, remove parent directory if marker present, warn if user-authored; verify removal only deletes generated adapters
- [x] 5.8 Integrate project-level adapter generation into migration: call `generateAdapters()` for harnesses from config, handle collisions as errors; verify migration generates new per-Action adapters
- [x] 5.9 Implement migration reporting: return backup path, list completed steps, suggest verification command and backup removal; verify migration result includes all expected fields
- [x] 5.10 Create `test/system/migration.test.ts` with tests for v1.0.0 detection, cache merge without overwrite, config rewrite, backup creation, legacy adapter removal, and generated adapter creation; verify all migration tests pass
- [x] 5.11 Create `test/integration/migration.test.ts` with end-to-end test that creates mock v1.0.0 project, runs migration, verifies backup exists, checks config updated, validates new adapters generated, and confirms validation works post-migration; verify integration test passes

## 6. Update Command Changes

- [x] 6.1 Add `--global` and `--project` flags to update command in `src/cli/index.ts`; verify command accepts both flags
- [x] 6.2 Implement scope detection in `src/system/update.ts`: determine if running inside project via workspace discovery, default to `--global` outside project, default to both inside project without flags; verify scope selection logic works correctly
- [x] 6.3 Implement global update with staging: create `.staging-<random>/` directory in `~/.opencontract/`, copy new system tree, validate Actions/Contracts/manifest; verify staging validation runs before replacement
- [x] 6.4 Implement snapshot to cache: copy current `~/.opencontract/system/` to `~/.opencontract/cache/<version>/` before replacement; verify snapshot preserves old system version
- [x] 6.5 Implement atomic system replacement: rename staging directory to replace `system/` atomically; verify replacement succeeds and old system is gone
- [x] 6.6 Implement user-level adapter regeneration for global update: call `generateAdapters()` with `--force` for harnesses in global config, update `~/.claude/` adapters; verify global update regenerates user-level adapters
- [x] 6.7 Implement project update logic: regenerate project-level adapters from current global system, call migration detection and run `migrateToGlobalSystem()` if needed; verify project update triggers migration for v1.0.0 projects
- [x] 6.8 Implement rollback on failure: if staging validation fails, remove staging directory and exit with code 2 without touching live system; verify failed update leaves system unchanged
- [x] 6.9 Update `test/system-management.test.ts` with tests for `--global`/`--project` flag handling, staging validation, atomic replacement, rollback on failure, and migration integration; verify all update tests pass
- [x] 6.10 Create integration test in `test/integration/migration.test.ts` that initializes v1.0.0 project, runs `opencontract update`, verifies auto-migration occurred, checks backup exists, and validates project still works; verify integration test passes

## 7. Uninstall Command

- [x] 7.1 Create `src/cli/commands/uninstall.ts` with `uninstall` command supporting `--keep-cache` flag; verify command is registered
- [x] 7.2 Implement global system removal: delete `~/.opencontract/system/` directory recursively if exists; verify removal succeeds when system exists
- [x] 7.3 Implement global config removal: delete `~/.opencontract/config.yaml` if exists; verify config removed
- [x] 7.4 Implement cache removal: delete `~/.opencontract/cache/` directory unless `--keep-cache` flag present; verify cache removal respects flag
- [x] 7.5 Implement user-level adapter removal: delete `~/.claude/commands/oc/`, `~/.claude/skills/oc-*/`, and equivalents for other harnesses; verify all user-level adapters removed
- [x] 7.6 Add exit code handling: code 0 for success, code 1 for nothing to uninstall, code 2 for partial removal failure; verify command exits with correct codes
- [x] 7.7 Create `test/cli/commands/uninstall.test.ts` with tests for successful uninstall, cache preservation with flag, nothing-to-uninstall case, and exit codes; verify all uninstall tests pass
- [x] 7.8 Create integration test that runs install, then uninstall, verifies `~/.opencontract/` removed except cache when `--keep-cache` used, and confirms user-level adapters gone; verify integration test passes

## 8. Documentation and Polish

- [x] 8.1 Update `README.md` with new installation section showing `opencontract install` before project init, document user-level vs project-level adapters, and update directory structure diagram to show global model; verify documentation accurately reflects new workflow
- [x] 8.2 Create `docs/migration-v1.1.md` with v1.0 → v1.1 upgrade guide covering auto-migration behavior, backup location, verification steps, and rollback procedure; verify migration guide is complete
- [x] 8.3 Update `opencontract install --help`, `opencontract init --help`, `opencontract update --help`, and `opencontract uninstall --help` text to document new flags and interactive/non-interactive modes; verify help text is accurate
- [x] 8.4 Add inline command guidance in generated adapters: update `renderCommand()` and `renderSkill()` to include "Available commands" section with `opencontract action list`, `opencontract validate`, etc.; verify generated adapters have command reference section
- [x] 8.5 Run full test suite (`pnpm test:run`) and verify all tests pass including new unit and integration tests

## 9. End-to-End Verification

- [x] 9.1 Manual test: run `opencontract install` in interactive mode, verify harness checkbox appears, select Claude and Cursor, verify `~/.opencontract/system/` created with 13 Actions, `~/.claude/` and `~/.cursor/` adapters generated, and installation reports success
- [x] 9.2 Manual test: in new temp directory, run `opencontract init`, verify prompt offers to install global system if missing, confirm installation, complete project init, verify project config references global system and project-level adapters exist
- [x] 9.3 Manual test: create mock v1.0.0 project with local `.opencontract/system/`, run `opencontract update`, verify auto-migration message appears, check backup created at `.opencontract/system.backup-<timestamp>`, verify config updated to global paths, validate new adapters generated
- [x] 9.4 Manual test: in Claude Code or compatible harness, type `/oc:` and verify command completion shows `/oc:explore`, `/oc:build`, etc., invoke `/oc:explore` and verify complete Action guidance appears inline without additional file reads
- [x] 9.5 Manual test: run `opencontract validate` on sample artifact after migration, verify validation succeeds and finds Contracts in global system; run `opencontract doctor` and verify workspace health check passes
- [x] 9.6 Manual test: run `opencontract uninstall`, verify removal confirmation, check `~/.opencontract/` removed, verify user-level adapters gone from `~/.claude/`, confirm project-level adapters remain in projects
- [x] 9.7 Manual test: run `opencontract uninstall --keep-cache`, verify `~/.opencontract/cache/` preserved while system and config removed
