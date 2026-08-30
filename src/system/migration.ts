import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GENERATED_MARKER } from './harnesses.js';
import { generateAdapters } from './generators.js';
import { installGlobalSystem, isGlobalSystemInstalled } from './install.js';

/**
 * v1.0.0 -> v1.1.0 migration.
 *
 * A v1.0.0 project carries its own `.opencontract/system/` tree. Migration
 * moves that project onto the shared global system: cache history is merged
 * upward, the config is rewritten to point at `~/.opencontract`, the old tree is
 * kept as a timestamped backup, the legacy single-entry adapter is removed, and
 * per-Action adapters are generated in its place.
 *
 * Ordering matters: the config is rewritten before the old tree is renamed, so a
 * failure never leaves a project whose config points at a directory that is
 * already gone.
 */

export interface MigrationResult {
  /** False when the project was already on the global model. */
  readonly needed: boolean;
  readonly success: boolean;
  /** Where the old system tree was moved, when a backup was taken. */
  readonly backupPath?: string;
  /** Human-readable steps performed, in order. */
  readonly steps: string[];
  /** Cache versions copied up to the global cache. */
  readonly cacheMerged: string[];
  /** Cache versions skipped because the global cache already had them. */
  readonly cacheSkipped: string[];
  /** Legacy adapter directories removed. */
  readonly legacyRemoved: string[];
  /** Legacy adapters left alone because a human authored them. */
  readonly legacyPreserved: string[];
  readonly errors: string[];
}

export interface MigrationOptions {
  /** Project root containing `.opencontract/`. */
  readonly projectRoot: string;
  /** Home directory override; tests point this at a temp dir. */
  readonly home?: string;
}

const LEGACY_HARNESS_DIRS = ['.claude', '.cursor', '.codex'];

/**
 * Migrate one v1.0.0 project onto the global system model. Idempotent: a project
 * with no local `.opencontract/system/manifest.yaml` returns `needed: false`
 * without touching anything.
 */
export function migrateToGlobalSystem(options: MigrationOptions): MigrationResult {
  const { projectRoot } = options;
  const home = options.home ?? homedir();

  const steps: string[] = [];
  const errors: string[] = [];
  const cacheMerged: string[] = [];
  const cacheSkipped: string[] = [];
  const legacyRemoved: string[] = [];
  const legacyPreserved: string[] = [];

  const localSystem = join(projectRoot, '.opencontract', 'system');
  const localCache = join(projectRoot, '.opencontract', 'cache');
  const configPath = join(projectRoot, '.opencontract', 'config.yaml');

  // Detection: a v1.0.0 project is one with a local system manifest.
  if (!existsSync(join(localSystem, 'manifest.yaml'))) {
    return {
      needed: false,
      success: true,
      steps: [],
      cacheMerged,
      cacheSkipped,
      legacyRemoved,
      legacyPreserved,
      errors,
    };
  }

  const globalCache = join(home, '.opencontract', 'cache');

  try {
    // 1. The global system has to exist before a project can point at it.
    if (!isGlobalSystemInstalled(home)) {
      const harnesses = readConfigHarnesses(configPath) ?? ['codex', 'claude', 'cursor'];
      const installed = installGlobalSystem({ harnesses, home });
      if (!installed.success) {
        errors.push(...installed.errors);
        return {
          needed: true,
          success: false,
          steps,
          cacheMerged,
          cacheSkipped,
          legacyRemoved,
          legacyPreserved,
          errors,
        };
      }
      steps.push(`Installed global system at ${installed.systemRoot}`);
    } else {
      steps.push('Reused existing global system');
    }

    // 2. Merge cache upward. Cached versions are immutable, so an entry already
    //    present globally wins and the local copy is skipped.
    if (existsSync(localCache)) {
      for (const version of readdirSync(localCache)) {
        const source = join(localCache, version);
        const target = join(globalCache, version);
        if (existsSync(target)) {
          cacheSkipped.push(version);
        } else {
          cpSync(source, target, { recursive: true });
          cacheMerged.push(version);
        }
      }
      if (cacheMerged.length > 0) {
        steps.push(`Merged cache versions into global cache: ${cacheMerged.join(', ')}`);
      }
      if (cacheSkipped.length > 0) {
        steps.push(`Skipped cache versions already global: ${cacheSkipped.join(', ')}`);
      }
    }

    // 3. Rewrite the config before moving the tree, so the project never points
    //    at a path that has already been renamed away.
    rewriteConfig(configPath);
    steps.push('Rewrote config to reference ~/.opencontract');

    // 4. Back up the old tree with a filesystem-safe ISO timestamp.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(projectRoot, '.opencontract', `system.backup-${timestamp}`);
    renameSync(localSystem, backupPath);
    steps.push(`Backed up old system tree to ${backupPath}`);

    // 5. Drop the legacy single-entry adapter, but only where OpenContract wrote it.
    for (const harnessDir of LEGACY_HARNESS_DIRS) {
      const legacyDir = join(projectRoot, harnessDir, 'skills', 'opencontract');
      const legacySkill = join(legacyDir, 'SKILL.md');
      if (!existsSync(legacySkill)) continue;

      if (isGeneratedFile(legacySkill)) {
        rmSync(legacyDir, { recursive: true, force: true });
        legacyRemoved.push(legacyDir);
      } else {
        legacyPreserved.push(legacySkill);
      }
    }
    if (legacyRemoved.length > 0) {
      steps.push(`Removed legacy adapters: ${legacyRemoved.join(', ')}`);
    }
    for (const preserved of legacyPreserved) {
      errors.push(
        `Legacy adapter at ${preserved} was authored by hand and was left in place; remove it manually.`,
      );
    }

    // 6. Generate the per-Action adapters that replace the single entry point.
    const globalSystemRoot = join(home, '.opencontract', 'system');
    const harnesses = readConfigHarnesses(configPath) ?? [];
    for (const harness of harnesses) {
      const result = generateAdapters({
        systemRoot: globalSystemRoot,
        targetRoot: join(projectRoot, `.${harness}`),
        harness,
      });
      if (result.collisions.length > 0) {
        errors.push(
          `Adapter collision for ${harness}: ${result.collisions.join(', ')}. Resolve the listed paths or rerun with --force.`,
        );
      } else {
        steps.push(
          `Generated ${result.commands.length} commands and ${result.skills.length} skills for ${harness}`,
        );
      }
    }

    return {
      needed: true,
      success: errors.length === 0,
      backupPath,
      steps,
      cacheMerged,
      cacheSkipped,
      legacyRemoved,
      legacyPreserved,
      errors,
    };
  } catch (cause) {
    errors.push(
      `Migration failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    return {
      needed: true,
      success: false,
      steps,
      cacheMerged,
      cacheSkipped,
      legacyRemoved,
      legacyPreserved,
      errors,
    };
  }
}

/** True when a project still carries a v1.0.0 local system tree. */
export function needsMigration(projectRoot: string): boolean {
  return existsSync(join(projectRoot, '.opencontract', 'system', 'manifest.yaml'));
}

/**
 * Point `system`, `cache`, and any local `trust.validatorRoots` entry at the
 * global tree. Edited line-wise rather than through a YAML round-trip so that
 * comments, ordering, and unrelated fields survive untouched.
 */
function rewriteConfig(configPath: string): void {
  if (!existsSync(configPath)) return;

  const rewritten = readFileSync(configPath, 'utf-8')
    .split('\n')
    .map((line) => {
      if (/^system:\s*/.test(line)) return 'system: ~/.opencontract/system';
      if (/^cache:\s*/.test(line)) return 'cache: ~/.opencontract/cache';
      // Validator roots are list items, so the indentation has to be preserved.
      const validatorRoot = /^(\s*-\s*)\.opencontract\/system\s*$/.exec(line);
      if (validatorRoot) return `${validatorRoot[1]}~/.opencontract/system`;
      return line;
    })
    .join('\n');

  writeFileSync(configPath, rewritten, 'utf-8');
}

/** Harness list from a project config, or undefined when absent/malformed. */
function readConfigHarnesses(configPath: string): string[] | undefined {
  if (!existsSync(configPath)) return undefined;
  const matched = /^harnesses:\s*\[(.*)\]\s*$/m.exec(readFileSync(configPath, 'utf-8'));
  if (!matched) return undefined;

  const names = matched[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return names.length > 0 ? names : undefined;
}

function isGeneratedFile(path: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8')
    .slice(0, GENERATED_MARKER.length + 2)
    .startsWith(GENERATED_MARKER);
}
