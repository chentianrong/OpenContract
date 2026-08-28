import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readDeclaredInputs,
  resolveInput,
  checkReferences,
  findManagedLinks,
  checkManagedLinks,
} from '../src/validation/references.js';

describe('Reference resolution', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function artifact(name: string, inputs: string[], body = ''): string {
    const path = join(tempDir, name);
    mkdirSync(join(tempDir, name, '..'), { recursive: true });
    writeFileSync(
      path,
      `---
contract: test
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: ${JSON.stringify(inputs)}
---
${body}`,
      'utf-8',
    );
    return path;
  }

  it('reads declared inputs from frontmatter', () => {
    expect(readDeclaredInputs({ inputs: ['a.md', 'b.md'] })).toEqual(['a.md', 'b.md']);
    expect(readDeclaredInputs({ inputs: [] })).toEqual([]);
    expect(readDeclaredInputs({})).toEqual([]);
    expect(readDeclaredInputs({ inputs: [1, 'valid.md', null] })).toEqual(['valid.md']);
  });

  it('resolves a valid relative input', () => {
    const target = artifact('target.md', []);
    const source = artifact('source.md', ['target.md']);

    const result = resolveInput(source, 'target.md', tempDir);
    expect(result.resolved?.declared).toBe('target.md');
    expect(result.resolved?.absolute).toBe(target);
    expect(result.resolved?.real).toBe(target);
    expect(result.error).toBeUndefined();
  });

  it('rejects absolute path inputs', () => {
    const source = artifact('source.md', []);
    const result = resolveInput(source, '/etc/passwd', tempDir);
    expect(result.error?.code).toBe('REFERENCE_UNSAFE');
    expect(result.resolved).toBeUndefined();
  });

  it('rejects Windows absolute paths', () => {
    const source = artifact('source.md', []);
    const result = resolveInput(source, 'C:\\Windows\\System32', tempDir);
    expect(result.error?.code).toBe('REFERENCE_UNSAFE');
  });

  it('rejects inputs that escape the managed root via ../', () => {
    const source = artifact('a/source.md', []);
    const result = resolveInput(source, '../../outside.md', tempDir);
    expect(result.error?.code).toBe('REFERENCE_UNSAFE');
    expect(result.error?.message).toContain('outside the managed');
  });

  it('rejects inputs that do not exist', () => {
    const source = artifact('source.md', []);
    const result = resolveInput(source, 'missing.md', tempDir);
    expect(result.error?.code).toBe('REFERENCE_NOT_FOUND');
  });

  it('rejects inputs that point at a directory', () => {
    mkdirSync(join(tempDir, 'dir'));
    const source = artifact('source.md', []);
    const result = resolveInput(source, 'dir', tempDir);
    expect(result.error?.code).toBe('REFERENCE_IS_DIRECTORY');
  });

  it('rejects symlinks that escape the managed root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'outside-'));
    const outsideFile = join(outside, 'secret.md');
    writeFileSync(outsideFile, '# secret', 'utf-8');
    symlinkSync(outsideFile, join(tempDir, 'link.md'));

    const source = artifact('source.md', []);
    const result = resolveInput(source, 'link.md', tempDir);
    expect(result.error?.code).toBe('REFERENCE_UNSAFE');
    expect(result.error?.message).toContain('symlink');

    rmSync(outside, { recursive: true, force: true });
  });

  it('checkReferences reports direct input that is not a managed Artifact', () => {
    writeFileSync(join(tempDir, 'plain.txt'), 'not an artifact', 'utf-8');
    const source = artifact('source.md', ['plain.txt']);

    const result = checkReferences(source, { managedRoot: tempDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('REFERENCE_NOT_MANAGED');
    expect(result.errors[0].message).toContain('plain.txt');
  });

  it('checkReferences reports direct input missing public metadata', () => {
    const incomplete = join(tempDir, 'incomplete.md');
    writeFileSync(
      incomplete,
      `---
contract: test
version: v1.0.0
---
Missing action fields.`,
      'utf-8',
    );
    const source = artifact('source.md', ['incomplete.md']);

    const result = checkReferences(source, { managedRoot: tempDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('REFERENCE_METADATA_INVALID');
    expect(result.errors[0].detail).toContain('action');
  });

  it('checkReferences (recursive) detects a simple cycle', () => {
    const a = artifact('a.md', ['b.md']);
    const b = artifact('b.md', ['a.md']);

    const result = checkReferences(a, { managedRoot: tempDir, recursive: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('REFERENCE_CYCLE');
    expect(result.errors[0].detail).toContain('1. ');
    expect(result.errors[0].detail).toContain('2. ');
  });

  it('checkReferences (recursive) detects a longer cycle', () => {
    const a = artifact('a.md', ['b.md']);
    const b = artifact('b.md', ['c.md']);
    const c = artifact('c.md', ['d.md']);
    const d = artifact('d.md', ['b.md']);

    const result = checkReferences(a, { managedRoot: tempDir, recursive: true });
    const cycleError = result.errors.find((e) => e.code === 'REFERENCE_CYCLE');
    expect(cycleError).toBeDefined();
    expect(cycleError?.detail).toContain('b.md');
    expect(cycleError?.detail).toContain('d.md');
  });

  it('checkReferences (recursive) visits transitive inputs in depth-first order', () => {
    const d = artifact('d.md', []);
    const c = artifact('c.md', ['d.md']);
    const b = artifact('b.md', ['c.md']);
    const a = artifact('a.md', ['b.md']);

    const result = checkReferences(a, { managedRoot: tempDir, recursive: true });
    expect(result.errors).toHaveLength(0);
    expect(result.visited).toEqual([a, b, c, d]);
  });

  it('checkReferences (recursive) deduplicates by realpath', () => {
    const shared = artifact('shared.md', []);
    const left = artifact('left.md', ['shared.md']);
    const right = artifact('right.md', ['shared.md']);
    const top = artifact('top.md', ['left.md', 'right.md']);

    const result = checkReferences(top, { managedRoot: tempDir, recursive: true });
    // shared should appear exactly once, even though both left and right reference it.
    const sharedCount = result.visited.filter((p) => p === shared).length;
    expect(sharedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Managed Markdown links', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function artifact(name: string, body: string): string {
    const path = join(tempDir, name);
    mkdirSync(join(tempDir, name, '..'), { recursive: true });
    writeFileSync(
      path,
      `---
contract: test
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---
${body}`,
      'utf-8',
    );
    return path;
  }

  it('finds relative .md links', () => {
    const target = artifact('target.md', '');
    const source = artifact('source.md', 'See [target](target.md) for details.');

    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('target.md');
    expect(links[0].absolute).toBe(target);
  });

  it('ignores external URLs', () => {
    const source = artifact('source.md', 'See [docs](https://example.com/guide.md).');
    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(0);
  });

  it('ignores in-page anchors', () => {
    const source = artifact('source.md', 'Jump to [section](#section).');
    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(0);
  });

  it('ignores non-Markdown targets', () => {
    const source = artifact('source.md', 'See [image](./diagram.png).');
    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(0);
  });

  it('strips anchors from .md links', () => {
    const target = artifact('target.md', '');
    const source = artifact('source.md', 'See [section](target.md#section).');

    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('target.md#section');
    expect(links[0].absolute).toBe(target);
  });

  it('ignores links that escape the managed root', () => {
    const source = artifact('a/source.md', 'See [outside](../../outside.md).');
    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(0);
  });

  it('checkManagedLinks reports broken links', () => {
    const source = artifact('source.md', 'See [missing](missing.md).');
    const errors = checkManagedLinks(source, tempDir);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('MARKDOWN_LINK_BROKEN');
    expect(errors[0].detail).toContain('missing.md');
  });

  it('checkManagedLinks passes when all links exist', () => {
    const target = artifact('target.md', '');
    const source = artifact('source.md', 'See [target](target.md).');
    const errors = checkManagedLinks(source, tempDir);
    expect(errors).toHaveLength(0);
  });

  it('records 1-based line numbers', () => {
    const source = artifact(
      'source.md',
      `First line.
Second line.
Third line with [link](target.md).`,
    );
    const links = findManagedLinks(source, tempDir);
    expect(links).toHaveLength(1);
    // Frontmatter is ~7 lines; body starts at ~8; "Third line" is the 3rd body line.
    expect(links[0].line).toBeGreaterThanOrEqual(10);
  });
});
