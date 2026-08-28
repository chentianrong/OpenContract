import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundledSystemRoot } from '../src/resources.js';

/**
 * End-to-end checks for `contract test`. These run the built CLI as a real
 * process so the exit-code contract and the stdout/stderr split are exercised
 * the way a user or CI job would see them.
 */

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

function runCli(cwd: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', status: e.status ?? -1 };
  }
}

describe('CLI: contract test', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-cli-'));
    mkdirSync(join(workspace, '.opencontract'), { recursive: true });
    writeFileSync(
      join(workspace, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\n',
      'utf-8',
    );
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('exits 0 and reports a passing Contract', () => {
    const result = runCli(workspace, ['contract', 'test', 'tasks', '--version', 'v1.0.0']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('tasks@v1.0.0');
    expect(result.stdout).toContain('passed');
    expect(result.stdout).toContain('Template: ok');
  });

  it('emits the versioned JSON protocol with --json', () => {
    const result = runCli(workspace, [
      'contract',
      'test',
      'proposal',
      '--version',
      'v1.0.0',
      '--json',
    ]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.protocol).toBe('opencontract-contract-test');
    expect(parsed.version).toBe('v1.0.0');
    expect(parsed.contract).toBe('proposal');
    expect(parsed.contractVersion).toBe('v1.0.0');
    expect(parsed.passed).toBe(true);
    expect(parsed.template.ok).toBe(true);
    expect(parsed.fixtures.valid.length).toBeGreaterThan(0);
    expect(parsed.fixtures.invalid.length).toBeGreaterThan(0);
  });

  it('exits 1 when a valid fixture stops validating', () => {
    // Break a shipped valid fixture: drop a required section from `proposal`.
    const fixture = join(
      workspace,
      '.opencontract',
      'system',
      'contracts',
      'proposal',
      'fixtures',
      'valid',
      'example.md',
    );
    writeFileSync(
      fixture,
      `---
contract: proposal
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Why

Content.
`,
      'utf-8',
    );

    const result = runCli(workspace, ['contract', 'test', 'proposal', '--version', 'v1.0.0']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('FAILED');
    expect(result.stdout).toContain('example.md');
    expect(result.stdout).toContain('SECTION_MISSING');
  });

  it('exits 1 when an invalid fixture stops failing', () => {
    // Repair a shipped invalid fixture so it no longer demonstrates a defect.
    const fixture = join(
      workspace,
      '.opencontract',
      'system',
      'contracts',
      'note',
      'fixtures',
      'invalid',
      'inexact-version.md',
    );
    writeFileSync(
      fixture,
      `---
contract: note
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Observation

Content.
`,
      'utf-8',
    );

    const result = runCli(workspace, ['contract', 'test', 'note', '--version', 'v1.0.0']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('expected at least one error');
  });

  it('exits 2 with a repair hint for an unknown Contract', () => {
    const result = runCli(workspace, ['contract', 'test', 'no-such', '--version', 'v1.0.0']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('CONTRACT_NOT_FOUND');
    expect(result.stderr).toContain('Hint:');
    // Expected failures must not dump a stack trace.
    expect(result.stderr).not.toContain('at Object.');
  });

  it('exits 2 for an inexact version reference', () => {
    const result = runCli(workspace, ['contract', 'test', 'tasks', '--version', 'latest']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('INVALID_VERSION_REFERENCE');
  });

  it('exits 2 when no workspace is discoverable', () => {
    const empty = mkdtempSync(join(tmpdir(), 'opencontract-empty-'));
    try {
      const result = runCli(empty, ['contract', 'test', 'tasks', '--version', 'v1.0.0']);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('WORKSPACE_NOT_FOUND');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('keeps --version bound to the Contract, not the CLI', () => {
    // A program-level --version flag would swallow this and print the CLI
    // version instead of running the command.
    const result = runCli(workspace, ['contract', 'test', 'design', '--version', 'v1.0.0']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('design@v1.0.0');
  });
});
