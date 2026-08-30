# Upgrading from v1.0 to v1.1

v1.1 moves system definitions out of each project and into one shared installation at `~/.opencontract/`. A v1.0 project keeps its own `.opencontract/system/` tree; v1.1 projects reference the global one instead.

You do not need to run migration by hand. `opencontract update` detects a v1.0 project and migrates it.

## What changes

| | v1.0 | v1.1 |
|---|---|---|
| System tree | `<project>/.opencontract/system/` | `~/.opencontract/system/` |
| Cache | `<project>/.opencontract/cache/` | `~/.opencontract/cache/` |
| Adapters | one `opencontract` entry Skill per harness | per-Action `/oc:<action>` commands and `oc-<action>` skills |
| Adapter locations | project only | user-level (`~/.claude/`) and project-level (`<project>/.claude/`) |

Project-owned content — your Specs, Artifacts, project Actions, and project Contracts — is not touched.

## Migrating

```bash
cd your-project
opencontract update
```

The command reports each step it took. In order, migration:

1. Installs the global system at `~/.opencontract/` if it is not already there.
2. Merges `.opencontract/cache/*` into `~/.opencontract/cache/`. Cached versions are immutable, so a version already present globally wins and the local copy is skipped.
3. Rewrites `.opencontract/config.yaml` so `system`, `cache`, and any local `trust.validatorRoots` entry point at `~/.opencontract`. Comments and unrelated fields are preserved.
4. Renames `.opencontract/system/` to `.opencontract/system.backup-<timestamp>`.
5. Removes the legacy single-entry adapter (`.claude/skills/opencontract/` and equivalents), but only where OpenContract generated it.
6. Generates per-Action adapters for the harnesses in your config.

The config is rewritten before the old tree is renamed, so a failure never leaves a config pointing at a directory that is already gone.

## Verifying

```bash
opencontract doctor          # workspace health
opencontract action list     # Actions resolve from the global system
opencontract validate opencontract/artifacts
```

Once satisfied, remove the backup:

```bash
rm -rf .opencontract/system.backup-*
```

## Rolling back

The backup is a complete copy of your old system tree. To return to the v1.0 layout:

```bash
mv .opencontract/system.backup-<timestamp> .opencontract/system
```

Then edit `.opencontract/config.yaml` back to the local paths:

```yaml
system: .opencontract/system
cache: .opencontract/cache
trust:
  validatorRoots:
    - .opencontract/system
```

Relative system paths remain supported in v1.1, so a project can stay on the local model indefinitely. This is also the escape hatch if your home directory is on a slow network filesystem.

## Things worth knowing

**A hand-edited legacy adapter is preserved.** If `.claude/skills/opencontract/SKILL.md` has no `<!-- opencontract:generated -->` marker, migration leaves it alone and reports that you should remove it yourself.

**Adapter collisions abort generation for that harness.** If a target path holds a file OpenContract did not write, no adapters are written for that harness and the collision is reported. Resolve the listed paths, or rerun with `--force` to overwrite.

**One global system serves every project.** After a global update, projects share the new version. Verify projects that depend on specific Action behavior. `~/.opencontract/cache/` keeps prior versions if you need to compare.

## Deprecation timeline

- **v1.1** — auto-migration on `update`; no breaking changes.
- **v1.2** — auto-migration code removed. Migrate before upgrading past v1.1. Existing backups stay on disk.
- **v2.0** — local system paths in config no longer supported.
