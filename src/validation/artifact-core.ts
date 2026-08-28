import { isAbsolute, resolve, sep } from 'node:path';
import type { ParsedMarkdown } from '../markdown/parser.js';
import type { ValidationError } from '../domain/types.js';
import { repairHintFor } from '../domain/errors.js';

/**
 * `artifact-core@v1.0.0` metadata validation. This phase checks only the shared
 * fields every managed Artifact carries, independent of its Contract: presence,
 * naming, exact versions, timestamp form, and input safety.
 */

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXACT_VERSION = /^v\d+\.\d+\.\d+$/;

/**
 * RFC 3339 with a mandatory timezone offset. `Z` or `±HH:MM` are both accepted;
 * a bare local timestamp is not, since managed history has to be comparable
 * across machines.
 */
const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

const REQUIRED_STRING_FIELDS = ['contract', 'version', 'action', 'action_version'] as const;

export interface ArtifactCoreOptions {
  /**
   * Absolute managed roots the Artifact must live under. Omit to skip the
   * boundary check — Contract fixtures live inside their package, not under a
   * workspace artifacts root.
   */
  readonly managedRoots?: string[];
}

function error(
  code: string,
  message: string,
  path: string,
  detail?: string,
  line?: number,
): ValidationError {
  return {
    code,
    phase: 'artifact_core',
    message,
    path,
    line,
    detail,
    repairHint: repairHintFor(code),
  };
}

function isUnder(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/** Rejects timestamps that parse syntactically but name no real calendar day. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateTimestamp(
  value: unknown,
  path: string,
  line?: number,
): ValidationError[] {
  if (typeof value !== 'string') {
    return [
      error(
        'CORE_TIMESTAMP_INVALID',
        '`created_at` must be a quoted RFC 3339 string.',
        path,
        `got ${typeof value}`,
        line,
      ),
    ];
  }

  const matched = RFC_3339.exec(value);
  if (!matched) {
    return [
      error(
        'CORE_TIMESTAMP_INVALID',
        '`created_at` must be a timezone-aware RFC 3339 timestamp.',
        path,
        value,
        line,
      ),
    ];
  }

  const [, year, month, day, hour, minute, second] = matched;
  if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
    return [
      error('CORE_TIMESTAMP_INVALID', '`created_at` names no real calendar date.', path, value, line),
    ];
  }
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 60) {
    return [
      error('CORE_TIMESTAMP_INVALID', '`created_at` has an out-of-range time.', path, value, line),
    ];
  }

  return [];
}

function validateInputs(value: unknown, path: string, line?: number): ValidationError[] {
  if (value === undefined) {
    return [error('CORE_FIELD_MISSING', 'Missing required field `inputs`.', path, 'inputs', line)];
  }
  if (!Array.isArray(value)) {
    return [
      error('CORE_FIELD_INVALID', '`inputs` must be an array.', path, `got ${typeof value}`, line),
    ];
  }

  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of value.entries()) {
    const label = `inputs[${index}]`;
    if (typeof entry !== 'string') {
      errors.push(
        error('CORE_INPUTS_INVALID', `${label} must be a string path.`, path, `got ${typeof entry}`, line),
      );
      continue;
    }
    if (entry.length === 0) {
      errors.push(error('CORE_INPUTS_INVALID', `${label} is empty.`, path, undefined, line));
      continue;
    }
    if (isAbsolute(entry) || /^[A-Za-z]:[\\/]/.test(entry)) {
      errors.push(
        error('CORE_INPUTS_INVALID', `${label} must be a relative path.`, path, entry, line),
      );
      continue;
    }
    if (entry.includes('\\')) {
      // Inputs are slash-separated so the same Artifact validates identically
      // on POSIX and Windows.
      errors.push(
        error(
          'CORE_INPUTS_INVALID',
          `${label} must use forward slashes, not backslashes.`,
          path,
          entry,
          line,
        ),
      );
      continue;
    }
    if (seen.has(entry)) {
      errors.push(error('CORE_INPUTS_DUPLICATE', `${label} duplicates an earlier input.`, path, entry, line));
      continue;
    }
    seen.add(entry);
  }

  return errors;
}

/**
 * Validate the artifact-core metadata of a parsed Markdown Artifact. Returns
 * every violation found rather than stopping at the first, so an agent can
 * repair the whole frontmatter in one pass.
 */
export function validateArtifactCore(
  parsed: ParsedMarkdown,
  options: ArtifactCoreOptions = {},
): ValidationError[] {
  const { path, frontmatter } = parsed;
  const errors: ValidationError[] = [];
  // Frontmatter spans lines 2..frontmatterEndLine-1; point at its first line.
  const line = 2;

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = frontmatter[field];
    if (value === undefined) {
      errors.push(error('CORE_FIELD_MISSING', `Missing required field \`${field}\`.`, path, field, line));
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(
        error('CORE_FIELD_INVALID', `\`${field}\` must be a string.`, path, `got ${typeof value}`, line),
      );
      continue;
    }

    const isVersionField = field === 'version' || field === 'action_version';
    if (isVersionField && !EXACT_VERSION.test(value)) {
      errors.push(
        error('CORE_VERSION_INVALID', `\`${field}\` must be an exact vX.Y.Z version.`, path, value, line),
      );
    }
    if (!isVersionField && !KEBAB_CASE.test(value)) {
      errors.push(
        error('CORE_NAME_INVALID', `\`${field}\` must be lowercase kebab-case.`, path, value, line),
      );
    }
  }

  if (frontmatter.created_at === undefined) {
    errors.push(error('CORE_FIELD_MISSING', 'Missing required field `created_at`.', path, 'created_at', line));
  } else {
    errors.push(...validateTimestamp(frontmatter.created_at, path, line));
  }

  errors.push(...validateInputs(frontmatter.inputs, path, line));

  if (options.managedRoots && options.managedRoots.length > 0) {
    const inside = options.managedRoots.some((root) => isUnder(root, path));
    if (!inside) {
      errors.push(
        error(
          'ARTIFACT_OUTSIDE_MANAGED_ROOT',
          'The Artifact is not inside a managed OpenContract root.',
          path,
          options.managedRoots.join(', '),
        ),
      );
    }
  }

  return errors;
}
