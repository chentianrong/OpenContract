import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initWorkspace } from '../src/workspace/init.js';
import { bundledSystemRoot } from '../src/resources.js';

/**
 * End-to-end checks for `validate`. Beyond output shape, these assert the two
 * properties a caller depends on: exit codes distinguish a content defect from a
 * configuration fault, and validation never writes to the files it reads.
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

describe('CLI: validate', () => {
  let workspace: string;
  let runDir: string;

  const RUN_RELATIVE = 'opencontract/artifacts/20260131T120000-task/20260131T120500-explore';

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-validate-'));
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });
    runDir = join(workspace, RUN_RELATIVE);
    mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function writeArtifact(name: string, content: string): string {
    const path = join(runDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  function note(inputs: string[] = []): string {
    return `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: ${JSON.stringify(inputs)}
---

## Observation

The cache key omitted the tenant id.
`;
  }

  it('exits 0 and reports every phase for a valid Artifact', () => {
    writeArtifact('note.md', note());
    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/note.md`]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('valid');
    expect(result.stdout).toContain('note@v1.0.0');
    expect(result.stdout).toContain('parse=pass');
    expect(result.stdout).toContain('artifact_core=pass');
    expect(result.stdout).toContain('references=pass');
    // The bundled note Contract declares no validator.
    expect(result.stdout).toContain('semantic_validator=skip');
  });

  it('emits the versioned JSON protocol with --json', () => {
    writeArtifact('note.md', note());
    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/note.md`, '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.protocol).toBe('opencontract-validation');
    expect(parsed.version).toBe('v1.0.0');
    expect(parsed.valid).toBe(true);
    expect(parsed.target.type).toBe('file');
    expect(parsed.target.contract).toBe('note');
    expect(parsed.phases.map((p: { phase: string }) => p.phase)).toEqual([
      'parse',
      'artifact_core',
      'contract_structure',
      'semantic_validator',
      'references',
    ]);
  });

  it('exits 1 with a repair hint for a content defect', () => {
    writeArtifact(
      'proposal.md',
      `---
contract: proposal
version: v1.0.0
action: build
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Why

Only one of the three required sections.
`,
    );

    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/proposal.md`]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('INVALID');
    expect(result.stdout).toContain('contract_structure=FAIL');
    expect(result.stdout).toContain('SECTION_MISSING');
    expect(result.stdout).toContain('hint:');
  });

  it('exits 1 for a missing input reference', () => {
    writeArtifact('note.md', note(['absent.md']));
    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/note.md`]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('REFERENCE_NOT_FOUND');
  });

  it('exits 2 when the Contract cannot be resolved', () => {
    writeArtifact(
      'unknown.md',
      `---
contract: no-such-contract
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
    );

    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/unknown.md`]);

    // An unresolvable Contract is a configuration fault, not a document defect.
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('CONTRACT_NOT_FOUND');
  });

  it('detects a cycle only with --recursive', () => {
    writeArtifact('a.md', note(['b.md']));
    writeArtifact('b.md', note(['a.md']));

    const shallow = runCli(workspace, ['validate', `${RUN_RELATIVE}/a.md`]);
    expect(shallow.status).toBe(0);
    expect(shallow.stdout).not.toContain('REFERENCE_CYCLE');

    const deep = runCli(workspace, ['validate', `${RUN_RELATIVE}/a.md`, '--recursive']);
    expect(deep.status).toBe(1);
    expect(deep.stdout).toContain('REFERENCE_CYCLE');
  });

  it('summarizes a directory and lists failures first', () => {
    writeArtifact('good.md', note());
    writeArtifact('also-good.md', note());
    writeArtifact('broken.md', '## No frontmatter\n\nProse.\n');

    const result = runCli(workspace, ['validate', RUN_RELATIVE]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('2/3 file(s) valid');
    expect(result.stdout).toContain('broken.md');
    expect(result.stdout).toContain('Valid files (2)');
    // The failing file is reported before the valid-file list.
    expect(result.stdout.indexOf('broken.md')).toBeLessThan(
      result.stdout.indexOf('Valid files'),
    );
  });

  it('exits 0 for a directory where every file is valid', () => {
    writeArtifact('one.md', note());
    writeArtifact('two.md', note());

    const result = runCli(workspace, ['validate', RUN_RELATIVE, '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.target.type).toBe('directory');
    expect(parsed.fileCount).toBe(2);
    expect(parsed.validCount).toBe(2);
    expect(parsed.results).toHaveLength(2);
  });

  it('exits 2 when no workspace is discoverable', () => {
    const empty = mkdtempSync(join(tmpdir(), 'opencontract-empty-'));
    try {
      const result = runCli(empty, ['validate', 'anything.md']);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('WORKSPACE_NOT_FOUND');
      expect(result.stderr).toContain('Hint:');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('leaves source files unchanged', () => {
    const validContent = note();
    const invalidContent = `---
contract: proposal
version: v1.0.0
action: build
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Why

Incomplete.
`;
    const validPath = writeArtifact('unchanged-valid.md', validContent);
    const invalidPath = writeArtifact('unchanged-invalid.md', invalidContent);

    runCli(workspace, ['validate', RUN_RELATIVE, '--recursive']);

    expect(readFileSync(validPath, 'utf-8')).toBe(validContent);
    expect(readFileSync(invalidPath, 'utf-8')).toBe(invalidContent);
  });

  it('prints no stack trace for an expected failure', () => {
    const result = runCli(workspace, ['validate', `${RUN_RELATIVE}/does-not-exist.md`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain('at Object.');
    expect(result.stderr).not.toContain('node:internal');
  });
});
