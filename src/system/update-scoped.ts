import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bundledSystemRoot } from '../resources.js';
import { enumerateActions, enumerateContracts } from '../definitions/parser.js';
import { generateAdapters } from './generators.js';
import { readGlobalHarnesses } from './install.js';
import { migrateToGlobalSystem, needsMigration, type MigrationResult } from './migration.js';

/**
 * Scoped update for the global installation model.
 *
 * The global half stages a fresh system tree, validates it, snapshots the live
 * one into the cache, and swaps by rename — so a validation failure never
 * touches what is installed. The project half regenerates project-level
 * adapters against whatever the global system currently is, and migrates a
 * v1.0.0 project on the way through.
 */

export interface ScopedUpdateOptions {
  /** Update `~/.opencontract/system` and user-level adapters. */
  readonly global?: boolean;
  /** Regenerate project-level adapters and migrate if needed. */
  readonly project?: boolean;
  /** Project root, when running inside one. */
  readonly projectRoot?: string;
  /** Home directory override; tests point this at a temp dir. */
  readonly home?: string;
  /** Overwrite adapters that a human authored. */
  readonly force?: boolean;
}

export interface GlobalUpdateResult {
  readonly success: boolean;
  readonly newVersion: string;
  readonly previousVersion?: string;
  /** Version the previous system was snapshotted into the cache under. */
  readonly cachedAs?: string;
  readonly userAdapters: Record<string, { commands: number; skills: number }>;
  readonly errors: string[];
}

export interface ProjectUpdateResult {
  readonly success: boolean;
  readonly migration?: MigrationResult;
  readonly projectAdapters: Record<string, { commands: number; skills: number }>;
  readonly errors: string[];
}

export interface ScopedUpdateResult {
  readonly success: boolean;
  readonly scope: { global: boolean; project: boolean };
  readonly globalResult?: GlobalUpdateResult;
  readonly projectResult?: ProjectUpdateResult;
}

/**
 * Resolve which halves to run. Outside a project only the global half is
 * meaningful; inside a project with no flags, both run.
 */
export function resolveUpdateScope(options: ScopedUpdateOptions): {
  global: boolean;
  project: boolean;
} {
  const insideProject = Boolean(options.projectRoot);

  if (options.global || options.project) {
    return {
      global: Boolean(options.global),
      project: Boolean(options.project) && insideProject,
    };
  }

  return { global: true, project: insideProject };
}

/** Validate a staged tree before it is allowed to replace the live one. */
function validateStaged(stagingRoot: string): string[] {
  const errors: string[] = [];

  if (!existsSync(join(stagingRoot, 'manifest.yaml'))) {
    errors.push(`Staged system has no manifest: ${stagingRoot}`);
  }
  if (enumerateActions(join(stagingRoot, 'actions'), 'system').length === 0) {
    errors.push('Staged system contains no Actions.');
  }
  if (enumerateContracts(join(stagingRoot, 'contracts'), 'system').length === 0) {
    errors.push('Staged system contains no Contracts.');
  }

  return errors;
}

function readVersion(systemRoot: string): string | undefined {
  const manifestPath = join(systemRoot, 'manifest.yaml');
  if (!existsSync(manifestPath)) return undefined;
  try {
    return /^version:\s*["']?([^"'\s]+)/m.exec(readFileSync(manifestPath, 'utf-8'))?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Update the global system: stage, validate, snapshot to cache, swap by rename,
 * then regenerate user-level adapters. A validation failure removes the staging
 * directory and leaves the installed system exactly as it was.
 */
export function updateGlobalSystem(options: ScopedUpdateOptions = {}): GlobalUpdateResult {
  const home = options.home ?? homedir();
  const globalRoot = join(home, '.opencontract');
  const systemRoot = join(globalRoot, 'system');
  const cacheRoot = join(globalRoot, 'cache');

  const errors: string[] = [];
  const userAdapters: Record<string, { commands: number; skills: number }> = {};
  const previousVersion = readVersion(systemRoot);

  mkdirSync(globalRoot, { recursive: true });
  const stagingDir = mkdtempSync(join(globalRoot, '.staging-'));
  let cachedAs: string | undefined;

  try {
    cpSync(bundledSystemRoot(), stagingDir, { recursive: true });
    const newVersion = readVersion(stagingDir) ?? 'unknown';

    // Rollback point: nothing installed has been touched yet.
    const stagingErrors = validateStaged(stagingDir);
    if (stagingErrors.length > 0) {
      rmSync(stagingDir, { recursive: true, force: true });
      return {
        success: false,
        newVersion,
        previousVersion,
        userAdapters,
        errors: stagingErrors,
      };
    }

    // Snapshot the live system into the cache before replacing it.
    if (previousVersion && existsSync(systemRoot)) {
      const snapshot = join(cacheRoot, previousVersion);
      if (!existsSync(snapshot)) {
        mkdirSync(cacheRoot, { recursive: true });
        cpSync(systemRoot, snapshot, { recursive: true });
      }
      cachedAs = previousVersion;
    }

    // Swap by rename. The old tree is kept until the swap lands.
    const backupDir = `${systemRoot}.replacing-${Date.now()}`;
    if (existsSync(systemRoot)) {
      renameSync(systemRoot, backupDir);
    }
    try {
      renameSync(stagingDir, systemRoot);
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true });
      }
    } catch (swapError) {
      if (existsSync(backupDir)) {
        if (existsSync(systemRoot)) rmSync(systemRoot, { recursive: true, force: true });
        renameSync(backupDir, systemRoot);
      }
      throw swapError;
    }

    // Regenerate user-level adapters against the new system.
    const harnesses = readGlobalHarnesses(home) ?? ['codex', 'claude', 'cursor'];
    for (const harness of harnesses) {
      const result = generateAdapters({
        systemRoot,
        targetRoot: join(home, `.${harness}`),
        harness,
        // Regeneration owns what it previously generated.
        force: options.force ?? true,
      });
      if (result.collisions.length > 0) {
        errors.push(`Adapter collision for ${harness}: ${result.collisions.join(', ')}`);
      } else {
        userAdapters[harness] = {
          commands: result.commands.length,
          skills: result.skills.length,
        };
      }
    }

    return {
      success: errors.length === 0,
      newVersion,
      previousVersion,
      cachedAs,
      userAdapters,
      errors,
    };
  } catch (cause) {
    errors.push(`Global update failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { success: false, newVersion: 'unknown', previousVersion, cachedAs, userAdapters, errors };
  } finally {
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

/**
 * Update one project: migrate it off a v1.0.0 local system if needed, then
 * regenerate project-level adapters from the current global system.
 */
export function updateProject(options: ScopedUpdateOptions): ProjectUpdateResult {
  const home = options.home ?? homedir();
  const projectRoot = options.projectRoot;
  const errors: string[] = [];
  const projectAdapters: Record<string, { commands: number; skills: number }> = {};

  if (!projectRoot) {
    return { success: false, projectAdapters, errors: ['No project root supplied.'] };
  }

  // Migration first: it rewrites the config the adapter step then reads.
  let migration: MigrationResult | undefined;
  if (needsMigration(projectRoot)) {
    migration = migrateToGlobalSystem({ projectRoot, home });
    if (!migration.success) {
      errors.push(...migration.errors);
      return { success: false, migration, projectAdapters, errors };
    }
    // Migration already generated the project adapters.
    for (const harness of readProjectHarnesses(projectRoot) ?? []) {
      const commandsDir = join(projectRoot, `.${harness}`, 'commands', 'oc');
      if (existsSync(commandsDir)) {
        projectAdapters[harness] = { commands: -1, skills: -1 };
      }
    }
    return { success: true, migration, projectAdapters, errors };
  }

  const systemRoot = join(home, '.opencontract', 'system');
  if (!existsSync(join(systemRoot, 'manifest.yaml'))) {
    return {
      success: false,
      projectAdapters,
      errors: ['Global system not installed. Run "opencontract install" first.'],
    };
  }

  const harnesses = readProjectHarnesses(projectRoot) ?? ['codex', 'claude', 'cursor'];
  for (const harness of harnesses) {
    const result = generateAdapters({
      systemRoot,
      targetRoot: join(projectRoot, `.${harness}`),
      harness,
      force: options.force ?? true,
    });
    if (result.collisions.length > 0) {
      errors.push(`Adapter collision for ${harness}: ${result.collisions.join(', ')}`);
    } else {
      projectAdapters[harness] = {
        commands: result.commands.length,
        skills: result.skills.length,
      };
    }
  }

  return { success: errors.length === 0, migration, projectAdapters, errors };
}

/** Run whichever halves the resolved scope calls for. */
export function runScopedUpdate(options: ScopedUpdateOptions = {}): ScopedUpdateResult {
  const scope = resolveUpdateScope(options);

  let globalResult: GlobalUpdateResult | undefined;
  let projectResult: ProjectUpdateResult | undefined;

  if (scope.global) {
    globalResult = updateGlobalSystem(options);
    // A failed global update makes the project half meaningless.
    if (!globalResult.success) {
      return { success: false, scope, globalResult };
    }
  }

  if (scope.project) {
    projectResult = updateProject(options);
  }

  const success = (globalResult?.success ?? true) && (projectResult?.success ?? true);
  return { success, scope, globalResult, projectResult };
}

/** Harness list from a project config, or undefined when absent/malformed. */
function readProjectHarnesses(projectRoot: string): string[] | undefined {
  const configPath = join(projectRoot, '.opencontract', 'config.yaml');
  if (!existsSync(configPath)) return undefined;

  const matched = /^harnesses:\s*\[(.*)\]\s*$/m.exec(readFileSync(configPath, 'utf-8'));
  if (!matched) return undefined;

  const names = matched[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return names.length > 0 ? names : undefined;
}
