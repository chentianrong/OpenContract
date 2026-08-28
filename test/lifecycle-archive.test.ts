import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planArchive, repairReferences } from '../src/lifecycle/archive.js';
import { readDeclaredInputs } from '../src/validation/references.js';
import { parseMarkdown } from '../src/markdown/parser.js';

/**
 * Archive reference tests. The property under test is that a move is planned
 * before anything is written, and that an unsafe plan is refused rather than
 * partially executed.
 */
describe('Archive planning', () => {
  let root: string;
  let artifacts: string;
  let archive: string;
  let specs: string;

  const TASK = '20260131T120000-add-auth';
  const OTHER_TASK = '20260131T130000-other';
  const RUN = '20260131T120500-plan';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opencontract-archive-'));
    artifacts = join(root, 'opencontract', 'artifacts');
    archive = join(artifacts, 'archive');
    specs = join(root, 'opencontract', 'specs');
    mkdirSync(archive, { recursive: true });
    mkdirSync(specs, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const roots = () => ({ artifacts, archive, specs });

  function artifact(relativePath: string, inputs: string[] = [], body = '\n## Body\n\nText.\n'): string {
    const full = join(artifacts, relativePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(
      full,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: ${JSON.stringify(inputs)}
---
${body}`,
      'utf-8',
    );
    return full;
  }

  it('plans a move with no cross-boundary references', () => {
    artifact(`${TASK}/${RUN}/a.md`);
    artifact(`${TASK}/${RUN}/b.md`, ['a.md']);

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(true);
    expect(plan.destination).toBe(join(archive, TASK));
    // Both holder and target move together, so nothing needs rewriting.
    expect(plan.affected).toEqual([]);
  });

  it('plans a rewrite for an inbound reference from another task', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    artifact(`${OTHER_TASK}/${RUN}/holder.md`, [`../../${TASK}/${RUN}/target.md`]);

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(true);
    expect(plan.affected).toHaveLength(1);
    const [reference] = plan.affected;
    expect(reference.kind).toBe('input');
    expect(reference.holder).toBe(join(artifacts, OTHER_TASK, RUN, 'holder.md'));
    expect(reference.rewritten).toBe(`../../archive/${TASK}/${RUN}/target.md`);
  });

  it('plans a rewrite for an outbound reference to a task that stays put', () => {
    artifact(`${OTHER_TASK}/${RUN}/target.md`);
    artifact(`${TASK}/${RUN}/holder.md`, [`../../${OTHER_TASK}/${RUN}/target.md`]);

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(true);
    const reference = plan.affected.find((r) => r.holder.includes(TASK));
    expect(reference?.rewritten).toBe(`../../../${OTHER_TASK}/${RUN}/target.md`);
  });

  it('plans a rewrite for a Markdown link', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    artifact(
      `${OTHER_TASK}/${RUN}/holder.md`,
      [],
      `\n## Body\n\nSee [target](../../${TASK}/${RUN}/target.md).\n`,
    );

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    const link = plan.affected.find((r) => r.kind === 'link');
    expect(link).toBeDefined();
    expect(link?.rewritten).toBe(`../../archive/${TASK}/${RUN}/target.md`);
  });

  it('preserves a link anchor in the rewrite', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    artifact(
      `${OTHER_TASK}/${RUN}/holder.md`,
      [],
      `\n## Body\n\nSee [section](../../${TASK}/${RUN}/target.md#findings).\n`,
    );

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    const link = plan.affected.find((r) => r.kind === 'link');
    expect(link?.rewritten).toBe(`../../archive/${TASK}/${RUN}/target.md#findings`);
  });

  it('refuses a plan whose reference target does not exist', () => {
    artifact(`${OTHER_TASK}/${RUN}/holder.md`, [`../../${TASK}/${RUN}/absent.md`]);
    artifact(`${TASK}/${RUN}/a.md`);

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(false);
    expect(plan.errors.some((e) => e.code === 'ARCHIVE_REFERENCE_UNSAFE')).toBe(true);
    expect(plan.affected.some((r) => r.unsafeReason?.includes('does not exist'))).toBe(true);
  });

  it('refuses a plan when the archive destination is occupied', () => {
    artifact(`${TASK}/${RUN}/a.md`);
    mkdirSync(join(archive, TASK), { recursive: true });

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(false);
    expect(plan.errors.some((e) => e.code === 'ARCHIVE_REFERENCE_CONFLICT')).toBe(true);
  });

  it('reports a missing task directory', () => {
    const plan = planArchive(join(artifacts, 'absent'), archive, roots());

    expect(plan.safe).toBe(false);
    expect(plan.errors[0].code).toBe('PATH_NOT_FOUND');
  });

  it('reports an unparseable managed file rather than guessing', () => {
    artifact(`${TASK}/${RUN}/a.md`);
    const broken = join(artifacts, OTHER_TASK, RUN, 'broken.md');
    mkdirSync(join(broken, '..'), { recursive: true });
    writeFileSync(broken, '## No frontmatter\n', 'utf-8');

    const plan = planArchive(join(artifacts, TASK), archive, roots());

    expect(plan.safe).toBe(false);
    expect(plan.errors.some((e) => e.code === 'ARCHIVE_REFERENCE_UNSAFE')).toBe(true);
  });
});

describe('Archive reference repair', () => {
  let root: string;
  let artifacts: string;
  let archive: string;
  let specs: string;

  const TASK = '20260131T120000-add-auth';
  const OTHER_TASK = '20260131T130000-other';
  const RUN = '20260131T120500-plan';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opencontract-repair-'));
    artifacts = join(root, 'opencontract', 'artifacts');
    archive = join(artifacts, 'archive');
    specs = join(root, 'opencontract', 'specs');
    mkdirSync(archive, { recursive: true });
    mkdirSync(specs, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const roots = () => ({ artifacts, archive, specs });

  function artifact(relativePath: string, inputs: string[] = [], body = '\n## Body\n\nText.\n'): string {
    const full = join(artifacts, relativePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(
      full,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: ${JSON.stringify(inputs)}
---
${body}`,
      'utf-8',
    );
    return full;
  }

  it('rewrites a frontmatter input', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    const holder = artifact(`${OTHER_TASK}/${RUN}/holder.md`, [`../../${TASK}/${RUN}/target.md`]);

    const plan = planArchive(join(artifacts, TASK), archive, roots());
    const outcome = repairReferences(plan);

    expect(outcome.success).toBe(true);
    expect(outcome.filesRewritten).toContain(holder);
    expect(readDeclaredInputs(parseMarkdown(holder).frontmatter)).toEqual([
      `../../archive/${TASK}/${RUN}/target.md`,
    ]);
  });

  it('rewrites a body Markdown link', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    const holder = artifact(
      `${OTHER_TASK}/${RUN}/holder.md`,
      [],
      `\n## Body\n\nSee [target](../../${TASK}/${RUN}/target.md).\n`,
    );

    const outcome = repairReferences(planArchive(join(artifacts, TASK), archive, roots()));

    expect(outcome.success).toBe(true);
    expect(readFileSync(holder, 'utf-8')).toContain(`](../../archive/${TASK}/${RUN}/target.md)`);
  });

  it('leaves unrelated content untouched', () => {
    artifact(`${TASK}/${RUN}/target.md`);
    const holder = artifact(
      `${OTHER_TASK}/${RUN}/holder.md`,
      [`../../${TASK}/${RUN}/target.md`],
      '\n## Body\n\nProse that mentions nothing relevant.\n',
    );

    repairReferences(planArchive(join(artifacts, TASK), archive, roots()));

    const after = readFileSync(holder, 'utf-8');
    expect(after).toContain('Prose that mentions nothing relevant.');
    expect(after).toContain('contract: note');
    expect(after).toContain('created_at: "2026-01-31T12:05:00Z"');
  });

  it('refuses to execute an unsafe plan', () => {
    artifact(`${TASK}/${RUN}/a.md`);
    const holder = artifact(`${OTHER_TASK}/${RUN}/holder.md`, [`../../${TASK}/${RUN}/absent.md`]);
    const before = readFileSync(holder, 'utf-8');

    const plan = planArchive(join(artifacts, TASK), archive, roots());
    const outcome = repairReferences(plan);

    expect(outcome.success).toBe(false);
    expect(outcome.filesRewritten).toEqual([]);
    expect(outcome.errors[0].code).toBe('ARCHIVE_REFERENCE_UNSAFE');
    // Nothing was written.
    expect(readFileSync(holder, 'utf-8')).toBe(before);
  });

  it('is a no-op when the plan has no affected references', () => {
    artifact(`${TASK}/${RUN}/a.md`);
    artifact(`${TASK}/${RUN}/b.md`, ['a.md']);

    const outcome = repairReferences(planArchive(join(artifacts, TASK), archive, roots()));

    expect(outcome.success).toBe(true);
    expect(outcome.filesRewritten).toEqual([]);
  });
});
