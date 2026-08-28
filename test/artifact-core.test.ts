import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarkdown } from '../src/markdown/parser.js';
import { validateArtifactCore } from '../src/validation/artifact-core.js';

describe('artifact-core metadata validation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-core-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function validate(frontmatter: string, options?: { managedRoots?: string[] }) {
    const path = join(tempDir, 'artifact.md');
    writeFileSync(path, `---\n${frontmatter}---\n\n## Body\n\nProse.\n`, 'utf-8');
    return validateArtifactCore(parseMarkdown(path), options ?? {});
  }

  function codes(frontmatter: string, options?: { managedRoots?: string[] }): string[] {
    return validate(frontmatter, options).map((e) => e.code);
  }

  const VALID = `contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
`;

  it('accepts complete valid core metadata', () => {
    expect(validate(VALID)).toEqual([]);
  });

  it('accepts a valid unique inputs array', () => {
    expect(
      validate(`contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-01-31T12:00:00+01:00"
inputs:
  - ../20260131T115900-explore/note.md
  - ../20260131T115900-explore/other.md
`),
    ).toEqual([]);
  });

  it('reports each missing required field', () => {
    const found = codes('contract: note\n');
    expect(found).toContain('CORE_FIELD_MISSING');
    // version, action, action_version, created_at, inputs are all absent.
    expect(found.filter((c) => c === 'CORE_FIELD_MISSING')).toHaveLength(5);
  });

  it('rejects non-exact versions', () => {
    for (const version of ['1.0.0', 'v1.0', 'latest', '^1.0.0', 'v1.0.0-beta']) {
      const found = codes(VALID.replace('version: v1.0.0', `version: ${version}`));
      expect(found).toContain('CORE_VERSION_INVALID');
    }
  });

  it('rejects non-kebab-case names', () => {
    for (const name of ['Note', 'my_note', 'my--note', '-note', 'note-']) {
      expect(codes(VALID.replace('contract: note', `contract: ${name}`))).toContain(
        'CORE_NAME_INVALID',
      );
    }
  });

  it('rejects timestamps without a timezone', () => {
    for (const stamp of ['2026-01-31T12:00:00', '2026-01-31 12:00:00Z', '2026-01-31']) {
      expect(codes(VALID.replace(/created_at: .*/, `created_at: "${stamp}"`))).toContain(
        'CORE_TIMESTAMP_INVALID',
      );
    }
  });

  it('rejects timestamps that name no real date', () => {
    for (const stamp of ['2026-02-30T12:00:00Z', '2026-13-01T12:00:00Z', '2026-01-31T25:00:00Z']) {
      expect(codes(VALID.replace(/created_at: .*/, `created_at: "${stamp}"`))).toContain(
        'CORE_TIMESTAMP_INVALID',
      );
    }
  });

  it('accepts fractional seconds and offset timezones', () => {
    for (const stamp of [
      '2026-01-31T12:00:00.123Z',
      '2026-01-31T12:00:00+05:30',
      '2026-01-31T12:00:00-08:00',
      '2024-02-29T12:00:00Z', // 2024 is a leap year
    ]) {
      expect(validate(VALID.replace(/created_at: .*/, `created_at: "${stamp}"`))).toEqual([]);
    }
  });

  it('rejects duplicate inputs', () => {
    const found = codes(`contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs:
  - ../run/note.md
  - ../run/note.md
`);
    expect(found).toContain('CORE_INPUTS_DUPLICATE');
  });

  it('rejects absolute and backslash inputs', () => {
    const absolute = codes(`contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs:
  - /etc/passwd
`);
    expect(absolute).toContain('CORE_INPUTS_INVALID');

    const backslash = codes(`contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs:
  - ..\\\\run\\\\note.md
`);
    expect(backslash).toContain('CORE_INPUTS_INVALID');
  });

  it('rejects a non-array inputs field', () => {
    expect(codes(VALID.replace('inputs: []', 'inputs: not-a-list'))).toContain('CORE_FIELD_INVALID');
  });

  it('enforces the managed-root boundary when roots are supplied', () => {
    const managed = join(tempDir, 'managed');
    mkdirSync(managed, { recursive: true });

    // The Artifact is written at tempDir root, outside `managed`.
    expect(codes(VALID, { managedRoots: [managed] })).toContain('ARTIFACT_OUTSIDE_MANAGED_ROOT');
    // With the containing directory as a root, it passes.
    expect(validate(VALID, { managedRoots: [tempDir] })).toEqual([]);
  });

  it('skips the boundary check when no roots are supplied', () => {
    expect(validate(VALID, {})).toEqual([]);
  });

  it('reports every violation rather than stopping at the first', () => {
    const found = codes(`contract: Bad_Name
version: 1.0.0
action: explore
action_version: v1.0.0
created_at: "not-a-timestamp"
inputs:
  - /absolute.md
  - /absolute.md
`);
    expect(found).toContain('CORE_NAME_INVALID');
    expect(found).toContain('CORE_VERSION_INVALID');
    expect(found).toContain('CORE_TIMESTAMP_INVALID');
    expect(found).toContain('CORE_INPUTS_INVALID');
  });

  it('anchors every error to the artifact-core phase with a repair hint', () => {
    for (const err of validate('contract: note\n')) {
      expect(err.phase).toBe('artifact_core');
      expect(err.repairHint.length).toBeGreaterThan(0);
      expect(err.path).toContain('artifact.md');
    }
  });
});
