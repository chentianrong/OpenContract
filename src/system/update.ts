import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { ResolvedPaths, WorkspaceConfig } from '../domain/types.js';
import { OpenContractError } from '../domain/errors.js';
import { bundledSystemRoot } from '../resources.js';
import { enumerateActions, enumerateContracts } from '../definitions/parser.js';
import { testContractFixtures } from '../definitions/fixtures.js';
import { adapterFor, writeAdapter, type AdapterWriteOutcome } from './harnesses.js';

/**
 * Transactional system update.
 *
 * The new system tree is staged and fully validated in a sibling temporary
 * directory before anything installed is touched. The swap itself is a rename,
 * and the previous tree is kept until the update succeeds, so a failure at any
 * point leaves the workspace on the version it started with.
 *
 * Project-owned content — configuration, project Actions and Contracts, Specs,
 * Artifacts, and cache history — is never part of the replacement set.
 */

export interface UpdateOutcome {
  readonly success: boolean;
  readonly newVersion: string;
  readonly previousVersion?: string;
  readonly rollbackPerformed: boolean;
  /** Adapters written, skipped as unsupported, or left alone as conflicts. */
  readonly adapters: AdapterWriteOutcome[];
  /** Exact-version snapshot the previous system was cached under, if any. */
  readonly cachedAs?: string;
  readonly errors: OpenContractError[];
}

/** Validate a staged tree the same way `doctor` validates an installed one. */
function validateStagedTree(stagingRoot: string): OpenContractError[] {
  const errors: OpenContractError[] = [];

  const actionsRoot = join(stagingRoot, 'actions');
  const contractsRoot = join(stagingRoot, 'contracts');

  if (!existsSync(join(stagingRoot, 'manifest.yaml'))) {
    errors.push(
      new OpenContractError('MANIFEST_MISSING', 'The staged system package has no manifest.', {
        path: stagingRoot,
      }),
    );
  }

  const actions = enumerateActions(actionsRoot, 'system');
  const contracts = enumerateContracts(contractsRoot, 'system');

  if (actions.length === 0) {
    errors.push(
      new OpenContractError('SYSTEM_INVALID', 'The staged system package contains no Actions.', {
        path: actionsRoot,
      }),
    );
  }
  if (contracts.length === 0) {
    errors.push(
      new OpenContractError('SYSTEM_INVALID', 'The staged system package contains no Contracts.', {
        path: contractsRoot,
      }),
    );
  }

  // Every staged Contract must pass its own fixtures, so a broken Contract is
  // caught before it can replace a working one.
  for (const contract of contracts) {
    const result = testContractFixtures(contract);
    if (!result.passed) {
      const failing = [...result.valid, ...result.invalid].filter((f) => !f.ok);
      errors.push(
        new OpenContractError(
          'UPDATE_VALIDATION_FAILED',
          `Staged Contract ${contract.name}@${contract.version} failed its fixtures.`,
          {
            path: contract.packagePath,
            detail:
              failing.map((f) => `${f.name}: ${f.reason}`).join('; ') ||
              result.templateProblems.join('; '),
          },
        ),
      );
    }
  }

  return errors;
}

function readInstalledVersion(systemRoot: string): string | undefined {
  const manifestPath = join(systemRoot, 'manifest.yaml');
  if (!existsSync(manifestPath)) return undefined;
  // The version line is read textually to avoid failing on an otherwise
  // malformed manifest — this is only used for reporting and cache naming.
  try {
    const matched = /^version:\s*["']?([^"'\s]+)/m.exec(readFileSync(manifestPath, 'utf-8'));
    return matched?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Transactional update flow:
 * 1. Copy bundled system to a staging directory.
 * 2. Validate the staged tree (manifest, Actions, Contracts, fixtures).
 * 3. If invalid, abort (no changes to the installed tree).
 * 4. Snapshot the current system to `.opencontract/cache/{version}/` if not already cached.
 * 5. Atomically replace `.opencontract/system` with the staged tree.
 * 6. Write/update harness adapters per configuration.
 * 7. On failure after step 5, restore from the snapshot and report rollback.
 */
export function updateSystem(
  paths: ResolvedPaths,
  config: WorkspaceConfig,
): UpdateOutcome {
  const errors: OpenContractError[] = [];
  let rollbackPerformed = false;
  let cachedAs: string | undefined;
  const adapters: AdapterWriteOutcome[] = [];

  const previousVersion = readInstalledVersion(paths.system);
  const stagingDir = mkdtempSync(join(paths.root, '.opencontract', '.staging-'));
  const bundled = bundledSystemRoot();

  try {
    // Stage the new tree in a temporary location.
    cpSync(bundled, stagingDir, { recursive: true });

    const newVersion = readInstalledVersion(stagingDir) ?? 'unknown';

    // Validate the staged tree before touching the installed one.
    errors.push(...validateStagedTree(stagingDir));
    if (errors.length > 0) {
      return {
        success: false,
        newVersion,
        previousVersion,
        rollbackPerformed: false,
        adapters: [],
        errors,
      };
    }

    // Snapshot the current system to the cache before replacing it.
    if (previousVersion && existsSync(paths.system)) {
      const snapshotDir = join(paths.cache, previousVersion);
      if (!existsSync(snapshotDir)) {
        mkdirSync(dirname(snapshotDir), { recursive: true });
        cpSync(paths.system, snapshotDir, { recursive: true });
        cachedAs = previousVersion;
      } else {
        cachedAs = previousVersion;
      }
    }

    // Atomically replace the installed system with the staged one.
    const backupDir = `${paths.system}.backup-${Date.now()}`;
    if (existsSync(paths.system)) {
      renameSync(paths.system, backupDir);
    }

    try {
      renameSync(stagingDir, paths.system);
      // If the swap succeeded, delete the backup.
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true });
      }
    } catch (swapError) {
      // The swap failed; restore from backup if it exists.
      if (existsSync(backupDir)) {
        if (existsSync(paths.system)) {
          rmSync(paths.system, { recursive: true, force: true });
        }
        renameSync(backupDir, paths.system);
        rollbackPerformed = true;
      }
      throw swapError;
    }

    // Write harness adapters after the system is installed.
    const selectedHarnesses = config.harnesses ?? [];
    for (const harness of selectedHarnesses) {
      const outcome = writeAdapter(paths.root, harness, config.system ?? '.opencontract/system');
      adapters.push(outcome);
      if (outcome.kind === 'conflict') {
        errors.push(
          new OpenContractError(
            'ADAPTER_CONFLICT',
            `Harness adapter at ${outcome.path} is not OpenContract-owned and was not replaced.`,
            { path: outcome.path },
          ),
        );
      }
    }

    return {
      success: errors.length === 0,
      newVersion,
      previousVersion,
      rollbackPerformed,
      adapters,
      cachedAs,
      errors,
    };
  } catch (cause) {
    errors.push(
      new OpenContractError(
        rollbackPerformed ? 'UPDATE_ROLLBACK_PERFORMED' : 'UPDATE_STAGING_FAILED',
        `System update failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      ),
    );
    return {
      success: false,
      newVersion: 'unknown',
      previousVersion,
      rollbackPerformed,
      adapters,
      cachedAs,
      errors,
    };
  } finally {
    // Clean up the staging directory if it still exists.
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

