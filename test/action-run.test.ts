import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseActionRunName, parseActionRunLayout } from '../src/actions/action-run.js';

/**
 * ActionRun parsing tests: directory-name parsing, managed-Markdown enumeration,
 * and attachment handling.
 */

describe('ActionRun directory name parsing', () => {
  it('accepts a valid name with a real timestamp', () => {
    const result = parseActionRunName('/workspace/20260131T120530-explore');
    expect('parsed' in result).toBe(true);
    if ('parsed' in result) {
      expect(result.parsed.timestamp).toBe('20260131T120530');
      expect(result.parsed.description).toBe('explore');
    }
  });

  it('rejects a timestamp with invalid month', () => {
    const result = parseActionRunName('/workspace/20261399T120000-explore');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_TIMESTAMP_INVALID');
    }
  });

  it('rejects a timestamp with impossible day', () => {
    const result = parseActionRunName('/workspace/20260231T120000-explore');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_TIMESTAMP_INVALID');
    }
  });

  it('rejects a timestamp with invalid hour', () => {
    const result = parseActionRunName('/workspace/20260131T250000-explore');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_TIMESTAMP_INVALID');
    }
  });

  it('rejects an uppercase description', () => {
    const result = parseActionRunName('/workspace/20260131T120530-Explore');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_DESCRIPTION_INVALID');
    }
  });

  it('rejects an underscore in the description', () => {
    const result = parseActionRunName('/workspace/20260131T120530-explore_more');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_DESCRIPTION_INVALID');
    }
  });

  it('rejects a missing hyphen separator', () => {
    const result = parseActionRunName('/workspace/20260131T120530explore');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_NAME_INVALID');
    }
  });

  it('accepts multi-segment kebab-case descriptions', () => {
    const result = parseActionRunName('/workspace/20260131T120530-explore-auth-flow');
    expect('parsed' in result).toBe(true);
    if ('parsed' in result) {
      expect(result.parsed.description).toBe('explore-auth-flow');
    }
  });
});

describe('ActionRun layout parsing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-action-run-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function runDir(name: string): string {
    const path = join(tempDir, name);
    mkdirSync(path, { recursive: true });
    return path;
  }

  function artifact(runPath: string, name: string, contract = 'note'): string {
    const path = join(runPath, name);
    writeFileSync(
      path,
      `---
contract: ${contract}
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );
    return path;
  }

  it('enumerates managed Markdown outputs at the top level', () => {
    const run = runDir('20260131T120530-explore');
    artifact(run, 'note-1.md');
    artifact(run, 'note-2.md');

    const layout = parseActionRunLayout(run);
    expect(layout.timestamp).toBe('20260131T120530');
    expect(layout.description).toBe('explore');
    expect(layout.outputs).toHaveLength(2);
    expect(layout.errors).toHaveLength(0);
  });

  it('reports stray Markdown without frontmatter as an error', () => {
    const run = runDir('20260131T120530-explore');
    writeFileSync(join(run, 'README.md'), '# Notes\n\nText.\n', 'utf-8');

    const layout = parseActionRunLayout(run);
    expect(layout.outputs).toHaveLength(0);
    expect(layout.errors).toHaveLength(1);
    expect(layout.errors[0].code).toBe('ACTION_RUN_STRAY_MARKDOWN');
    expect(layout.errors[0].path).toContain('README.md');
  });

  it('treats non-Markdown files as attachments', () => {
    const run = runDir('20260131T120530-explore');
    artifact(run, 'note.md');
    writeFileSync(join(run, 'diagram.png'), 'fake-png-data', 'utf-8');
    writeFileSync(join(run, 'data.json'), '{}', 'utf-8');

    const layout = parseActionRunLayout(run);
    expect(layout.outputs).toHaveLength(1);
    expect(layout.attachments).toHaveLength(2);
    expect(layout.attachments.some((p) => p.endsWith('diagram.png'))).toBe(true);
    expect(layout.attachments.some((p) => p.endsWith('data.json'))).toBe(true);
  });

  it('records nested directories without scanning them', () => {
    const run = runDir('20260131T120530-explore');
    artifact(run, 'note.md');
    const nested = join(run, 'nested');
    mkdirSync(nested);
    artifact(nested, 'ignored.md');

    const layout = parseActionRunLayout(run);
    expect(layout.outputs).toHaveLength(1);
    expect(layout.nestedDirectories).toHaveLength(1);
    expect(layout.nestedDirectories[0]).toBe(nested);
  });

  it('sorts outputs, attachments, and nested directories deterministically', () => {
    const run = runDir('20260131T120530-explore');
    artifact(run, 'z.md');
    artifact(run, 'a.md');
    artifact(run, 'm.md');
    writeFileSync(join(run, 'zebra.txt'), '', 'utf-8');
    writeFileSync(join(run, 'alpha.txt'), '', 'utf-8');
    mkdirSync(join(run, 'nested-z'));
    mkdirSync(join(run, 'nested-a'));

    const layout = parseActionRunLayout(run);
    expect(layout.outputs.map((o) => o.path)).toEqual([
      join(run, 'a.md'),
      join(run, 'm.md'),
      join(run, 'z.md'),
    ]);
    expect(layout.attachments).toEqual([join(run, 'alpha.txt'), join(run, 'zebra.txt')]);
    expect(layout.nestedDirectories).toEqual([join(run, 'nested-a'), join(run, 'nested-z')]);
  });

  it('returns only name errors when the directory name is invalid', () => {
    const run = runDir('not-a-valid-run-name');
    artifact(run, 'note.md');

    const layout = parseActionRunLayout(run);
    expect(layout.errors).toHaveLength(1);
    // "not" splits off as the leading segment and is not a timestamp, so the
    // more specific timestamp error is the actionable one.
    expect(layout.errors[0].code).toBe('ACTION_RUN_TIMESTAMP_INVALID');
    expect(layout.timestamp).toBe('');
    expect(layout.description).toBe('');
    // Invalid-name directory is not scanned further.
    expect(layout.outputs).toHaveLength(0);
  });

  it('ignores symlinks and non-file entries', () => {
    const run = runDir('20260131T120530-explore');
    artifact(run, 'note.md');
    // Skip symlink creation on platforms without permission; the important
    // part is that the parser does not crash.
    try {
      const target = join(tempDir, 'target.md');
      writeFileSync(target, '# Target', 'utf-8');
      symlinkSync(target, join(run, 'link.md'), 'file');
    } catch {
      // symlink not supported or not permitted
    }

    const layout = parseActionRunLayout(run);
    // Symlinks are ignored, not treated as outputs.
    expect(layout.outputs).toHaveLength(1);
    expect(layout.outputs[0].path).toContain('note.md');
  });
});
