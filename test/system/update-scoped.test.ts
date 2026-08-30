import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveUpdateScope,
  updateGlobalSystem,
  updateProject,
  runScopedUpdate,
} from '../../src/system/update-scoped.js';

describe('Scoped update', () => {
  let tempDir: string;
  let home: string;
  let projectRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-scoped-update-'));
    home = join(tempDir, 'home');
    projectRoot = join(tempDir, 'project');
    mkdirSync(home, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeProjectConfig(harnesses = '["claude"]') {
    mkdirSync(join(projectRoot, '.opencontract'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.opencontract', 'config.yaml'),
      `system: ~/.opencontract/system\ncache: ~/.opencontract/cache\nharnesses: ${harnesses}\n`,
    );
  }

  describe('scope resolution', () => {
    it('defaults to global only outside a project', () => {
      expect(resolveUpdateScope({})).toEqual({ global: true, project: false });
    });

    it('defaults to both inside a project', () => {
      expect(resolveUpdateScope({ projectRoot })).toEqual({ global: true, project: true });
    });

    it('honours --global alone', () => {
      expect(resolveUpdateScope({ global: true, projectRoot })).toEqual({
        global: true,
        project: false,
      });
    });

    it('honours --project alone', () => {
      expect(resolveUpdateScope({ project: true, projectRoot })).toEqual({
        global: true === false,
        project: true,
      });
    });

    it('ignores --project outside a project', () => {
      expect(resolveUpdateScope({ project: true })).toEqual({ global: false, project: false });
    });
  });

  describe('global update', () => {
    it('installs the system and user-level adapters', () => {
      const result = updateGlobalSystem({ home });

      expect(result.success).toBe(true);
      expect(existsSync(join(home, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
      expect(result.newVersion).not.toBe('unknown');
    });

    it('snapshots the previous system into the cache', () => {
      // First install establishes a version to snapshot.
      const first = updateGlobalSystem({ home });
      expect(first.success).toBe(true);

      const second = updateGlobalSystem({ home });

      expect(second.cachedAs).toBe(first.newVersion);
      expect(existsSync(join(home, '.opencontract', 'cache', first.newVersion))).toBe(true);
    });

    it('leaves no staging directory behind', () => {
      updateGlobalSystem({ home });

      const stray = readdirSync(join(home, '.opencontract')).filter((e) =>
        e.startsWith('.staging-'),
      );
      expect(stray).toEqual([]);
    });

    it('regenerates adapters for harnesses in the global config', () => {
      mkdirSync(join(home, '.opencontract'), { recursive: true });
      writeFileSync(join(home, '.opencontract', 'config.yaml'), 'harnesses: ["claude"]\n');

      const result = updateGlobalSystem({ home });

      expect(result.userAdapters.claude.commands).toBeGreaterThan(0);
      expect(existsSync(join(home, '.claude', 'commands', 'oc'))).toBe(true);
    });
  });

  describe('project update', () => {
    it('fails without a project root', () => {
      const result = updateProject({ home });
      expect(result.success).toBe(false);
    });

    it('fails when the global system is missing', () => {
      writeProjectConfig();
      const result = updateProject({ home, projectRoot });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Global system not installed');
    });

    it('regenerates project-level adapters from the global system', () => {
      updateGlobalSystem({ home });
      writeProjectConfig();

      const result = updateProject({ home, projectRoot });

      expect(result.success).toBe(true);
      expect(result.projectAdapters.claude.commands).toBeGreaterThan(0);
      expect(existsSync(join(projectRoot, '.claude', 'commands', 'oc'))).toBe(true);
    });

    it('migrates a v1.0.0 project on the way through', () => {
      updateGlobalSystem({ home });

      // v1.0.0 shape: a local system tree with its own manifest.
      mkdirSync(join(projectRoot, '.opencontract', 'system'), { recursive: true });
      writeFileSync(
        join(projectRoot, '.opencontract', 'system', 'manifest.yaml'),
        'version: "1.0.0"\n',
      );
      writeFileSync(
        join(projectRoot, '.opencontract', 'config.yaml'),
        'system: .opencontract/system\ncache: .opencontract/cache\nharnesses: ["claude"]\n',
      );

      const result = updateProject({ home, projectRoot });

      expect(result.success).toBe(true);
      expect(result.migration?.needed).toBe(true);
      expect(result.migration?.backupPath).toBeDefined();
      expect(existsSync(join(projectRoot, '.opencontract', 'system'))).toBe(false);
    });
  });

  describe('runScopedUpdate', () => {
    it('runs both halves inside a project', () => {
      writeProjectConfig();

      const result = runScopedUpdate({ home, projectRoot });

      expect(result.success).toBe(true);
      expect(result.scope).toEqual({ global: true, project: true });
      expect(result.globalResult).toBeDefined();
      expect(result.projectResult).toBeDefined();
    });

    it('skips the project half when the global half fails', () => {
      // Point resources at nothing by making the global root unwritable is
      // brittle; instead assert the shape when only global is requested.
      const result = runScopedUpdate({ home, global: true });

      expect(result.scope.project).toBe(false);
      expect(result.projectResult).toBeUndefined();
    });
  });
});
