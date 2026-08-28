import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type { ValidationError } from '../domain/types.js';
import { repairHintFor } from '../domain/errors.js';

/**
 * Managed path structure.
 *
 * A persisted Artifact lives at `{artifacts}/{task}/{action-run}/{artifact}.md`:
 * two timestamped directory levels, then the file. Archived history lives under
 * the archive root and is immutable.
 *
 * These helpers are the single place that decides what a managed path means, so
 * validation, ActionRun checks, and archive repair cannot disagree about it.
 */

const TIMESTAMPED_DIR = /^(\d{8}T\d{6})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function error(code: string, message: string, path: string, detail?: string): ValidationError {
  return { code, phase: 'artifact_core', message, path, detail, repairHint: repairHintFor(code) };
}

function isUnder(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/** True when a directory name is `{YYYYMMDDTHHmmss}-{short-description}`. */
export function isTimestampedName(name: string): boolean {
  const matched = TIMESTAMPED_DIR.exec(name);
  if (!matched) return false;

  const stamp = matched[1];
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  const hour = Number(stamp.slice(9, 11));
  const minute = Number(stamp.slice(11, 13));
  const second = Number(stamp.slice(13, 15));

  if (month < 1 || month > 12 || day < 1) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export interface ManagedArtifactPath {
  /** Task directory name, e.g. `20260131T120000-add-auth`. */
  readonly task: string;
  /** ActionRun directory name, e.g. `20260131T120500-plan`. */
  readonly actionRun: string;
  /** Artifact file name, e.g. `tasks.md`. */
  readonly artifact: string;
  /** True when the path is under the archive root. */
  readonly archived: boolean;
}

export interface ManagedRoots {
  readonly artifacts: string;
  readonly archive: string;
  /** Canonical Specs root, when the caller tracks references into it. */
  readonly specs?: string;
}

/**
 * Parse a managed Artifact path into its task, ActionRun, and file parts.
 *
 * Returns the specific structural violation when the layout is wrong: an
 * Artifact sitting at the artifacts root is a different repair from one whose
 * directory names are malformed.
 */
export function parseManagedArtifactPath(
  artifactPath: string,
  roots: ManagedRoots,
): { parsed: ManagedArtifactPath } | { error: ValidationError } {
  const absolute = resolve(artifactPath);
  const archived = isUnder(roots.archive, absolute);
  // Archived paths keep the same shape, just under a different root.
  const base = archived ? roots.archive : roots.artifacts;

  if (!isUnder(base, absolute)) {
    return {
      error: error(
        'ARTIFACT_OUTSIDE_MANAGED_ROOT',
        'The Artifact is not inside a managed OpenContract root.',
        artifactPath,
        `expected under ${roots.artifacts} or ${roots.archive}`,
      ),
    };
  }

  const segments = relative(base, absolute).split(sep).filter(Boolean);

  if (segments.length === 1) {
    return {
      error: error(
        'ARTIFACT_AT_ROOT',
        'A managed Artifact must not sit directly at the artifacts root.',
        artifactPath,
        'expected {task}/{action-run}/{artifact}.md',
      ),
    };
  }

  if (segments.length !== 3) {
    return {
      error: error(
        'ARTIFACT_PATH_INVALID',
        'A managed Artifact needs exactly two timestamped directory levels.',
        artifactPath,
        `found ${segments.length} path segment(s): ${segments.join('/')}`,
      ),
    };
  }

  const [task, actionRun, artifact] = segments;

  if (!isTimestampedName(task)) {
    return {
      error: error(
        'TASK_DIR_NAME_INVALID',
        `Task directory "${task}" is not {YYYYMMDDTHHmmss}-{short-description}.`,
        artifactPath,
      ),
    };
  }

  if (!isTimestampedName(actionRun)) {
    return {
      error: error(
        'ACTION_RUN_NAME_INVALID',
        `ActionRun directory "${actionRun}" is not {YYYYMMDDTHHmmss}-{short-description}.`,
        artifactPath,
      ),
    };
  }

  return { parsed: { task, actionRun, artifact, archived } };
}

/** Validate a managed Artifact's placement, returning every violation found. */
export function checkManagedPlacement(
  artifactPath: string,
  roots: ManagedRoots,
): ValidationError[] {
  const result = parseManagedArtifactPath(artifactPath, roots);
  return 'error' in result ? [result.error] : [];
}

/**
 * Absolute path of the task directory containing an Artifact, or undefined when
 * the Artifact is not in a well-formed managed location.
 */
export function taskRootFor(artifactPath: string, roots: ManagedRoots): string | undefined {
  const result = parseManagedArtifactPath(artifactPath, roots);
  if ('error' in result) return undefined;
  // {base}/{task}/{run}/{file} — the task directory is two levels up.
  return dirname(dirname(resolve(artifactPath)));
}

/** True when the path lies under the archive root, whose history is immutable. */
export function isArchived(path: string, roots: ManagedRoots): boolean {
  return isUnder(roots.archive, resolve(path));
}

/**
 * Reject a write that would modify archived history. The archive records what
 * happened; new work belongs in a new task directory.
 */
export function checkArchiveImmutability(
  targetPath: string,
  roots: ManagedRoots,
): ValidationError[] {
  if (!isArchived(targetPath, roots)) return [];
  if (!existsSync(targetPath)) return []; // creating new archive content is the archive Action's job

  return [
    error(
      'ARCHIVE_PATH_MUTABLE',
      'Archived history is immutable and must not be modified in place.',
      targetPath,
      basename(targetPath),
    ),
  ];
}

export interface TaskLayout {
  readonly directory: string;
  readonly task: string;
  readonly actionRuns: string[];
}

/**
 * List the ActionRun directories of a task, in name order. Entries that are not
 * timestamped directories are excluded rather than reported: a task directory
 * may legitimately hold other material.
 */
export function readTaskLayout(taskDirectory: string): TaskLayout | undefined {
  const absolute = resolve(taskDirectory);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return undefined;

  const task = basename(absolute);
  if (!isTimestampedName(task)) return undefined;

  const actionRuns = readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isTimestampedName(entry.name))
    .map((entry) => entry.name)
    .sort();

  return { directory: absolute, task, actionRuns };
}
