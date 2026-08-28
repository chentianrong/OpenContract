## Context

This is a greenfield TypeScript CLI: the repository currently contains the v1 design brief, README, and OpenSpec planning configuration but no runtime package or implementation. The proposal and capability specs define the externally visible contract; this document chooses the internal boundaries needed to implement it without introducing a scheduler, database, or service.

The implementation must run on Node.js 22+ as an ESM package, work on Linux/macOS/Windows, preserve user-owned files, and support exact-versioned system definitions plus project extensions. Validation must be deterministic enough for both terminal users and downstream agents, while custom Python validators are explicitly trusted code rather than a security sandbox.

## Goals / Non-Goals

**Goals:**

- Provide a small, testable core that models workspace paths, definitions, Markdown Artifacts, Contracts, Actions, and ValidationResults as typed data.
- Keep filesystem state as the source of truth and make every mutating system operation recoverable.
- Make CLI commands thin adapters over reusable services so future editor integrations can reuse the same domain APIs and presentation model.
- Make exact-version resolution, validation phases, trust decisions, and exit codes stable and observable.
- Ship the complete v1.0.0 system catalog, generated harness entry Skills, fixtures, and cross-platform tests.

**Non-Goals:**

- Do not implement Action execution, workflow scheduling, `next` selection, a central state machine, a database, or a background service.
- Do not implement remote registries, non-Python validator runtimes, automatic Artifact migration, a security sandbox, telemetry, or additional Harness adapters.
- Do not make the CLI create or rewrite user Artifacts as part of validation; repair remains an agent responsibility.
- Do not add business-domain Contracts beyond the fourteen v1.0.0 catalog entries.

## Decisions

### 1. Use a layered, library-first TypeScript architecture

Organize source into the following dependency direction:

```text
cli → presentation → application services
                         ├── workspace
                         ├── definitions
                         ├── markdown
                         ├── validation
                         │    └── validators
                         ├── actions
                         ├── system
                         └── harnesses
```

`src/cli/` owns Commander command wiring and process exit handling. Application services return typed results and never write terminal strings. `src/presentation/` renders those results as human text or the versioned JSON protocol. Lower layers receive an injected filesystem/process abstraction where side effects are required, allowing unit tests to use in-memory or temporary fixtures.

This is preferred over putting all logic in command handlers because the same validation and resolution behavior must be reusable by `doctor`, `contract test`, future integrations, and tests. It also prevents presentation wording from becoming an implicit API.

### 2. Treat the filesystem as the authoritative state model

The workspace service resolves the nearest `.opencontract/config.yaml`, normalizes all configured paths against the workspace root, and exposes typed roots for system, cache, project extensions, specs, artifacts, and registries. It rejects paths that escape the root after realpath/symlink checks. No central status file is introduced: task state is reconstructed from goals, conversation context, files, managed Artifact metadata, ActionRun directories, and decisions.

The system-owned tree is kept separate from project-owned extensions and user content:

```text
.opencontract/
  config.yaml
  system/{manifest.yaml,actions,contracts}
  cache/
  actions/
  contracts/
.codex/skills/opencontract/SKILL.md
.claude/skills/opencontract/SKILL.md
.cursor/skills/opencontract/SKILL.md
opencontract/specs/
opencontract/artifacts/archive/
```

The path model is centralized so validation, update, archive reference repair, and doctor cannot implement subtly different safety checks.

### 3. Represent definitions as immutable exact-version packages

Actions are parsed from standard `SKILL.md` files. Contracts are parsed from a package containing authoritative `contract.md`, a default `template.md`, optional template variants, an optional validator declaration, and fixtures. A definition record includes name, exact version, source (`project`, `system`, `cache`, or `registry`), absolute package path, and parsed metadata.

Resolution follows one service and one algorithm for all callers:

1. Parse a requested exact `vMAJOR.MINOR.PATCH`; reject `latest`, ranges, or malformed versions.
2. Search project and current system definitions by name/version.
3. If more than one exact match exists, require an explicit `overrides.actions` or `overrides.contracts` selection and otherwise return a source-conflict error.
4. For an unqualified “current” selection, the simultaneous presence of project and system definitions is also ambiguous unless overridden.
5. If current sources miss, consult exact cached versions, then configured local registries.
6. Cache registry packages before returning them and mark their validators untrusted.

Published package directories are content-addressed by their exact version in practice (the manifest records the version); services never mutate a released definition in place. This makes historical validation reproducible and keeps lookup policy out of individual commands.

### 4. Implement validation as an explicit phase pipeline

The validation service runs a fixed sequence and records each phase independently:

```text
parse → artifact_core → contract_structure → semantic_validator → references → action_contract
```

`action_contract` is only present for ActionRun targets. Each phase consumes typed parse results and appends normalized errors/warnings; a failed prerequisite marks later phases `skipped` rather than inventing secondary failures. Error objects always carry a stable code, phase, path, message, and optional line/column and repair hint.

Markdown parsing is split from rule evaluation: YAML/frontmatter parsing yields metadata and body offsets, unified/remark yields a heading/content AST, and AJV evaluates the Contract’s Draft 2020-12 frontmatter schema. A small rule engine evaluates heading names, levels, order, occurrence bounds, and minimum content. Contract-specific uniqueness, cross-Artifact consistency, and domain rules remain in the semantic validator layer.

The same service handles a single file, a directory summary, and recursive input traversal. Directory results contain an aggregate plus independent per-file results, preserving machine-readable detail without requiring a persistent report file.

### 5. Bound custom validators with a narrow subprocess protocol

The validator runner accepts only a validator entrypoint under a configured trusted root. It spawns Python with an argument-free entrypoint, writes one JSON request to stdin (protocol/version, absolute artifact and contract paths, workspace root, and task root), and reads stdout under a byte cap. Stderr is captured for diagnostics and never parsed as protocol. A timeout, missing runtime, non-zero exit, malformed JSON, stdout contamination, or oversized output maps to a deterministic process/protocol error and terminates the child.

This is deliberately a trust gate and protocol boundary, not a sandbox. The config makes that explicit; tests verify that untrusted registry validators are skipped and that trusted code is still understood to have the current user's permissions.

### 6. Parse Action contracts independently from execution

The Action service validates Skill frontmatter and the `yaml opencontract` block, exposing declared Artifact inputs/outputs, requiredness, and minimum counts. The ActionRun validator treats only Markdown files directly under the timestamped ActionRun directory as managed outputs, rejects ordinary frontmatter-free Markdown mixed into that directory, checks uniform `action`/`action_version`, validates each output through the Artifact service, merges direct inputs, and then evaluates the Action contract.

The system catalog is shipped as package resources and installed into `.opencontract/system/` by `init/update`. The `opencontract` entry Skill only discovers and delegates to these definitions; it is not a second copy of them. The CLI intentionally has no execution or archive command, leaving Action choice, branching, repetition, and human interaction to the agent layer.

### 7. Make system updates transactional at the directory boundary

`update` writes a staging tree in a sibling temporary directory, validates the complete manifest, every Action/Contract, fixtures, and adapter templates, and runs the same health checks used by `doctor`. Before replacement it snapshots the current system tree and generated adapter files in a temporary rollback location. A rename-based swap replaces `.opencontract/system/` atomically; marked adapter files are then refreshed. Any error restores the snapshot and removes staging/rollback debris. Project extensions, configuration, Specs, Artifacts, and cache history are never part of the replacement set.

The update service emits a typed operation result so the CLI can distinguish package/configuration failures (exit 2) from unexpected filesystem failures (exit 3), and so integration tests can assert rollback rather than relying on log text.

### 8. Generate adapters with ownership markers

Harness adapter templates are package resources with a stable generated marker and a small delegation body. Installation writes only supported locations and records which files are OpenContract-owned. On update, only marked files are replaced; unmarked conflicts are preserved and surfaced by `doctor`. Adapter generation is isolated behind a Harness interface so unsupported harnesses can be added later without changing system management or Action definitions.

### 9. Keep SDD and archive behavior in contracts and agent Actions

The CLI ships `specification`, `design`, `decision`, and report Contract packages, but does not implement an archive command. Their schemas encode delta/canonical modes, normative requirement/scenario structure, pending/decided authorization, and archive evidence fields. Agent Actions use ordinary relative Markdown `inputs` to connect task Artifacts to canonical Specs.

When an agent performs archive work, it must use a filesystem/reference-repair service shared with validation: compute affected inputs and Markdown links, rewrite them after the move, recursively validate canonical Specs, and only then move the task directory under `opencontract/artifacts/archive/`. Conflict or unsafe-repair outcomes remain agent-level decisions and do not become hidden CLI state.

### 10. Test the protocol at three layers

- Unit tests cover path safety, frontmatter/AST parsing, JSON Schema and heading rules, exact SemVer resolution, source conflicts/overrides, validator process outcomes, reference cycles, ValidationResult mapping, and exit codes.
- Contract tests iterate every bundled Contract's `fixtures/valid` and `fixtures/invalid`, assert expected error codes, and verify templates contain the shared metadata plus required sections. `skills-ref validate` runs for every bundled Skill.
- Integration tests exercise fresh and existing `init`, successful and failing `update` rollback, `doctor`, file/directory/recursive/ActionRun validation, archive reference repair, adapter generation, JSON/human output, and all validator trust/protocol failure modes on Linux, macOS, and Windows under Node 22 and current LTS.

Vitest owns the test runner. Temporary directories and injected process/filesystem adapters keep tests deterministic; subprocess and path tests use platform-aware assertions rather than hard-coded POSIX separators.

## Risks / Trade-offs

- [Risk] Python availability and platform process semantics vary. → Mitigation: detect the runtime before execution, enforce time/output bounds, normalize failures into protocol errors, and cover all supported CI platforms.
- [Risk] A trusted validator has the invoking user's system permissions. → Mitigation: require explicit trusted roots, make registry validators untrusted by default, document the non-sandbox boundary, and test only protocol/isolation guarantees.
- [Risk] Relative inputs become invalid when task directories move during archive. → Mitigation: centralize path/link discovery and repair, run recursive validation after rewriting, and leave the task in place when repair is uncertain.
- [Risk] Project and system extensions can silently diverge. → Mitigation: exact-version resolution, source-conflict errors, explicit override configuration, immutable manifests, and `doctor` diagnostics.
- [Risk] Large directory or recursive validations can consume excessive time or memory. → Mitigation: stream directory enumeration where practical, cap validator output, track visited realpaths, and preserve phase-level failures instead of expanding unboundedly.
- [Risk] Generated harness files may collide with user customizations. → Mitigation: generated ownership markers, replace-only-marked policy, conflict diagnostics, and integration fixtures for pre-existing files.
- [Risk] A broad MVP catalog increases fixture and maintenance cost. → Mitigation: package each Contract/Action independently, require fixture/conformance tests in CI, and keep all versions exact and immutable.

## Migration Plan

This repository has no existing runtime or `.opencontract` workspaces, so v1.0.0 is an additive introduction. Implementation will scaffold the npm package and bundled resources, then `init` can be run in a user project to create the new system and user roots. Existing README and unrelated project files remain untouched.

For users upgrading a v1 system, `update` is the only supported migration path: it stages and validates the new package, caches the prior exact system versions, swaps the system tree atomically, refreshes marked adapters, and runs `doctor`. A failed update automatically restores the prior tree. No command rewrites existing user Specs or Artifacts; future schema migrations remain outside this MVP.
