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

  it('creates required directory structure', () => {
    initWorkspace(tempDir);

    const requiredDirs = [
      '.opencontract',
      '.opencontract/system',
      '.opencontract/cache',
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

  it('creates default configuration file', () => {
    initWorkspace(tempDir);

    const configPath = join(tempDir, '.opencontract', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const workspace = discoverWorkspace(tempDir);
    expect(workspace).toBeDefined();
    expect(workspace!.config.system).toBe('.opencontract/system');
    expect(workspace!.config.specs).toBe('opencontract/specs');
  });

  it('creates placeholder system manifest', () => {
    initWorkspace(tempDir);

    const manifestPath = join(tempDir, '.opencontract', 'system', 'manifest.yaml');
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('creates harness adapter directories', () => {
    initWorkspace(tempDir, { harnesses: ['codex', 'claude'] });

    expect(existsSync(join(tempDir, '.codex', 'skills', 'opencontract'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'opencontract'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'skills', 'opencontract'))).toBe(false);
  });

  it('is non-destructive on second initialization', () => {
    initWorkspace(tempDir);

    // Modify something
    const customFile = join(tempDir, 'opencontract', 'specs', 'custom.md');
    writeFileSync(customFile, '# Custom spec');

    // Try to init again - should throw
    expect(() => initWorkspace(tempDir)).toThrow(OpenContractError);
    try {
      initWorkspace(tempDir);
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

    initWorkspace(tempDir);

    expect(existsSync(userFile)).toBe(true);
  });

  it('isWorkspaceInitialized checks required paths', () => {
    expect(isWorkspaceInitialized(tempDir)).toBe(false);

    initWorkspace(tempDir);

    expect(isWorkspaceInitialized(tempDir)).toBe(true);
  });

  it('isWorkspaceInitialized returns false for partial structure', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), 'system: .opencontract/system\n');

    expect(isWorkspaceInitialized(tempDir)).toBe(false);

    mkdirSync(join(tempDir, '.opencontract', 'system'), { recursive: true });
    mkdirSync(join(tempDir, 'opencontract', 'specs'), { recursive: true });
    mkdirSync(join(tempDir, 'opencontract', 'artifacts'), { recursive: true });

    expect(isWorkspaceInitialized(tempDir)).toBe(true);
  });
});
