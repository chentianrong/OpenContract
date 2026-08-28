import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { repairHintFor } from '../domain/errors.js';
import { parseMarkdown, type ParsedMarkdown } from '../markdown/parser.js';
import type { ValidationError } from '../domain/types.js';

/**
 * ActionRun directory parsing.
 *
 * An ActionRun is one directory named `{YYYYMMDDTHHmmss}-{short-description}`
 * whose managed Markdown files, at the top level only, are the Action's outputs.
 * Non-Markdown attachments are allowed and ignored; ordinary Markdown without
 * managed frontmatter is not, because it would be indistinguishable from an
 * output that failed to declare itself.
 */

const DIRECTORY_NAME = /^(\d{8}T\d{6})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export interface ActionRunLayout {
  readonly directory: string;
  readonly timestamp: string;
  readonly description: string;
  /** Managed Markdown outputs directly under the directory, sorted by path. */
  readonly outputs: ParsedMarkdown[];
  /** Non-Markdown files, which do not participate in Contract validation. */
  readonly attachments: string[];
  /** Nested subdirectories, which are not scanned for outputs. */
  readonly nestedDirectories: string[];
  readonly errors: ValidationError[];
}

function error(
  code: string,
  message: string,
  path: string,
  detail?: string,
): ValidationError {
  return {
    code,
    phase: 'action_contract',
    message,
    path,
    detail,
    repairHint: repairHintFor(code),
  };
}

/** Rejects a timestamp whose digits do not name a real instant. */
function isRealTimestamp(stamp: string): boolean {
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

export interface ParsedRunName {
  readonly timestamp: string;
  readonly description: string;
}

/**
 * Parse an ActionRun directory name. Returns the parts, or the specific reason
 * the name is not usable — a bad timestamp and a bad description are different
 * repairs, so they are different errors.
 */
export function parseActionRunName(
  directory: string,
): { parsed: ParsedRunName } | { error: ValidationError } {
  const name = basename(directory);
  const matched = DIRECTORY_NAME.exec(name);

  if (!matched) {
    // Distinguish the two common near-misses from a wholly malformed name.
    const looseSplit = /^([^-]+)-(.+)$/.exec(name);
    if (looseSplit && !/^\d{8}T\d{6}$/.test(looseSplit[1])) {
      return {
        error: error(
          'ACTION_RUN_TIMESTAMP_INVALID',
          'The ActionRun directory does not begin with a YYYYMMDDTHHmmss timestamp.',
          directory,
          looseSplit[1],
        ),
      };
    }
    if (looseSplit) {
      return {
        error: error(
          'ACTION_RUN_DESCRIPTION_INVALID',
          'The ActionRun short description is not lowercase kebab-case.',
          directory,
          looseSplit[2],
        ),
      };
    }
    return {
      error: error(
        'ACTION_RUN_NAME_INVALID',
        'The ActionRun directory name must be {YYYYMMDDTHHmmss}-{short-description}.',
        directory,
        name,
      ),
    };
  }

  const [, timestamp, description] = matched;
  if (!isRealTimestamp(timestamp)) {
    return {
      error: error(
        'ACTION_RUN_TIMESTAMP_INVALID',
        'The ActionRun timestamp does not name a real instant.',
        directory,
        timestamp,
      ),
    };
  }

  return { parsed: { timestamp, description } };
}

/**
 * Scan an ActionRun directory and classify every entry. Outputs are top-level
 * managed Markdown; anything else is an attachment or a layout defect.
 */
export function parseActionRunLayout(directory: string): ActionRunLayout {
  const errors: ValidationError[] = [];

  const nameResult = parseActionRunName(directory);
  if ('error' in nameResult) {
    return {
      directory,
      timestamp: '',
      description: '',
      outputs: [],
      attachments: [],
      nestedDirectories: [],
      errors: [nameResult.error],
    };
  }

  const { timestamp, description } = nameResult.parsed;
  const outputs: ParsedMarkdown[] = [];
  const attachments: string[] = [];
  const nestedDirectories: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      nestedDirectories.push(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue; // symlinks, sockets, etc. are ignored
    }

    if (!entry.name.endsWith('.md')) {
      attachments.push(fullPath);
      continue;
    }

    // Markdown file: must carry managed frontmatter or it is a layout defect.
    try {
      outputs.push(parseMarkdown(fullPath));
    } catch (cause) {
      errors.push(
        error(
          'ACTION_RUN_STRAY_MARKDOWN',
          'A Markdown file in the ActionRun directory has no managed frontmatter.',
          fullPath,
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
    }
  }

  // Deterministic order for stable output and comparable runs.
  outputs.sort((a, b) => a.path.localeCompare(b.path));
  attachments.sort();
  nestedDirectories.sort();

  return { directory, timestamp, description, outputs, attachments, nestedDirectories, errors };
}

