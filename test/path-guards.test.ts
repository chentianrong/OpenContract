import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { validateReferencePath } from '../src/workspace/discovery.js';
import { OpenContractError } from '../src/domain/errors.js';

/**
 * Path guards must behave the same for POSIX-style and Windows-style inputs.
 * `path.isAbsolute` is platform-dependent, so a Windows drive path is only
 * rejected as absolute on win32; on POSIX it must still be rejected because it
 * cannot resolve to a managed Markdown file inside the root.
 */
const WINDOWS_STYLE_ABSOLUTE = ['C:\\Windows\\System32\\drivers\\etc\\hosts', '\\\\server\\share\\file.md'];
const POSIX_STYLE_ABSOLUTE = ['/etc/passwd', '/tmp/outside.md'];
const TRAVERSAL_PATHS = [
  '../../outside.md',
  '..\\..\\outside.md',
  'nested/../../../outside.md',
  './../../outside.md',
];

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof OpenContractError) {
      return err.code;
    }
    throw err;
  }
  return 'NO_ERROR';
}

describe('Path guards across POSIX and Windows path fixtures', () => {
  let tempDir: string;
  let root: string;
  let baseDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-paths-'));
    root = join(tempDir, 'opencontract');
    baseDir = join(root, 'artifacts', '20260131T120000-task', '20260131T120500-run');
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(tempDir, 'outside.md'), '# outside the managed root');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects POSIX absolute references', () => {
    for (const candidate of POSIX_STYLE_ABSOLUTE) {
      expect(codeOf(() => validateReferencePath(baseDir, candidate, root))).toBe(
        'PATH_NOT_RELATIVE',
      );
    }
  });

  it('rejects Windows absolute and UNC references', () => {
    for (const candidate of WINDOWS_STYLE_ABSOLUTE) {
      const code = codeOf(() => validateReferencePath(baseDir, candidate, root, { mustExist: true }));
      // On Windows these are absolute paths; on POSIX they're literal filenames
      // that don't exist, so either PATH_NOT_RELATIVE or REFERENCE_NOT_FOUND.
      expect(['PATH_NOT_RELATIVE', 'REFERENCE_NOT_FOUND']).toContain(code);
    }
  });

  it('rejects traversal that leaves the managed root', () => {
    for (const candidate of TRAVERSAL_PATHS) {
      const code = codeOf(() => validateReferencePath(baseDir, candidate, root, { mustExist: true }));
      // Backslash separators are literal filename characters on POSIX, so that
      // fixture cannot escape and instead fails as an unknown reference.
      expect(['REFERENCE_UNSAFE', 'REFERENCE_NOT_FOUND']).toContain(code);
    }
  });

  it('accepts a sibling ActionRun reference inside the root', () => {
    const sibling = join(root, 'artifacts', '20260131T120000-task', '20260131T115900-explore');
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'note.md'), '# note');

    const resolved = validateReferencePath(
      baseDir,
      ['..', '20260131T115900-explore', 'note.md'].join('/'),
      root,
      { mustExist: true, mustBeFile: true },
    );
    expect(resolved).toBe(join(sibling, 'note.md'));
  });

  it('rejects a symlink that escapes the managed root', () => {
    const link = join(baseDir, 'escape.md');
    try {
      symlinkSync(join(tempDir, 'outside.md'), link, 'file');
    } catch {
      return; // platform without symlink permission
    }
    expect(codeOf(() => validateReferencePath(baseDir, 'escape.md', root))).toBe(
      'PATH_SYMLINK_ESCAPE',
    );
  });

  it('rejects a directory target when a file is required', () => {
    const dir = join(baseDir, 'attachments');
    mkdirSync(dir, { recursive: true });
    expect(
      codeOf(() => validateReferencePath(baseDir, 'attachments', root, { mustBeFile: true })),
    ).toBe('REFERENCE_IS_DIRECTORY');
  });

  it('normalizes slash-separated references on the host separator', () => {
    const nested = join(baseDir, 'nested');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'child.md'), '# child');

    const resolved = validateReferencePath(baseDir, 'nested/child.md', root, {
      mustExist: true,
      mustBeFile: true,
    });
    expect(resolved).toBe([baseDir, 'nested', 'child.md'].join(sep));
  });
});
