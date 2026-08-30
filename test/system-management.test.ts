import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GENERATED_MARKER,
  SUPPORTED_HARNESSES,
  adapterFor,
  isGenerated,
  renderAdapter,
  writeAdapter,
} from '../src/system/harnesses.js';
import { runDoctor } from '../src/system/health.js';
import { updateSystem } from '../src/system/update.js';
import { initWorkspace } from '../src/workspace/init.js';
import { requireWorkspace, resolvePaths } from '../src/workspace/discovery.js';
import { DefinitionResolver } from '../src/definitions/resolver.js';
import { bundledSystemRoot } from '../src/resources.js';

describe('Harness adapters', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-harness-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('knows the supported harnesses', () => {
    expect(SUPPORTED_HARNESSES.map((a) => a.name)).toEqual(['codex', 'claude', 'cursor']);
    expect(adapterFor('claude')?.relativePath).toBe('.claude/skills/opencontract/SKILL.md');
    expect(adapterFor('nonexistent')).toBeUndefined();
  });

  it('renders an adapter that delegates rather than duplicating Actions', () => {
    const rendered = renderAdapter('claude', '.opencontract/system');

    expect(rendered.startsWith(GENERATED_MARKER)).toBe(true);
    expect(rendered).toContain('.opencontract/system/actions/opencontract/SKILL.md');
    // The adapter must not restate the concrete Action catalog.
    for (const businessAction of ['explore', 'plan', 'execute', 'debug', 'archive']) {
      expect(rendered).not.toContain(`actions/${businessAction}/`);
    }
  });

  it('writes an adapter and recognizes it as generated', () => {
    const outcome = writeAdapter(workspace, 'claude', '.opencontract/system');

    expect(outcome.kind).toBe('written');
    if (outcome.kind === 'written') {
      expect(existsSync(outcome.path)).toBe(true);
      expect(isGenerated(outcome.path)).toBe(true);
    }
  });

  it('replaces its own generated file on a second write', () => {
    const first = writeAdapter(workspace, 'codex', '.opencontract/system');
    expect(first.kind).toBe('written');

    const second = writeAdapter(workspace, 'codex', '.opencontract/system');
    expect(second.kind).toBe('written');
  });

  it('preserves an unmarked user file and reports the conflict', () => {
    const adapter = adapterFor('cursor')!;
    const target = join(workspace, adapter.relativePath);
    mkdirSync(join(target, '..'), { recursive: true });
    const userContent = '# My own Skill\n\nHand-written, not generated.\n';
    writeFileSync(target, userContent, 'utf-8');

    const outcome = writeAdapter(workspace, 'cursor', '.opencontract/system');

    expect(outcome.kind).toBe('conflict');
    expect(readFileSync(target, 'utf-8')).toBe(userContent);
    expect(isGenerated(target)).toBe(false);
  });

  it('reports an unsupported harness rather than writing anything', () => {
    const outcome = writeAdapter(workspace, 'not-a-harness', '.opencontract/system');
    expect(outcome).toEqual({ kind: 'unsupported', harness: 'not-a-harness' });
  });
});

describe('Doctor checks', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-doctor-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function doctor() {
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    return runDoctor(paths, discovered.config, new DefinitionResolver(paths, discovered.config));
  }

  function failingComponents(): string[] {
    return doctor()
      .checks.filter((c) => !c.healthy)
      .map((c) => c.component);
  }

  it('reports a healthy workspace after init plus update', () => {
    initWorkspace(workspace, { harnesses: ['claude'], localSystem: true });
    const discovered = requireWorkspace(workspace);
    updateSystem(resolvePaths(discovered), discovered.config);

    const result = doctor();
    expect(result.healthy).toBe(true);
    expect(result.checks.every((c) => c.healthy)).toBe(true);
  });

  it('reports a missing system tree', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    rmSync(join(workspace, '.opencontract', 'system'), { recursive: true, force: true });

    expect(failingComponents()).toContain('system-root');
  });

  it('reports a missing manifest', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    rmSync(join(workspace, '.opencontract', 'system', 'manifest.yaml'), { force: true });

    expect(failingComponents()).toContain('manifest');
  });

  it('reports a manifest entry whose package is not installed', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    rmSync(join(workspace, '.opencontract', 'system', 'contracts', 'tasks'), {
      recursive: true,
      force: true,
    });

    const result = doctor();
    const manifestFailure = result.checks.find((c) => c.component === 'manifest' && !c.healthy);
    expect(manifestFailure).toBeDefined();
    expect(manifestFailure?.message).toContain('tasks');
  });

  it('reports a malformed manifest as invalid rather than crashing', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    writeFileSync(
      join(workspace, '.opencontract', 'system', 'manifest.yaml'),
      'version: "1.0.0"\nactions: not-a-list\n',
      'utf-8',
    );

    expect(failingComponents()).toContain('manifest');
  });

  it('reports a missing adapter for a selected harness', () => {
    initWorkspace(workspace, { harnesses: ['claude'], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });

    const result = doctor();
    const adapterFailure = result.checks.find((c) => c.component === 'adapters' && !c.healthy);
    expect(adapterFailure).toBeDefined();
    expect(adapterFailure?.repairHint).toContain('update');
  });

  it('reports an unmarked adapter file as an ownership conflict', () => {
    initWorkspace(workspace, { harnesses: ['claude'], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    const target = join(workspace, '.claude', 'skills', 'opencontract', 'SKILL.md');
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, '# Hand-written\n', 'utf-8');

    const result = doctor();
    const conflict = result.checks.find((c) => c.component === 'adapters' && !c.healthy);
    expect(conflict?.message).toContain('not OpenContract-owned');
  });

  it('reports a stray file in the cache directory', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    writeFileSync(join(workspace, '.opencontract', 'cache', 'stray.txt'), '', 'utf-8');

    expect(failingComponents()).toContain('cache');
  });

  it('treats absent trusted validator roots as an explained pass', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    // Rewrite the config with no trusted roots.
    writeFileSync(
      join(workspace, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\ntrust:\n  validatorRoots: []\n',
      'utf-8',
    );

    const trust = doctor().checks.filter((c) => c.component === 'trust');
    expect(trust).toHaveLength(1);
    expect(trust[0].healthy).toBe(true);
    expect(trust[0].message).toContain('skipped');
  });
});

describe('System update', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-update-'));
    initWorkspace(workspace, { harnesses: ['claude'], localSystem: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function update() {
    const discovered = requireWorkspace(workspace);
    return updateSystem(resolvePaths(discovered), discovered.config);
  }

  it('installs the bundled system and generates adapters', () => {
    const outcome = update();

    expect(outcome.success).toBe(true);
    expect(outcome.newVersion).toBe('1.0.0');
    expect(outcome.rollbackPerformed).toBe(false);
    expect(existsSync(join(workspace, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(workspace, '.opencontract', 'system', 'actions', 'plan'))).toBe(true);
    expect(outcome.adapters.some((a) => a.kind === 'written')).toBe(true);
  });

  it('leaves project-owned content untouched', () => {
    // Project Action, project Contract, a Spec, and an Artifact.
    const projectAction = join(workspace, '.opencontract', 'actions', 'mine', 'SKILL.md');
    mkdirSync(join(projectAction, '..'), { recursive: true });
    writeFileSync(projectAction, '# my action\n', 'utf-8');

    const spec = join(workspace, 'opencontract', 'specs', 'my-spec.md');
    writeFileSync(spec, '# my spec\n', 'utf-8');

    const artifact = join(workspace, 'opencontract', 'artifacts', 'keep.md');
    writeFileSync(artifact, '# keep me\n', 'utf-8');

    update();

    expect(readFileSync(projectAction, 'utf-8')).toBe('# my action\n');
    expect(readFileSync(spec, 'utf-8')).toBe('# my spec\n');
    expect(readFileSync(artifact, 'utf-8')).toBe('# keep me\n');
  });

  it('snapshots the previous system into the cache', () => {
    update(); // installs 1.0.0
    const second = update(); // re-installs over 1.0.0

    expect(second.cachedAs).toBe('1.0.0');
    expect(existsSync(join(workspace, '.opencontract', 'cache', '1.0.0', 'manifest.yaml'))).toBe(
      true,
    );
  });

  it('does not leave staging directories behind', () => {
    update();

    const leftovers = listEntries(join(workspace, '.opencontract')).filter((name) =>
      name.startsWith('.staging-'),
    );
    expect(leftovers).toEqual([]);
  });

  it('preserves an unmarked adapter and reports the conflict', () => {
    const target = join(workspace, '.claude', 'skills', 'opencontract', 'SKILL.md');
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, '# Hand-written\n', 'utf-8');

    const outcome = update();

    expect(outcome.success).toBe(false);
    expect(outcome.errors.some((e) => e.code === 'ADAPTER_CONFLICT')).toBe(true);
    expect(readFileSync(target, 'utf-8')).toBe('# Hand-written\n');
    // The system itself still installed.
    expect(existsSync(join(workspace, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
  });

  it('reports an unsupported harness without failing the install', () => {
    writeFileSync(
      join(workspace, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\nharnesses: ["not-a-harness"]\n',
      'utf-8',
    );

    const outcome = update();

    expect(outcome.success).toBe(true);
    expect(outcome.adapters).toEqual([{ kind: 'unsupported', harness: 'not-a-harness' }]);
  });
});

/** Lists directory entry names, returning [] when the directory is absent. */
function listEntries(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}
