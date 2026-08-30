import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end happy path: initialization → Artifact generation → validation →
 * ActionRun validation → inspection → doctor → update, all in one clean flow.
 *
 * This verifies the complete lifecycle from an empty directory to a healthy
 * workspace with validated managed Artifacts.
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

describe('End-to-end happy path', () => {
  let workspace: string;
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-e2e-'));
    tempHome = mkdtempSync(join(tmpdir(), 'opencontract-e2e-home-'));

    // Isolate HOME for global system check
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    // Pre-install global system so init doesn't require interaction
    const installResult = runCli(tempHome, ['install', '--harness', 'claude', '--non-interactive']);
    if (installResult.status !== 0) {
      throw new Error(`Global system install failed: ${installResult.stderr}`);
    }
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(tempHome, { recursive: true, force: true });

    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  });

  it('completes the full lifecycle from init to validated ActionRun', () => {
    // --- Step 1: Initialize workspace ---
    const initResult = runCli(workspace, ['init', '--harness', 'claude']);
    expect(initResult.status).toBe(0);
    expect(initResult.stdout).toContain('initialized');

    // Verify initialization created the expected structure. Under the global
    // system model the system tree lives at ~/.opencontract/system, not inside
    // the project, so the project carries only config and its own extensions.
    expect(existsSync(join(workspace, '.opencontract', 'config.yaml'))).toBe(true);
    expect(existsSync(join(tempHome, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(workspace, 'opencontract', 'specs'))).toBe(true);
    expect(existsSync(join(workspace, 'opencontract', 'artifacts', 'archive'))).toBe(true);
    // Adapters generate per-Action skills (oc-explore, oc-plan, etc.), not a single 'opencontract' entry
    expect(existsSync(join(workspace, '.claude', 'skills', 'oc-explore', 'SKILL.md'))).toBe(
      true,
    );

    // --- Step 2: Inspect installed definitions ---
    const actionListResult = runCli(workspace, ['action', 'list']);
    expect(actionListResult.status).toBe(0);
    expect(actionListResult.stdout).toContain('opencontract');
    expect(actionListResult.stdout).toContain('explore');
    expect(actionListResult.stdout).toContain('plan');

    const contractListResult = runCli(workspace, ['contract', 'list']);
    expect(contractListResult.status).toBe(0);
    expect(contractListResult.stdout).toContain('note');
    expect(contractListResult.stdout).toContain('proposal');
    expect(contractListResult.stdout).toContain('tasks');

    const actionInspectResult = runCli(workspace, [
      'action',
      'inspect',
      'explore',
      '--version',
      'v1.0.0',
      '--json',
    ]);
    expect(actionInspectResult.status).toBe(0);
    const actionDef = JSON.parse(actionInspectResult.stdout);
    expect(actionDef.action.name).toBe('explore');
    expect(actionDef.action.version).toBe('v1.0.0');
    expect(actionDef.action.source).toBe('system');

    const contractInspectResult = runCli(workspace, [
      'contract',
      'inspect',
      'note',
      '--version',
      'v1.0.0',
      '--json',
    ]);
    expect(contractInspectResult.status).toBe(0);
    const contractDef = JSON.parse(contractInspectResult.stdout);
    expect(contractDef.contract.name).toBe('note');
    expect(contractDef.contract.version).toBe('v1.0.0');

    // --- Step 3: Create managed Artifacts in task hierarchy ---
    const taskDir = join(workspace, 'opencontract', 'artifacts', '20260828T100000-investigate');
    const runDir = join(taskDir, '20260828T100500-explore');
    mkdirSync(runDir, { recursive: true });

    const noteContent = `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-08-28T10:05:00Z"
inputs: []
---

## Observation

The current authentication flow stores tokens in localStorage without httpOnly protection.
`;

    const decisionContent = `---
contract: decision
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-08-28T10:06:00Z"
inputs: ["note.md"]
status: pending
---

## Question

Should we migrate to httpOnly cookies or implement a refresh token pattern?

## Options

1. httpOnly cookies — browser-managed security, but CSRF protection is required.
2. Refresh token pattern — fine-grained control and mobile-friendly, but more complex.

## Recommendation

Start with httpOnly cookies plus a CSRF token; revisit refresh tokens when a
mobile client lands. This Decision is still pending human authorization.
`;

    writeFileSync(join(runDir, 'note.md'), noteContent, 'utf-8');
    writeFileSync(join(runDir, 'decision.md'), decisionContent, 'utf-8');

    // --- Step 4: Validate single Artifact ---
    const singleValidateResult = runCli(workspace, [
      'validate',
      join(runDir, 'note.md'),
      '--json',
    ]);
    expect(singleValidateResult.status).toBe(0);
    const singleResult = JSON.parse(singleValidateResult.stdout);
    expect(singleResult.valid).toBe(true);
    expect(singleResult.target.type).toBe('file');
    expect(singleResult.target.contract).toBe('note');

    // --- Step 5: Validate directory ---
    const dirValidateResult = runCli(workspace, ['validate', runDir, '--json']);
    expect(dirValidateResult.status).toBe(0);
    const dirResult = JSON.parse(dirValidateResult.stdout);
    expect(dirResult.target.type).toBe('directory');
    expect(dirResult.fileCount).toBe(2);
    expect(dirResult.validCount).toBe(2);

    // --- Step 6: Validate with recursive dependency checking ---
    const recursiveResult = runCli(workspace, [
      'validate',
      join(runDir, 'decision.md'),
      '--recursive',
    ]);
    expect(recursiveResult.status).toBe(0);
    expect(recursiveResult.stdout).toContain('valid');
    expect(recursiveResult.stdout).toContain('references=pass');

    // --- Step 7: Validate ActionRun ---
    const actionRunResult = runCli(workspace, ['validate-action', runDir, '--json']);
    expect(actionRunResult.status).toBe(0);
    const runValidation = JSON.parse(actionRunResult.stdout);
    expect(runValidation.valid).toBe(true);
    expect(runValidation.action).toBe('explore');
    expect(runValidation.actionVersion).toBe('v1.0.0');
    expect(runValidation.outputs).toHaveLength(2);

    // --- Step 8: Run doctor checks ---
    const doctorResult = runCli(workspace, ['doctor', '--json']);
    expect(doctorResult.status).toBe(0);
    const doctorCheck = JSON.parse(doctorResult.stdout);
    expect(doctorCheck.healthy).toBe(true);
    expect(doctorCheck.checks).toBeInstanceOf(Array);
    expect(doctorCheck.checks.every((c: { healthy: boolean }) => c.healthy)).toBe(true);

    // --- Step 9: Update system (idempotent) ---
    const updateResult = runCli(workspace, ['update', '--json']);
    expect(updateResult.status).toBe(0);
    const updateOutcome = JSON.parse(updateResult.stdout);
    expect(updateOutcome.success).toBe(true);

    // --- Step 10: Test Contract fixtures ---
    const contractTestResult = runCli(workspace, [
      'contract',
      'test',
      'proposal',
      '--version',
      'v1.0.0',
      '--json',
    ]);
    expect(contractTestResult.status).toBe(0);
    const testResult = JSON.parse(contractTestResult.stdout);
    expect(testResult.passed).toBe(true);
    expect(testResult.contract).toBe('proposal');
    expect(testResult.fixtures.valid.length).toBeGreaterThan(0);
    expect(testResult.fixtures.invalid.length).toBeGreaterThan(0);
  });

  it('handles multiple ActionRuns in a task hierarchy', () => {
    // Initialize
    runCli(workspace, ['init', '--harness', 'claude']);

    // Create task with multiple ActionRuns: explore → build → plan
    const taskDir = join(workspace, 'opencontract', 'artifacts', '20260828T110000-refactor');
    const exploreDir = join(taskDir, '20260828T110100-explore');
    const buildDir = join(taskDir, '20260828T110200-build');
    const planDir = join(taskDir, '20260828T110300-plan');

    mkdirSync(exploreDir, { recursive: true });
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(planDir, { recursive: true });

    // Explore run
    writeFileSync(
      join(exploreDir, 'note.md'),
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-08-28T11:01:00Z"
inputs: []
---

## Observation

Code duplication across three modules.
`,
      'utf-8',
    );

    // Build run referencing explore output
    const exploreOutput = '../20260828T110100-explore/note.md';
    writeFileSync(
      join(buildDir, 'proposal.md'),
      `---
contract: proposal
version: v1.0.0
action: build
action_version: v1.0.0
created_at: "2026-08-28T11:02:00Z"
inputs: ["${exploreOutput}"]
---

## Why

Reduce code duplication to improve maintainability and reduce bugs.

## What Changes

Extract shared logic to a new utils module and update imports.

## Impact

Modifies three modules; existing tests continue to pass.
`,
      'utf-8',
    );

    // Plan run referencing proposal
    const proposalOutput = '../20260828T110200-build/proposal.md';
    writeFileSync(
      join(planDir, 'tasks.md'),
      `---
contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-08-28T11:03:00Z"
inputs: ["${proposalOutput}"]
---

## Tasks

- [ ] Extract shared logic to utils module
- [ ] Update import paths in three modules
- [ ] Add integration tests
`,
      'utf-8',
    );

    // Validate all ActionRuns
    const exploreResult = runCli(workspace, ['validate-action', exploreDir]);
    expect(exploreResult.status).toBe(0);

    const buildResult = runCli(workspace, ['validate-action', buildDir]);
    expect(buildResult.status).toBe(0);

    const planResult = runCli(workspace, ['validate-action', planDir]);
    if (planResult.status !== 0) {
      console.log('Plan ActionRun validation failed:', planResult.stdout);
      console.log('stderr:', planResult.stderr);
    }
    expect(planResult.status).toBe(0);

    // Validate the tasks Artifact with recursive dependency checking
    const recursiveResult = runCli(workspace, [
      'validate',
      join(planDir, 'tasks.md'),
      '--recursive',
    ]);
    expect(recursiveResult.status).toBe(0);
    expect(recursiveResult.stdout).toContain('valid');
  });
});
