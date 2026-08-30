import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAdapters, type AdapterGenerateOptions } from '../../src/system/generators.js';
import { GENERATED_MARKER } from '../../src/system/harnesses.js';

describe('Adapter generation', () => {
  let tempDir: string;
  let systemRoot: string;
  let targetRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-generators-test-'));
    systemRoot = join(tempDir, 'system');
    targetRoot = join(tempDir, 'target');

    // Create mock system with 3 Actions
    mkdirSync(join(systemRoot, 'actions', 'explore'), { recursive: true });
    mkdirSync(join(systemRoot, 'actions', 'build'), { recursive: true });
    mkdirSync(join(systemRoot, 'actions', 'test'), { recursive: true });

    writeFileSync(
      join(systemRoot, 'actions', 'explore', 'SKILL.md'),
      '# Explore\n\nExplore the codebase.\n\n## Declared contracts\n\n- input-analysis\n',
    );
    writeFileSync(
      join(systemRoot, 'actions', 'build', 'SKILL.md'),
      '# Build\n\nBuild artifacts from specs.\n',
    );
    writeFileSync(join(systemRoot, 'actions', 'test', 'SKILL.md'), '# Test\n\nRun tests.\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates commands and skills for all Actions', () => {
    const result = generateAdapters({
      systemRoot,
      targetRoot,
      harness: 'claude',
    });

    expect(result.commands).toHaveLength(3);
    expect(result.skills).toHaveLength(3);
    expect(result.collisions).toHaveLength(0);

    // Verify command paths
    expect(result.commands).toContain(join(targetRoot, 'commands', 'oc', 'explore.md'));
    expect(result.commands).toContain(join(targetRoot, 'commands', 'oc', 'build.md'));
    expect(result.commands).toContain(join(targetRoot, 'commands', 'oc', 'test.md'));

    // Verify skill paths
    expect(result.skills).toContain(join(targetRoot, 'skills', 'oc-explore', 'SKILL.md'));
    expect(result.skills).toContain(join(targetRoot, 'skills', 'oc-build', 'SKILL.md'));
    expect(result.skills).toContain(join(targetRoot, 'skills', 'oc-test', 'SKILL.md'));
  });

  it('includes generated marker in all files', () => {
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    const commandContent = readFileSync(
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      'utf-8',
    );
    const skillContent = readFileSync(
      join(targetRoot, 'skills', 'oc-explore', 'SKILL.md'),
      'utf-8',
    );

    expect(commandContent.startsWith(GENERATED_MARKER)).toBe(true);
    expect(skillContent.startsWith(GENERATED_MARKER)).toBe(true);
  });

  it('inlines Action body content', () => {
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    const commandContent = readFileSync(
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      'utf-8',
    );

    expect(commandContent).toContain('Explore the codebase.');
    expect(commandContent).toContain('## Declared contracts');
    expect(commandContent).toContain('input-analysis');
  });

  it('uses oc: namespace for commands', () => {
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    const commandContent = readFileSync(
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      'utf-8',
    );

    expect(commandContent).toContain('name: oc:explore');
  });

  it('uses oc-<action> naming for skills', () => {
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    const skillContent = readFileSync(
      join(targetRoot, 'skills', 'oc-explore', 'SKILL.md'),
      'utf-8',
    );

    expect(skillContent).toContain('name: oc-explore');
  });

  it('detects collisions and writes zero files', () => {
    // Create a user-authored file without marker
    mkdirSync(join(targetRoot, 'commands', 'oc'), { recursive: true });
    writeFileSync(
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      '# My custom command\n',
      'utf-8',
    );

    const result = generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toBe(join(targetRoot, 'commands', 'oc', 'explore.md'));
    expect(result.commands).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
  });

  it('overwrites with force flag', () => {
    // Create a user-authored file
    mkdirSync(join(targetRoot, 'commands', 'oc'), { recursive: true });
    writeFileSync(
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      '# My custom command\n',
      'utf-8',
    );

    const result = generateAdapters({
      systemRoot,
      targetRoot,
      harness: 'claude',
      force: true,
    });

    expect(result.collisions).toHaveLength(0);
    expect(result.commands).toHaveLength(3);
    expect(result.skills).toHaveLength(3);

    // Verify overwrite happened
    const content = readFileSync(join(targetRoot, 'commands', 'oc', 'explore.md'), 'utf-8');
    expect(content.startsWith(GENERATED_MARKER)).toBe(true);
  });

  it('safely regenerates files with generated marker', () => {
    // First generation
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    // Second generation without force should succeed
    const result = generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    expect(result.collisions).toHaveLength(0);
    expect(result.commands).toHaveLength(3);
    expect(result.skills).toHaveLength(3);
  });

  it('skips legacy opencontract Action', () => {
    mkdirSync(join(systemRoot, 'actions', 'opencontract'), { recursive: true });
    writeFileSync(
      join(systemRoot, 'actions', 'opencontract', 'SKILL.md'),
      '# OpenContract\n\nLegacy entry.\n',
    );

    const result = generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    expect(result.skipped).toContain('opencontract');
    expect(result.commands).toHaveLength(3); // Still only explore, build, test
    expect(result.skills).toHaveLength(3);
  });

  it('includes an available-commands reference section', () => {
    generateAdapters({ systemRoot, targetRoot, harness: 'claude' });

    for (const path of [
      join(targetRoot, 'commands', 'oc', 'explore.md'),
      join(targetRoot, 'skills', 'oc-explore', 'SKILL.md'),
    ]) {
      const content = readFileSync(path, 'utf-8');
      expect(content).toContain('## Available commands');
      expect(content).toContain('opencontract action list');
      expect(content).toContain('opencontract validate');
      expect(content).toContain('opencontract doctor');
    }
  });

  it('generates consistent structure for multiple harnesses', () => {
    const claudeRoot = join(tempDir, 'claude-target');
    const cursorRoot = join(tempDir, 'cursor-target');

    const claudeResult = generateAdapters({
      systemRoot,
      targetRoot: claudeRoot,
      harness: 'claude',
    });

    const cursorResult = generateAdapters({
      systemRoot,
      targetRoot: cursorRoot,
      harness: 'cursor',
    });

    // Same number of files
    expect(claudeResult.commands).toHaveLength(cursorResult.commands.length);
    expect(claudeResult.skills).toHaveLength(cursorResult.skills.length);

    // Both have same namespace
    const claudeCommand = readFileSync(
      join(claudeRoot, 'commands', 'oc', 'explore.md'),
      'utf-8',
    );
    const cursorCommand = readFileSync(
      join(cursorRoot, 'commands', 'oc', 'explore.md'),
      'utf-8',
    );

    expect(claudeCommand).toContain('name: oc:explore');
    expect(cursorCommand).toContain('name: oc:explore');
  });
});
