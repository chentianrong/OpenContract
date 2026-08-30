import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkspace, isWorkspaceInitialized } from '../src/workspace/init.js';
import { discoverWorkspace } from '../src/workspace/discovery.js';
import { OpenContractError } from '../src/domain/errors.js';

describe('Workspace initialization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates required project directories without a local system tree', () => {
    initWorkspace(tempDir, { checkGlobalSystem: false });

    const requiredDirs = [
      '.opencontract',
      '.opencontract/actions',
      '.opencontract/contracts',
      'opencontract/specs',
      'opencontract/artifacts',
      'opencontract/artifacts/archive',
    ];

    for (const dir of requiredDirs) {
      expect(existsSync(join(tempDir, dir))).toBe(true);
    }
  });

  it('does not copy the system tree or create a local cache', () => {
    initWorkspace(tempDir, { checkGlobalSystem: false });

    expect(existsSync(join(tempDir, '.opencontract', 'system'))).toBe(false);
    expect(existsSync(join(tempDir, '.opencontract', 'cache'))).toBe(false);
  });

  it('creates configuration referencing the global system', () => {
    initWorkspace(tempDir, { checkGlobalSystem: false });

    const configPath = join(tempDir, '.opencontract', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const workspace = discoverWorkspace(tempDir);
    expect(workspace).toBeDefined();
    expect(workspace!.config.system).toBe('~/.opencontract/system');
    expect(workspace!.config.cache).toBe('~/.opencontract/cache');
    expect(workspace!.config.specs).toBe('opencontract/specs');
  });

  it('points trust.validatorRoots at the global system', () => {
    initWorkspace(tempDir, { checkGlobalSystem: false });

    const workspace = discoverWorkspace(tempDir);
    expect(workspace!.config.trust?.validatorRoots).toEqual(['~/.opencontract/system']);
  });

  it('creates harness skill directories for selected harnesses only', () => {
    initWorkspace(tempDir, { harnesses: ['codex', 'claude'], checkGlobalSystem: false });

    expect(existsSync(join(tempDir, '.codex', 'skills'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'skills'))).toBe(false);
  });

  it('fails when the global system is missing and the check is enabled', () => {
    const originalHome = process.env.HOME;
    process.env.HOME = join(tempDir, 'empty-home');
    mkdirSync(process.env.HOME, { recursive: true });

    try {
      expect(() => initWorkspace(join(tempDir, 'project'))).toThrow(OpenContractError);
      try {
        initWorkspace(join(tempDir, 'project'));
      } catch (err) {
        expect((err as OpenContractError).code).toBe('GLOBAL_SYSTEM_NOT_INSTALLED');
      }
    } finally {
      if (originalHome !== undefined) process.env.HOME = originalHome;
      else delete process.env.HOME;
    }
  });

  it('is non-destructive on second initialization', () => {
    initWorkspace(tempDir, { checkGlobalSystem: false });

    // Modify something
    const customFile = join(tempDir, 'opencontract', 'specs', 'custom.md');
    writeFileSync(customFile, '# Custom spec');

    // Try to init again - should throw
    expect(() => initWorkspace(tempDir, { checkGlobalSystem: false })).toThrow(OpenContractError);
    try {
      initWorkspace(tempDir, { checkGlobalSystem: false });
    } catch (err) {
      expect((err as OpenContractError).code).toBe('WORKSPACE_EXISTS');
    }

    // Custom file should still exist
    expect(existsSync(customFile)).toBe(true);
  });

  it('preserves pre-existing user files', () => {
    // Create a user file before init
    const userDir = join(tempDir, 'opencontract', 'specs');
    mkdirSync(userDir, { recursive: true });
    const userFile = join(userDir, 'existing.md');
    writeFileSync(userFile, '# Existing');

    initWorkspace(tempDir, { checkGlobalSystem: false });

    expect(existsSync(userFile)).toBe(true);
  });

  it('isWorkspaceInitialized checks required paths', () => {
    expect(isWorkspaceInitialized(tempDir)).toBe(false);

    initWorkspace(tempDir, { checkGlobalSystem: false });

    expect(isWorkspaceInitialized(tempDir)).toBe(true);
  });

  it('isWorkspaceInitialized returns false for partial structure', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: ~/.opencontract/system\n',
    );

    expect(isWorkspaceInitialized(tempDir)).toBe(false);

    mkdirSync(join(tempDir, 'opencontract', 'specs'), { recursive: true });
    mkdirSync(join(tempDir, 'opencontract', 'artifacts'), { recursive: true });

    expect(isWorkspaceInitialized(tempDir)).toBe(true);
  });
});
