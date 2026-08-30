import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installGlobalSystem } from '../../src/system/install.js';
import { initWorkspace } from '../../src/workspace/init.js';
import { discoverWorkspace } from '../../src/workspace/discovery.js';

describe('Integration: global install', () => {
  let tempDir: string;
  let home: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-integration-install-'));
    home = join(tempDir, 'home');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('installs the global system and generates user-level adapters', () => {
    const result = installGlobalSystem({ harnesses: ['claude', 'cursor'], home });

    expect(result.success).toBe(true);
    expect(existsSync(join(home, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(home, '.opencontract', 'config.yaml'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'commands', 'oc'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'skills', 'oc-explore'))).toBe(true);
    expect(existsSync(join(home, '.cursor', 'commands', 'oc'))).toBe(true);
    expect(result.userAdapters.claude.commands).toBeGreaterThan(0);
    expect(result.userAdapters.cursor.commands).toBeGreaterThan(0);
  });

  it('installs then initializes a project with global references', () => {
    installGlobalSystem({ harnesses: ['claude'], home });

    const projectRoot = join(tempDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    initWorkspace(projectRoot, { harnesses: ['claude'], checkGlobalSystem: false });

    const workspace = discoverWorkspace(projectRoot);
    expect(workspace).toBeDefined();
    expect(workspace!.config.system).toBe('~/.opencontract/system');
    expect(workspace!.config.cache).toBe('~/.opencontract/cache');
    expect(workspace!.config.trust?.validatorRoots).toContain('~/.opencontract/system');

    // Project structure without local system tree
    expect(existsSync(join(projectRoot, '.opencontract', 'config.yaml'))).toBe(true);
    expect(existsSync(join(projectRoot, '.opencontract', 'system'))).toBe(false);
    expect(existsSync(join(projectRoot, '.opencontract', 'cache'))).toBe(false);
    expect(existsSync(join(projectRoot, 'opencontract', 'specs'))).toBe(true);
  });

  it('preserves existing harness content during install', () => {
    mkdirSync(join(home, '.claude', 'rules'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), '{"theme":"dark"}\n');
    writeFileSync(join(home, '.claude', 'rules', 'custom.md'), '# My rule\n');

    installGlobalSystem({ harnesses: ['claude'], home });

    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'rules', 'custom.md'))).toBe(true);
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf-8')).toBe('{"theme":"dark"}\n');
  });

  it('reports collision when target adapter path already holds a file', () => {
    mkdirSync(join(home, '.claude', 'commands', 'oc'), { recursive: true });
    writeFileSync(join(home, '.claude', 'commands', 'oc', 'explore.md'), '# User file\n');

    const result = installGlobalSystem({ harnesses: ['claude'], home });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('collision'))).toBe(true);
    // Collision prevents writing any adapters for that harness, so the key is absent.
    expect(result.userAdapters.claude).toBeUndefined();
  });
});
