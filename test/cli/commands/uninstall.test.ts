import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uninstallGlobalSystem, isGlobalSystemInstalled } from '../../../src/system/uninstall.js';

describe('Uninstall', () => {
  let tempDir: string;
  let home: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-uninstall-test-'));
    home = join(tempDir, 'home');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function installMockSystem() {
    mkdirSync(join(home, '.opencontract', 'system'), { recursive: true });
    mkdirSync(join(home, '.opencontract', 'cache', 'v1.0.0'), { recursive: true });
    writeFileSync(join(home, '.opencontract', 'system', 'manifest.yaml'), 'version: "1.1.0"\n');
    writeFileSync(join(home, '.opencontract', 'config.yaml'), 'harnesses: ["claude"]\n');

    mkdirSync(join(home, '.claude', 'commands', 'oc'), { recursive: true });
    mkdirSync(join(home, '.claude', 'skills', 'oc-explore'), { recursive: true });
    mkdirSync(join(home, '.claude', 'skills', 'oc-build'), { recursive: true });
    writeFileSync(join(home, '.claude', 'commands', 'oc', 'explore.md'), '# explore\n');
    writeFileSync(join(home, '.claude', 'skills', 'oc-explore', 'SKILL.md'), '# explore\n');
    writeFileSync(join(home, '.claude', 'skills', 'oc-build', 'SKILL.md'), '# build\n');
  }

  it('removes the system, config, cache, and user adapters', () => {
    installMockSystem();

    const result = uninstallGlobalSystem({ home });

    expect(result.success).toBe(true);
    expect(existsSync(join(home, '.opencontract', 'system'))).toBe(false);
    expect(existsSync(join(home, '.opencontract', 'config.yaml'))).toBe(false);
    expect(existsSync(join(home, '.opencontract', 'cache'))).toBe(false);
    expect(existsSync(join(home, '.claude', 'commands', 'oc'))).toBe(false);
    expect(existsSync(join(home, '.claude', 'skills', 'oc-explore'))).toBe(false);
  });

  it('preserves cache when --keep-cache is set', () => {
    installMockSystem();

    const result = uninstallGlobalSystem({ home, keepCache: true });

    expect(result.success).toBe(true);
    expect(existsSync(join(home, '.opencontract', 'cache'))).toBe(true);
    expect(result.preserved).toContain(join(home, '.opencontract', 'cache'));
  });

  it('preserves harness settings and other skills', () => {
    installMockSystem();
    writeFileSync(join(home, '.claude', 'settings.json'), '{"theme":"dark"}\n');
    mkdirSync(join(home, '.claude', 'skills', 'my-skill'), { recursive: true });
    writeFileSync(join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# mine\n');

    uninstallGlobalSystem({ home });

    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'skills', 'my-skill'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'skills', 'oc-explore'))).toBe(false);
  });

  it('succeeds with empty removed list when nothing is installed', () => {
    const result = uninstallGlobalSystem({ home });

    expect(result.success).toBe(true);
    expect(result.removed).toEqual([]);
  });

  it('detects installed state correctly', () => {
    expect(isGlobalSystemInstalled(home)).toBe(false);

    installMockSystem();

    expect(isGlobalSystemInstalled(home)).toBe(true);
  });

  it('removes all oc-* skills across harnesses', () => {
    installMockSystem();
    mkdirSync(join(home, '.cursor', 'skills', 'oc-test'), { recursive: true });
    writeFileSync(join(home, '.cursor', 'skills', 'oc-test', 'SKILL.md'), '# test\n');

    uninstallGlobalSystem({ home });

    expect(existsSync(join(home, '.claude', 'skills', 'oc-explore'))).toBe(false);
    expect(existsSync(join(home, '.cursor', 'skills', 'oc-test'))).toBe(false);
  });

  it('cleans up empty .opencontract directory', () => {
    mkdirSync(join(home, '.opencontract', 'system'), { recursive: true });
    writeFileSync(join(home, '.opencontract', 'system', 'manifest.yaml'), 'version: "1.1.0"\n');

    uninstallGlobalSystem({ home });

    expect(existsSync(join(home, '.opencontract'))).toBe(false);
  });
});
