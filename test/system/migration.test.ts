import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateToGlobalSystem, needsMigration } from '../../src/system/migration.js';
import { GENERATED_MARKER } from '../../src/system/harnesses.js';

describe('Migration v1.0 to v1.1', () => {
  let tempDir: string;
  let projectRoot: string;
  let home: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-migration-test-'));
    projectRoot = join(tempDir, 'project');
    home = join(tempDir, 'home');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createV1Project() {
    const dirs = [
      '.opencontract/system',
      '.opencontract/cache/v1.0.0',
      '.opencontract/actions',
      '.opencontract/contracts',
      'opencontract/specs',
    ];
    for (const dir of dirs) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
    }

    writeFileSync(
      join(projectRoot, '.opencontract', 'system', 'manifest.yaml'),
      'version: "1.0.0"\ninstalledAt: "2024-01-01"\n',
    );

    writeFileSync(
      join(projectRoot, '.opencontract', 'config.yaml'),
      `system: .opencontract/system
cache: .opencontract/cache
trust:
  validatorRoots:
    - .opencontract/system
harnesses: ["claude", "cursor"]
`,
    );

    // Create a v1.0 cache entry
    writeFileSync(join(projectRoot, '.opencontract', 'cache', 'v1.0.0', 'dummy.txt'), 'cache');
  }

  function createGlobalSystem() {
    mkdirSync(join(home, '.opencontract', 'system', 'actions', 'explore'), { recursive: true });
    writeFileSync(
      join(home, '.opencontract', 'system', 'manifest.yaml'),
      'version: "1.1.0"\n',
    );
    writeFileSync(
      join(home, '.opencontract', 'system', 'actions', 'explore', 'SKILL.md'),
      '# Explore\n\nExplore the codebase.\n',
    );
  }

  it('detects v1.0.0 project correctly', () => {
    createV1Project();
    expect(needsMigration(projectRoot)).toBe(true);
  });

  it('skips migration for v1.1.0 projects', () => {
    mkdirSync(join(projectRoot, '.opencontract'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.opencontract', 'config.yaml'),
      'system: ~/.opencontract/system\n',
    );

    const result = migrateToGlobalSystem({ projectRoot, home });
    expect(result.needed).toBe(false);
    expect(result.success).toBe(true);
  });

  it('installs global system when missing', () => {
    createV1Project();

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.needed).toBe(true);
    expect(existsSync(join(home, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
    expect(result.steps.some((s) => s.includes('Installed global system'))).toBe(true);
  });

  it('merges cache without overwriting existing versions', () => {
    createV1Project();
    createGlobalSystem();

    // Add another version to local cache
    mkdirSync(join(projectRoot, '.opencontract', 'cache', 'v0.9.0'), { recursive: true });
    writeFileSync(join(projectRoot, '.opencontract', 'cache', 'v0.9.0', 'old.txt'), 'old');

    // Pre-create v1.0.0 in global cache
    mkdirSync(join(home, '.opencontract', 'cache', 'v1.0.0'), { recursive: true });
    writeFileSync(join(home, '.opencontract', 'cache', 'v1.0.0', 'global.txt'), 'global');

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.cacheMerged).toContain('v0.9.0');
    expect(result.cacheSkipped).toContain('v1.0.0');
    expect(existsSync(join(home, '.opencontract', 'cache', 'v0.9.0', 'old.txt'))).toBe(true);
    // Global version should remain untouched
    expect(readFileSync(join(home, '.opencontract', 'cache', 'v1.0.0', 'global.txt'), 'utf-8')).toBe('global');
  });

  it('rewrites config to reference global paths', () => {
    createV1Project();
    createGlobalSystem();

    migrateToGlobalSystem({ projectRoot, home });

    const config = readFileSync(join(projectRoot, '.opencontract', 'config.yaml'), 'utf-8');
    expect(config).toContain('system: ~/.opencontract/system');
    expect(config).toContain('cache: ~/.opencontract/cache');
    expect(config).toMatch(/validatorRoots:\s*\n\s*-\s*~\/\.opencontract\/system/);
    expect(config).toContain('harnesses: ["claude", "cursor"]');
  });

  it('creates timestamped backup of old system', () => {
    createV1Project();
    createGlobalSystem();

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toMatch(/\.opencontract\/system\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/);
    expect(existsSync(result.backupPath!)).toBe(true);
    expect(existsSync(join(result.backupPath!, 'manifest.yaml'))).toBe(true);
  });

  it('removes generated legacy adapter', () => {
    createV1Project();
    createGlobalSystem();

    const legacySkill = join(projectRoot, '.claude', 'skills', 'opencontract', 'SKILL.md');
    mkdirSync(join(projectRoot, '.claude', 'skills', 'opencontract'), { recursive: true });
    writeFileSync(legacySkill, `${GENERATED_MARKER}\n---\nname: opencontract\n---\n\nLegacy.\n`);

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.legacyRemoved).toContain(join(projectRoot, '.claude', 'skills', 'opencontract'));
    expect(existsSync(legacySkill)).toBe(false);
  });

  it('preserves user-authored legacy adapter', () => {
    createV1Project();
    createGlobalSystem();

    const legacySkill = join(projectRoot, '.cursor', 'skills', 'opencontract', 'SKILL.md');
    mkdirSync(join(projectRoot, '.cursor', 'skills', 'opencontract'), { recursive: true });
    writeFileSync(legacySkill, '# My custom opencontract skill\n\nUser authored.\n');

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.legacyPreserved).toContain(legacySkill);
    expect(existsSync(legacySkill)).toBe(true);
    expect(result.errors.some((e) => e.includes('authored by hand'))).toBe(true);
  });

  it('generates new per-Action adapters', () => {
    createV1Project();
    createGlobalSystem();

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.success).toBe(true);
    expect(existsSync(join(projectRoot, '.claude', 'commands', 'oc', 'explore.md'))).toBe(true);
    expect(existsSync(join(projectRoot, '.claude', 'skills', 'oc-explore', 'SKILL.md'))).toBe(true);
    expect(result.steps.some((s) => s.includes('Generated') && s.includes('claude'))).toBe(true);
  });

  it('reports adapter collisions as errors', () => {
    createV1Project();
    createGlobalSystem();

    // Create a user-authored file at a target path
    mkdirSync(join(projectRoot, '.claude', 'commands', 'oc'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'commands', 'oc', 'explore.md'), 'User file\n');

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Adapter collision'))).toBe(true);
  });

  it('returns all steps in order', () => {
    createV1Project();
    createGlobalSystem();

    const result = migrateToGlobalSystem({ projectRoot, home });

    expect(result.steps.length).toBeGreaterThan(0);
    // Order matters: config rewrite before backup
    const configIdx = result.steps.findIndex((s) => s.includes('Rewrote config'));
    const backupIdx = result.steps.findIndex((s) => s.includes('Backed up'));
    expect(configIdx).toBeLessThan(backupIdx);
  });
});
