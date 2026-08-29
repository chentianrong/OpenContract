# Global System and Per-Action Harness Adapters Design

**Date:** 2026-08-29  
**Status:** Draft

## Overview

This design moves OpenContract's system definitions (Actions and Contracts) and cache from project-local `.opencontract/system` to a global user directory `~/.opencontract/`, and restructures harness adapters from a single entry-point delegation model to per-Action slash commands and skills.

## Motivation

### Current Architecture Problems

1. **Project bloat** — Every initialized project carries a full copy of 13 Actions and 14 Contracts in `.opencontract/system/`, duplicating ~100KB+ across all projects
2. **Update friction** — System updates require running `opencontract update` in every project directory
3. **Single entry point limits discoverability** — Users invoke `/opencontract` then must read documentation to know which Action to use; harness command completion doesn't surface the Action inventory
4. **Inconsistent with ecosystem patterns** — Tools like openspec use per-workflow commands (`/opsx:propose`, `/opsx:apply`) which provide better command completion and clarity

### Goals

1. **Global system installation** — Install Actions, Contracts, and cache once in `~/.opencontract/`, shared across all projects
2. **Per-Action commands** — Generate `/oc:explore`, `/oc:build`, etc. as independent slash commands with `oc:` namespace
3. **Dual adapter format** — Provide both slash commands (`.claude/commands/oc/*.md`) and skills (`.claude/skills/oc-*/SKILL.md`) for harness compatibility
4. **Layered installation** — Install adapters at both user-level (`~/.claude/`) and project-level (`<project>/.claude/`), with project-level taking precedence
5. **Smooth migration** — Automatically migrate existing projects from local system trees to the global model

## Design

### Directory Structure

#### Before (v1.0.0)

```
project/
├── .opencontract/
│   ├── config.yaml
│   ├── system/              # ❌ Duplicated per project
│   │   ├── manifest.yaml
│   │   ├── actions/         # 13 Actions
│   │   └── contracts/       # 14 Contracts
│   ├── cache/               # ❌ Duplicated per project
│   ├── actions/             # Project custom Actions
│   └── contracts/           # Project custom Contracts
├── opencontract/
│   ├── specs/
│   └── artifacts/
└── .claude/
    └── skills/
        └── opencontract/    # ❌ Single entry point
            └── SKILL.md
```

#### After (v1.1.0)

```
~/.opencontract/             # ✅ Global installation
├── system/
│   ├── manifest.yaml
│   ├── actions/             # 13 Actions (shared)
│   └── contracts/           # 14 Contracts (shared)
├── cache/                   # Version snapshots
└── config.yaml              # Global defaults (optional)

~/.claude/                   # ✅ User-level adapters (fallback)
├── commands/oc/             # 13 slash commands
│   ├── explore.md
│   ├── build.md
│   ├── plan.md
│   ├── execute.md
│   └── ...
└── skills/                  # 13 skills (harness compat)
    ├── oc-explore/SKILL.md
    ├── oc-build/SKILL.md
    └── ...

project/
├── .opencontract/
│   ├── config.yaml          # ✅ Points to ~/.opencontract/system
│   ├── actions/             # Project custom Actions
│   └── contracts/           # Project custom Contracts
├── opencontract/
│   ├── specs/
│   └── artifacts/
└── .claude/                 # ✅ Project-level adapters (override)
    ├── commands/oc/
    │   └── explore.md       # Can override user-level
    └── skills/
        └── oc-explore/SKILL.md
```

### Configuration Changes

#### Project `.opencontract/config.yaml`

```yaml
# System location - points to global installation
system: ~/.opencontract/system

# Cache location - shared or local
cache: ~/.opencontract/cache

# Project extensions (unchanged)
projectActions: .opencontract/actions
projectContracts: .opencontract/contracts

# Project artifacts (unchanged)
specs: opencontract/specs
artifacts: opencontract/artifacts
archive: opencontract/artifacts/archive

# Trust configuration - now supports absolute paths
trust:
  validatorRoots:
    - ~/.opencontract/system

# Validator config (unchanged)
validator:
  pythonExecutable: python3
  timeoutMs: 30000
  maxOutputBytes: 1048576

# Harness selection (unchanged)
harnesses: ["claude"]
```

#### Global `~/.opencontract/config.yaml` (new, optional)

```yaml
# Global defaults - projects can override

validator:
  pythonExecutable: python3
  timeoutMs: 30000
  maxOutputBytes: 1048576

# Default harnesses for new projects
harnesses: ["claude", "cursor", "codex"]
```

### Harness Adapter Generation

Each Action generates **two files per harness per location**:

1. **Slash command**: `.claude/commands/oc/<action>.md`
2. **Skill**: `.claude/skills/oc-<action>/SKILL.md`

Installed at:
- **User-level**: `~/.claude/` (fallback, cross-project)
- **Project-level**: `<project>/.claude/` (overrides user-level)

#### Slash Command Template

**File**: `.claude/commands/oc/explore.md`

```markdown
<!-- opencontract:generated -->
---
name: "OC: Explore"
description: "Investigate and capture findings about unfamiliar areas"
allowed-tools: Bash(opencontract:*)
category: "OpenContract"
tags: ["opencontract", "exploration"]
---

# Explore

Investigate an open question or unfamiliar area and capture what was learned.

## When to use

Use this Action when:
- The goal is still vague
- The problem space is unfamiliar
- A decision needs evidence before it can be framed

Exploration is deliberately unstructured: read code, run experiments, follow leads.

## Workflow

1. Investigate the question or area
2. Capture findings as you go
3. If findings are worth persisting, create a `note` Artifact:
   ```bash
   # Write note to opencontract/artifacts/<task>/<timestamp>-explore/note.md
   # Validate it
   opencontract validate opencontract/artifacts/<task>/<timestamp>-explore/note.md
   ```

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: note
    version: v1.0.0
    required: false
```

Persist a note only when findings are worth carrying into later work. Purely conversational explorations need no Artifact.

## Available commands

- `opencontract action list` — list all available Actions
- `opencontract action inspect explore --version v1.0.0` — show Action details
- `opencontract contract list` — list all Contracts
- `opencontract contract inspect note --version v1.0.0` — show Contract details
- `opencontract validate <path>` — validate an Artifact
- `opencontract doctor` — check workspace health
```

#### Skill Template

**File**: `.claude/skills/oc-explore/SKILL.md`

```markdown
<!-- opencontract:generated -->
---
name: oc-explore
description: Investigate and capture findings about unfamiliar areas
allowed-tools: Bash(opencontract:*)
metadata:
  version: v1.0.0
  category: opencontract
---

# Explore

[Same content as slash command, adapted for skill format]

## Declared contracts

```yaml opencontract
inputs: []
outputs: 
  - contract: note
    version: v1.0.0
    required: false
```
```

### CLI Command Changes

#### New: `opencontract install` (global installation)

```bash
opencontract install [--force]
```

**Behavior:**
1. Create `~/.opencontract/system/` and `~/.opencontract/cache/`
2. Copy bundled system Actions and Contracts to `~/.opencontract/system/`
3. Write `manifest.yaml` with version and timestamps
4. Generate user-level harness adapters to `~/.claude/`, `~/.cursor/`, etc.

**Exit codes:**
- `0` — Installation succeeded
- `1` — Already installed (use `--force` to reinstall)
- `2` — Installation failed

#### Modified: `opencontract init`

```bash
opencontract init [--harness claude,cursor]
```

**Behavior:**
1. Check if `~/.opencontract/` exists; if not, run `install` first
2. Create project `.opencontract/config.yaml` pointing to `~/.opencontract/system`
3. Create project directory structure:
   - `.opencontract/actions/`
   - `.opencontract/contracts/`
   - `opencontract/specs/`
   - `opencontract/artifacts/`
   - `opencontract/artifacts/archive/`
4. Generate project-level harness adapters to `.claude/`, `.cursor/`, etc.

**Changes from v1.0.0:**
- No longer copies system tree to `.opencontract/system/`
- Generates per-Action adapters instead of single entry point
- Installs adapters at both user and project level

#### Modified: `opencontract update`

```bash
opencontract update [--global] [--project]
```

**Flags:**
- `--global` (default when outside project) — Update `~/.opencontract/system` and user-level adapters
- `--project` (default when inside project) — Update project-level adapters
- No flags inside project — update both global and project

**Behavior:**
1. If `--global` or no project detected:
   - Stage new system tree to `~/.opencontract/.staging-<random>/`
   - Validate staged tree (manifest, Actions, Contracts, fixtures)
   - Snapshot current system to `~/.opencontract/cache/<version>/`
   - Atomically replace `~/.opencontract/system/`
   - Regenerate user-level harness adapters
2. If `--project` or inside project:
   - Regenerate project-level harness adapters from current global system
   - Detect and migrate old local system trees (see Migration section)

**Changes from v1.0.0:**
- Updates global system instead of per-project
- Supports `--global`/`--project` scope control
- Auto-migrates v1.0.0 projects on first `update`

#### New: `opencontract uninstall`

```bash
opencontract uninstall [--keep-cache]
```

**Behavior:**
1. Remove `~/.opencontract/system/`
2. Remove `~/.opencontract/config.yaml`
3. Remove `~/.opencontract/cache/` unless `--keep-cache`
4. Remove user-level harness adapters from `~/.claude/commands/oc/`, `~/.claude/skills/oc-*/`, etc.
5. Preserve project-level installations (user must clean those separately)

**Exit codes:**
- `0` — Uninstall succeeded
- `1` — Nothing to uninstall
- `2` — Uninstall failed (partial removal possible)

### Path Resolution Changes

#### Current (v1.0.0)

All paths in `config.yaml` must be:
- Relative to workspace root
- Not escape workspace root (before or after symlink resolution)

This prevents `system: ~/.opencontract/system` from working.

#### New (v1.1.0)

Distinguish **workspace paths** (must be relative) from **system paths** (can be absolute):

**Workspace paths** (must be relative, validated as before):
- `projectActions`
- `projectContracts`
- `specs`
- `artifacts`
- `archive`
- `registries[]`

**System paths** (can be absolute, new validation):
- `system`
- `cache`
- `trust.validatorRoots[]`

**System path validation:**
1. Expand `~/` to user home directory
2. If absolute path:
   - Must be under user home directory (security boundary)
   - Return expanded absolute path
3. If relative path:
   - Resolve relative to workspace root
   - Validate doesn't escape workspace (as before)
   - Return resolved absolute path

**Implementation:**

```typescript
// src/workspace/discovery.ts

function validateSystemPath(workspaceRoot: string, configuredPath: string): string {
  // Expand ~/
  const expanded = configuredPath.startsWith('~/')
    ? join(homedir(), configuredPath.slice(2))
    : configuredPath;

  if (isAbsolute(expanded)) {
    // Absolute path: must be under user home
    const userHome = homedir();
    if (!isUnderRoot(userHome, expanded)) {
      throw new OpenContractError(
        'PATH_OUTSIDE_HOME',
        'System paths must be under user home directory.',
        { path: expanded }
      );
    }
    return expanded;
  }

  // Relative path: resolve relative to workspace
  return validateRelative(workspaceRoot, expanded, 'system path');
}

export function resolvePaths(workspace: WorkspaceRoot): ResolvedPaths {
  const { root, config } = workspace;

  return {
    root,
    configPath: workspace.configPath,
    // System paths: allow absolute
    system: validateSystemPath(root, config.system!),
    cache: validateSystemPath(root, config.cache!),
    // Workspace paths: must be relative (unchanged)
    projectActions: validateRelative(root, config.projectActions!, 'projectActions'),
    projectContracts: validateRelative(root, config.projectContracts!, 'projectContracts'),
    specs: validateRelative(root, config.specs!, 'specs'),
    artifacts: validateRelative(root, config.artifacts!, 'artifacts'),
    archive: validateRelative(root, config.archive!, 'archive'),
    registries: config.registries!.map((reg, i) =>
      validateRelative(root, reg, `registries[${i}]`)
    ),
    // Validator roots: allow absolute
    trustedValidatorRoots: config.trust!.validatorRoots!.map((vr, i) =>
      validateSystemPath(root, vr)
    ),
  };
}
```

### Adapter Generation Implementation

#### New module: `src/system/generators.ts`

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { enumerateActions } from '../definitions/parser.js';
import { GENERATED_MARKER, isGenerated } from './harnesses.js';
import type { ActionDefinition } from '../domain/types.js';

export interface AdapterGenerateOptions {
  /** Path to system/actions/ directory */
  systemActionsRoot: string;
  /** Target root: ~/.claude or <project>/.claude */
  targetRoot: string;
  /** Harness name */
  harness: 'claude' | 'cursor' | 'codex';
  /** Overwrite existing generated files */
  force?: boolean;
}

export interface GenerateResult {
  commands: string[];
  skills: string[];
  skipped: string[];
}

/**
 * Generate per-Action slash commands and skills for one harness.
 * Returns paths of generated files and files skipped due to conflicts.
 */
export function generateAdapters(options: AdapterGenerateOptions): GenerateResult {
  const actions = enumerateActions(options.systemActionsRoot, 'system');
  const result: GenerateResult = { commands: [], skills: [], skipped: [] };

  for (const action of actions) {
    // Skip the legacy opencontract entry Action
    if (action.name === 'opencontract') continue;

    // Generate slash command
    const cmdPath = join(options.targetRoot, 'commands', 'oc', `${action.name}.md`);
    if (!existsSync(cmdPath) || isGenerated(cmdPath) || options.force) {
      const cmdContent = renderCommand(action, options.harness);
      mkdirSync(dirname(cmdPath), { recursive: true });
      writeFileSync(cmdPath, cmdContent, 'utf-8');
      result.commands.push(cmdPath);
    } else {
      result.skipped.push(cmdPath);
    }

    // Generate skill
    const skillPath = join(options.targetRoot, 'skills', `oc-${action.name}`, 'SKILL.md');
    if (!existsSync(skillPath) || isGenerated(skillPath) || options.force) {
      const skillContent = renderSkill(action, options.harness);
      mkdirSync(dirname(skillPath), { recursive: true });
      writeFileSync(skillPath, skillContent, 'utf-8');
      result.skills.push(skillPath);
    } else {
      result.skipped.push(skillPath);
    }
  }

  return result;
}

/**
 * Split an Action's SKILL.md into the prose body and its declared-contracts
 * block. Both are copied verbatim into the adapter so the generated file is
 * self-contained: an agent reading `/oc:explore` needs no second hop to
 * `~/.opencontract/system/` to know what the Action does or what it must emit.
 */
function actionBody(action: ActionDefinition): { prose: string; contracts: string } {
  const source = readFileSync(join(action.packagePath, 'SKILL.md'), 'utf-8');
  const { content } = matter(source);

  // Drop the leading `# <Title>` heading — the adapter supplies its own.
  const withoutHeading = content.replace(/^\s*#\s+.*\n+/, '');

  // The ```yaml opencontract block is the contract declaration; everything
  // else is guidance. An Action without one declares no inputs or outputs.
  const fence = /```yaml opencontract\n([\s\S]*?)```/;
  const matched = fence.exec(withoutHeading);

  return {
    prose: withoutHeading.replace(fence, '').replace(/\n{3,}/g, '\n\n').trim(),
    contracts: matched?.[1]?.trim() ?? 'inputs: []\noutputs: []',
  };
}

function renderCommand(action: ActionDefinition, harness: string): string {
  const title = action.name.charAt(0).toUpperCase() + action.name.slice(1);
  const { prose, contracts } = actionBody(action);

  return `${GENERATED_MARKER}
---
name: "OC: ${title}"
description: "${action.description}"
allowed-tools: Bash(opencontract:*)
category: "OpenContract"
tags: ["opencontract"]
---

# ${title}

${prose}

## Declared contracts

\`\`\`yaml opencontract
${contracts}
\`\`\`

## Available commands

- \`opencontract action list\` — list all available Actions
- \`opencontract action inspect ${action.name} --version ${action.version}\` — show Action details
- \`opencontract contract list\` — list all Contracts
- \`opencontract validate <path>\` — validate an Artifact
- \`opencontract validate-action <dir>\` — validate an ActionRun
- \`opencontract doctor\` — check workspace health
`;
}

function renderSkill(action: ActionDefinition, harness: string): string {
  const title = action.name.charAt(0).toUpperCase() + action.name.slice(1);
  const { prose, contracts } = actionBody(action);

  return `${GENERATED_MARKER}
---
name: oc-${action.name}
description: ${action.description}
allowed-tools: Bash(opencontract:*)
metadata:
  version: ${action.version}
  category: opencontract
---

# ${title}

${prose}

## Declared contracts

\`\`\`yaml opencontract
${contracts}
\`\`\`
`;
}
```

Both formats inline the Action's guidance verbatim rather than pointing at
`~/.opencontract/system/`. The two differ only in frontmatter and in the command
reference footer — the body is the same text, so a harness that supports only
skills loses nothing.

The Action's SKILL.md remains the single source: adapters are derived artifacts,
regenerated on every `update`, and the generated marker is what makes that safe.

### Migration Strategy

#### Auto-migration on `opencontract update`

When `update` runs inside a project with an old local system tree:

1. **Detect old structure**: `.opencontract/system/manifest.yaml` exists
2. **Install global system** (if not already): run `installGlobalSystem()`
3. **Migrate cache**: copy `.opencontract/cache/` to `~/.opencontract/cache/` (merge, don't overwrite)
4. **Update config**: rewrite `.opencontract/config.yaml` with `system: ~/.opencontract/system` and `cache: ~/.opencontract/cache`
5. **Backup old system**: rename `.opencontract/system/` to `.opencontract/system.backup-<timestamp>`
6. **Remove old adapters**: delete `.claude/skills/opencontract/` if it's generated (check marker)
7. **Generate new adapters**: create per-Action commands and skills

```typescript
// src/system/migration.ts

export interface MigrationResult {
  needed: boolean;
  backupPath?: string;
  message?: string;
}

export function migrateToGlobalSystem(workspaceRoot: string): MigrationResult {
  const oldSystem = join(workspaceRoot, '.opencontract', 'system');
  const oldCache = join(workspaceRoot, '.opencontract', 'cache');
  const globalRoot = join(homedir(), '.opencontract');

  // Check if migration needed
  if (!existsSync(join(oldSystem, 'manifest.yaml'))) {
    return { needed: false };
  }

  // 1. Ensure global system exists
  if (!existsSync(join(globalRoot, 'system', 'manifest.yaml'))) {
    installGlobalSystem();
  }

  // 2. Migrate cache if exists
  if (existsSync(oldCache)) {
    const globalCache = join(globalRoot, 'cache');
    mkdirSync(globalCache, { recursive: true });
    // Copy cache versions, skip existing
    for (const entry of readdirSync(oldCache)) {
      const src = join(oldCache, entry);
      const dst = join(globalCache, entry);
      if (!existsSync(dst)) {
        cpSync(src, dst, { recursive: true });
      }
    }
  }

  // 3. Update project config
  const configPath = join(workspaceRoot, '.opencontract', 'config.yaml');
  const config = parseYaml(readFileSync(configPath, 'utf-8')) as any;
  config.system = '~/.opencontract/system';
  config.cache = '~/.opencontract/cache';
  if (config.trust?.validatorRoots) {
    config.trust.validatorRoots = config.trust.validatorRoots.map((root: string) =>
      root === '.opencontract/system' ? '~/.opencontract/system' : root
    );
  }
  writeFileSync(configPath, stringify(config), 'utf-8');

  // 4. Backup old system
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${oldSystem}.backup-${timestamp}`;
  renameSync(oldSystem, backupPath);

  // 5. Remove old entry adapter if generated
  const oldAdapter = join(workspaceRoot, '.claude', 'skills', 'opencontract', 'SKILL.md');
  if (existsSync(oldAdapter) && isGenerated(oldAdapter)) {
    rmSync(dirname(oldAdapter), { recursive: true });
  }

  return {
    needed: true,
    backupPath,
    message: `Migrated to global system. Old system backed up at ${backupPath}`,
  };
}
```

#### User communication

**On first `update` after upgrading to v1.1.0:**

```
✓ Global system installed at ~/.opencontract/system (v1.1.0)
✓ Migrated project to use global system
✓ Old system backed up at .opencontract/system.backup-2026-08-29T12-34-56
✓ Generated 13 slash commands at .claude/commands/oc/
✓ Generated 13 skills at .claude/skills/oc-*/

Migration complete. You can now use /oc:explore, /oc:build, etc.
To remove the backup: rm -rf .opencontract/system.backup-*
```

### Testing Strategy

#### Unit tests

- `src/workspace/discovery.test.ts`:
  - `validateSystemPath()` accepts `~/.opencontract/system`
  - `validateSystemPath()` rejects `/etc/opencontract` (outside home)
  - `validateSystemPath()` accepts relative paths as before
  - `resolvePaths()` resolves system paths to absolute
- `src/system/generators.test.ts`:
  - `generateAdapters()` creates correct number of files
  - Generated files contain `<!-- opencontract:generated -->` marker
  - Skips user-authored files (no marker)
  - `--force` overwrites generated files
- `src/system/migration.test.ts`:
  - `migrateToGlobalSystem()` detects old structure
  - Copies cache without overwriting existing versions
  - Updates config paths
  - Creates backup
  - Removes old generated adapters

#### Integration tests

- `test/integration/global-install.test.ts`:
  - `opencontract install` creates `~/.opencontract/system`
  - `opencontract install` generates user-level adapters
  - `opencontract init` reuses global system
  - `opencontract init` generates project-level adapters
  - Project-level adapter overrides user-level (test with mock harness)
- `test/integration/migration.test.ts`:
  - `opencontract update` migrates v1.0.0 project
  - Validation works after migration
  - `opencontract validate` finds Contracts in global system

#### Manual testing

1. Fresh install:
   ```bash
   opencontract install
   ls ~/.opencontract/system/actions  # Should see 13 Actions
   ls ~/.claude/commands/oc           # Should see 13 commands
   ls ~/.claude/skills                # Should see 13 oc-* skills
   ```

2. Project init:
   ```bash
   cd /tmp/test-project
   opencontract init --harness claude
   ls .opencontract/system            # Should NOT exist
   cat .opencontract/config.yaml      # Should reference ~/.opencontract/system
   ls .claude/commands/oc             # Should see 13 commands
   ```

3. Migration:
   ```bash
   cd existing-v1.0-project
   opencontract update
   ls .opencontract/system.backup-*   # Old system backed up
   cat .opencontract/config.yaml      # Now references ~/.opencontract/system
   opencontract validate artifacts/test.md  # Should work
   ```

4. Slash commands:
   ```bash
   # In Claude Code
   /oc:explore <Enter>  # Should show Explore Action guidance
   /oc:build <Enter>    # Should show Build Action guidance
   ```

## Implementation Plan

### Phase 1: Path validation and config changes

**Files:**
- `src/workspace/discovery.ts` — add `validateSystemPath()`
- `src/domain/types.ts` — update `WorkspaceConfig` docs
- `test/workspace/discovery.test.ts` — path validation tests

**Acceptance:**
- Config with `system: ~/.opencontract/system` loads without error
- Relative `system: .opencontract/system` still works
- Absolute path outside home is rejected

### Phase 2: Adapter generation

**Files:**
- `src/system/generators.ts` — new module
- `test/system/generators.test.ts` — generator tests

**Acceptance:**
- `generateAdapters()` creates per-Action commands and skills
- Generated files have correct frontmatter
- Skips non-generated files

### Phase 3: Global install command

**Files:**
- `src/cli/commands/install.ts` — new command
- `src/system/install.ts` — installation logic
- `test/cli/commands/install.test.ts` — command tests
- `test/integration/global-install.test.ts` — integration test

**Acceptance:**
- `opencontract install` creates `~/.opencontract/system`
- Generates user-level adapters
- Idempotent (second run does nothing unless `--force`)

### Phase 4: Update init command

**Files:**
- `src/workspace/init.ts` — modify to use global system
- `test/workspace/init.test.ts` — update tests

**Acceptance:**
- `opencontract init` calls `install` if needed
- Creates project config pointing to `~/.opencontract/system`
- Generates project-level adapters
- Does NOT create `.opencontract/system/`

### Phase 5: Migration logic

**Files:**
- `src/system/migration.ts` — new module
- `src/system/update.ts` — integrate migration
- `test/system/migration.test.ts` — migration tests
- `test/integration/migration.test.ts` — integration test

**Acceptance:**
- `opencontract update` detects old structure
- Migrates cache and config
- Backs up old system
- Generates new adapters

### Phase 6: Uninstall command

**Files:**
- `src/cli/commands/uninstall.ts` — new command
- `test/cli/commands/uninstall.test.ts` — command tests

**Acceptance:**
- `opencontract uninstall` removes `~/.opencontract/`
- Removes user-level adapters
- `--keep-cache` preserves cache

### Phase 7: Documentation

**Files:**
- `README.md` — update installation and init sections
- `docs/migration-v1.1.md` — new migration guide
- Update inline command help text

**Acceptance:**
- README shows new directory structure
- Migration guide covers v1.0 → v1.1 upgrade
- `opencontract install --help` is accurate

## Rollout Plan

### Version timeline

- **v1.1.0-alpha.1** — Phases 1-2 (path validation, generators)
- **v1.1.0-beta.1** — Phases 3-5 (install, init, migration)
- **v1.1.0-rc.1** — Phase 6-7 (uninstall, docs)
- **v1.1.0** — Stable release

### Deprecation timeline

- **v1.1.0** — Auto-migration on `update`, no breaking changes
- **v1.2.0** — Remove auto-migration code (old backups remain on disk)
- **v2.0.0** — Remove support for local system paths in config

### Communication

**Release notes (v1.1.0):**

> **New: Global system installation**
>
> OpenContract now installs system Actions and Contracts once in `~/.opencontract/` and shares them across all projects. This reduces per-project storage and simplifies updates.
>
> **New: Per-Action slash commands**
>
> Instead of a single `/opencontract` entry point, each Action is now a slash command: `/oc:explore`, `/oc:build`, `/oc:plan`, etc. Skills (`oc-explore`, `oc-build`, etc.) are also available for harnesses that don't support slash commands.
>
> **Automatic migration**
>
> Existing projects are automatically migrated when you run `opencontract update`. Your old system tree is backed up to `.opencontract/system.backup-<timestamp>` and can be safely deleted after verifying the migration.
>
> **Breaking changes**: None. Old projects continue to work and are migrated transparently.

## Risks and Mitigations

### Risk: Global system version conflicts

**Scenario:** User has multiple projects expecting different OpenContract versions. Global system at v1.2.0 breaks a project that expects v1.1.0.

**Mitigation:**
1. **Version locking** (future): Allow projects to pin `system: ~/.opencontract/cache/1.1.0` to use a cached version
2. **Documentation**: Recommend testing projects after global updates
3. **Rollback**: `~/.opencontract/cache/` preserves old versions; users can manually restore

### Risk: User home directory on network filesystem

**Scenario:** `~/.opencontract/` on NFS or similar may have poor performance or consistency issues.

**Mitigation:**
1. **Fallback**: Projects can still use `system: .opencontract/system` (relative path) to opt out of global
2. **Documentation**: Note performance considerations for network home directories
3. **Config override**: `OPENCONTRACT_HOME` environment variable (future) to relocate global root

### Risk: Adapter namespace collision

**Scenario:** User has another tool that owns `~/.claude/commands/oc/` or `~/.claude/skills/oc-*`. Without a generated marker, every adapter is skipped and the user is left with a half-installed state that reports success.

**Mitigation — fail loud, install nothing:**

Generation is all-or-nothing per (harness, location) pair. Before writing, probe every target path:

1. If any existing file at a target path lacks `<!-- opencontract:generated -->`, treat the whole pair as a conflict: write **no** files for it, and report which paths collided.
2. `install`/`init`/`update` exit `1` with the colliding paths listed. Other harnesses and the other location still install — a project-level collision does not block the user-level install, and vice versa.
3. The message names the two escapes: `--force` to overwrite the conflicting files, or remove/rename them manually.

Partial installs are the failure mode worth preventing: 6 of 13 commands present is harder to diagnose than 0 of 13.

**Future**: namespace customization via config (e.g. `namespace: opencontract`) — see Open Questions.

### Risk: Migration data loss

**Scenario:** Migration fails mid-way; user loses system tree or cache.

**Mitigation:**
1. **Transactional migration**: Backup before modifying, verify global system exists before deleting local
2. **Detailed logging**: Log each migration step for troubleshooting
3. **Rollback**: Keep `.opencontract/system.backup-*` until user explicitly deletes

## Alternatives Considered

### Alternative 1: Keep local system, add symlink option

**Description:** Projects keep `.opencontract/system/` as default, but `init --shared` creates it as a symlink to `~/.opencontract/system`.

**Pros:**
- Less invasive change
- No migration needed

**Cons:**
- Symlink behavior varies by OS (especially Windows)
- Users still need to run `update` in each project unless symlink is used
- Doesn't solve project bloat by default

**Decision:** Rejected. Global by default is simpler and matches user expectations ("install once").

### Alternative 2: Single entry point with dynamic dispatch

**Description:** Keep `/opencontract` as single command, but have it read `~/.opencontract/system/actions/` and dynamically dispatch to the named Action.

**Pros:**
- Fewer files generated (1 vs 26 per harness)
- Namespace doesn't collide

**Cons:**
- Loses command-completion discoverability (`/oc:<tab>` showing all Actions)
- Adds parsing complexity (splitting command line into action name and args)
- Inconsistent with ecosystem patterns (openspec, other tools use per-workflow commands)

**Decision:** Rejected. Per-Action commands improve UX and are now the ecosystem standard.

### Alternative 3: XDG Base Directory on Linux only

**Description:** Use `~/.local/share/opencontract` on Linux/BSD, `~/Library/Application Support/OpenContract` on macOS, etc.

**Pros:**
- Follows platform-specific conventions

**Cons:**
- Complicates implementation (per-platform logic)
- User documentation becomes platform-specific
- Less obvious where files are ("where did it install?" → check your platform)

**Decision:** Rejected. `~/.opencontract` is simple, cross-platform, and matches existing CLI tool conventions (e.g., `~/.aws`, `~/.kube`).

## Open Questions

1. **Namespace customization**: Should projects be able to override the `oc:` namespace? Use case: A project with an existing `/oc:` tool wants to use `/opencontract:` instead.

   **Proposed answer**: Defer to v1.2.0. Most users won't need it; those who do can work around by manually editing generated files (which won't be regenerated since they lack the marker).

2. **Multiple global versions**: Should we support side-by-side global installs (e.g., `~/.opencontract/versions/1.1.0/`, `~/.opencontract/versions/1.2.0/`) and per-project version pinning?

   **Proposed answer**: Defer to v1.2.0+. The cache already preserves old versions; adding multi-version support now complicates the initial rollout without proven demand.

3. **Template inlining vs. reference**: Should generated adapters inline the full Action SKILL.md content, or reference it (e.g., "Load guidance from ~/.opencontract/system/actions/explore/SKILL.md")?

   **Proposed answer**: Start with references (simpler generation). Inlining can be added in v1.1.x if users report that references are confusing.

## Success Metrics

- **Zero data loss**: No reported issues of lost Actions, Contracts, or artifacts during migration
- **Reduced project size**: `.opencontract/` directory size drops from ~100KB (with bundled system) to <10KB (config + custom definitions only) after migration
- **Clean upgrades**: Migration completes without manual intervention in tested scenarios (unit + integration test coverage)

## Future Enhancements

- **Registry support**: Fetch system definitions from remote registry instead of bundled copy
- **Multi-version support**: Allow projects to pin to specific global system versions
- **Namespace customization**: Config option to override `oc:` prefix
- **Inline templates**: Generate adapters with full Action content inlined instead of references
- **System update notifications**: Check for newer global system versions and prompt user to upgrade
