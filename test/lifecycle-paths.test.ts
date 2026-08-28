import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isTimestampedName,
  parseManagedArtifactPath,
  checkManagedPlacement,
  taskRootFor,
  isArchived,
  checkArchiveImmutability,
  readTaskLayout,
} from '../src/lifecycle/paths.js';

describe('Timestamped directory names', () => {
  it('accepts a well-formed name', () => {
    expect(isTimestampedName('20260131T120000-add-auth')).toBe(true);
    expect(isTimestampedName('20260131T235959-a')).toBe(true);
  });

  it('rejects a name without a timestamp', () => {
    expect(isTimestampedName('add-auth')).toBe(false);
  });

  it('rejects a non-kebab-case description', () => {
    expect(isTimestampedName('20260131T120000-Add_Auth')).toBe(false);
    expect(isTimestampedName('20260131T120000-add--auth')).toBe(false);
    expect(isTimestampedName('20260131T120000--auth')).toBe(false);
  });

  it('rejects an impossible calendar date or time', () => {
    expect(isTimestampedName('20260230T120000-task')).toBe(false); // Feb 30
    expect(isTimestampedName('20261301T120000-task')).toBe(false); // month 13
    expect(isTimestampedName('20260131T250000-task')).toBe(false); // hour 25
    expect(isTimestampedName('20260131T126000-task')).toBe(false); // minute 60
  });

  it('accepts a leap day in a leap year', () => {
    expect(isTimestampedName('20240229T120000-task')).toBe(true);
    expect(isTimestampedName('20260229T120000-task')).toBe(false);
  });
});

describe('Managed Artifact paths', () => {
  let root: string;
  let roots: { artifacts: string; archive: string };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opencontract-paths-'));
    roots = {
      artifacts: join(root, 'opencontract', 'artifacts'),
      archive: join(root, 'opencontract', 'artifacts', 'archive'),
    };
    mkdirSync(roots.archive, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const TASK = '20260131T120000-add-auth';
  const RUN = '20260131T120500-plan';

  it('parses a well-formed managed path', () => {
    const path = join(roots.artifacts, TASK, RUN, 'tasks.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('parsed' in result).toBe(true);
    if ('parsed' in result) {
      expect(result.parsed).toEqual({
        task: TASK,
        actionRun: RUN,
        artifact: 'tasks.md',
        archived: false,
      });
    }
    expect(checkManagedPlacement(path, roots)).toEqual([]);
  });

  it('parses an archived path and marks it archived', () => {
    const path = join(roots.archive, TASK, RUN, 'tasks.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('parsed' in result).toBe(true);
    if ('parsed' in result) {
      expect(result.parsed.archived).toBe(true);
      expect(result.parsed.task).toBe(TASK);
    }
  });

  it('rejects an Artifact sitting directly at the artifacts root', () => {
    const path = join(roots.artifacts, 'stray.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ARTIFACT_AT_ROOT');
    }
  });

  it('rejects a path with the wrong number of directory levels', () => {
    const tooShallow = join(roots.artifacts, TASK, 'tasks.md');
    const tooDeep = join(roots.artifacts, TASK, RUN, 'nested', 'tasks.md');

    for (const path of [tooShallow, tooDeep]) {
      const result = parseManagedArtifactPath(path, roots);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.code).toBe('ARTIFACT_PATH_INVALID');
      }
    }
  });

  it('reports a malformed task directory name', () => {
    const path = join(roots.artifacts, 'not-timestamped', RUN, 'tasks.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('TASK_DIR_NAME_INVALID');
    }
  });

  it('reports a malformed ActionRun directory name', () => {
    const path = join(roots.artifacts, TASK, 'not-timestamped', 'tasks.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ACTION_RUN_NAME_INVALID');
    }
  });

  it('rejects a path outside every managed root', () => {
    const path = join(root, 'elsewhere', 'note.md');
    const result = parseManagedArtifactPath(path, roots);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.code).toBe('ARTIFACT_OUTSIDE_MANAGED_ROOT');
    }
  });

  it('resolves the task root of a managed Artifact', () => {
    const path = join(roots.artifacts, TASK, RUN, 'tasks.md');
    expect(taskRootFor(path, roots)).toBe(join(roots.artifacts, TASK));
    // A malformed path has no task root.
    expect(taskRootFor(join(roots.artifacts, 'stray.md'), roots)).toBeUndefined();
  });
});

describe('Archive immutability', () => {
  let root: string;
  let roots: { artifacts: string; archive: string };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opencontract-archive-'));
    roots = {
      artifacts: join(root, 'opencontract', 'artifacts'),
      archive: join(root, 'opencontract', 'artifacts', 'archive'),
    };
    mkdirSync(roots.archive, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('identifies archived paths', () => {
    expect(isArchived(join(roots.archive, 'task', 'run', 'a.md'), roots)).toBe(true);
    expect(isArchived(join(roots.artifacts, 'task', 'run', 'a.md'), roots)).toBe(false);
  });

  it('rejects modifying an existing archived file', () => {
    const target = join(roots.archive, '20260131T120000-task');
    mkdirSync(target, { recursive: true });
    const file = join(target, 'report.md');
    writeFileSync(file, '# archived\n', 'utf-8');

    const errors = checkArchiveImmutability(file, roots);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('ARCHIVE_PATH_MUTABLE');
  });

  it('permits writing a new path into the archive', () => {
    const notYetThere = join(roots.archive, '20260131T120000-task', 'report.md');
    expect(checkArchiveImmutability(notYetThere, roots)).toEqual([]);
  });

  it('permits writing anywhere outside the archive', () => {
    const live = join(roots.artifacts, '20260131T120000-task', 'report.md');
    mkdirSync(join(live, '..'), { recursive: true });
    writeFileSync(live, '# live\n', 'utf-8');

    expect(checkArchiveImmutability(live, roots)).toEqual([]);
  });
});

describe('Task layout', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opencontract-task-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists ActionRun directories in name order', () => {
    const task = join(root, '20260131T120000-add-auth');
    mkdirSync(join(task, '20260131T121000-plan'), { recursive: true });
    mkdirSync(join(task, '20260131T120500-explore'), { recursive: true });
    mkdirSync(join(task, '20260131T122000-execute'), { recursive: true });

    const layout = readTaskLayout(task);
    expect(layout?.task).toBe('20260131T120000-add-auth');
    expect(layout?.actionRuns).toEqual([
      '20260131T120500-explore',
      '20260131T121000-plan',
      '20260131T122000-execute',
    ]);
  });

  it('excludes entries that are not timestamped directories', () => {
    const task = join(root, '20260131T120000-add-auth');
    mkdirSync(join(task, '20260131T120500-explore'), { recursive: true });
    mkdirSync(join(task, 'scratch'), { recursive: true });
    writeFileSync(join(task, 'notes.txt'), '', 'utf-8');

    expect(readTaskLayout(task)?.actionRuns).toEqual(['20260131T120500-explore']);
  });

  it('returns undefined for a missing or malformed task directory', () => {
    expect(readTaskLayout(join(root, 'absent'))).toBeUndefined();

    const badName = join(root, 'not-timestamped');
    mkdirSync(badName, { recursive: true });
    expect(readTaskLayout(badName)).toBeUndefined();
  });
});
