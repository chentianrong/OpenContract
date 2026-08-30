import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Library-surface tests.
 *
 * These import only from the package entry point, the way a Node consumer would.
 * The property under test is that the full workflow — discover, inspect,
 * validate — is reachable without touching the CLI or its presentation layer.
 */
import {
  initWorkspace,
  requireWorkspace,
  resolvePaths,
  DefinitionResolver,
  DefinitionQueryService,
  updateSystem,
  runDoctor,
  validateArtifact,
  validateDirectory,
  validateActionRun,
  parseActionRunLayout,
  parseMarkdown,
  validateArtifactCore,
  testContractFixtures,
  planArchive,
  readDecisionState,
  queryAuthorization,
  isTimestampedName,
  parseManagedArtifactPath,
  OpenContractError,
  EXIT_CODES,
  isOpenContractError,
  bundledSystemRoot,
  SUPPORTED_HARNESSES,
} from '../src/index.js';

describe('Library entry point', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-lib-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('exposes the workspace lifecycle', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });

    const discovered = requireWorkspace(workspace);
    expect(discovered.root).toBe(workspace);

    const paths = resolvePaths(discovered);
    expect(paths.system).toContain('.opencontract');
    expect(paths.artifacts).toContain('artifacts');
  });

  it('installs the system and reports health without the CLI', () => {
    initWorkspace(workspace, { harnesses: ['claude'], localSystem: true });
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);

    const outcome = updateSystem(paths, discovered.config);
    expect(outcome.success).toBe(true);

    const resolver = new DefinitionResolver(paths, discovered.config);
    const report = runDoctor(paths, discovered.config, resolver);
    expect(report.healthy).toBe(true);
  });

  it('inspects definitions through the query service', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    updateSystem(paths, discovered.config);

    const service = new DefinitionQueryService(new DefinitionResolver(paths, discovered.config));

    expect(service.listActions().length).toBeGreaterThan(0);
    expect(service.listContracts().length).toBeGreaterThan(0);

    const plan = service.inspectAction('plan', 'v1.0.0');
    expect(plan.name).toBe('plan');
    expect(plan.outputs.some((o) => o.contract === 'tasks')).toBe(true);

    const tasks = service.inspectContract('tasks', 'v1.0.0');
    expect(tasks.artifactType).toBe('tasks');
  });

  it('validates an Artifact and an ActionRun', async () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    updateSystem(paths, discovered.config);

    const resolver = new DefinitionResolver(paths, discovered.config);
    const run = join(paths.artifacts, '20260131T120000-task', '20260131T120500-explore');
    mkdirSync(run, { recursive: true });

    const artifactPath = join(run, 'note.md');
    writeFileSync(
      artifactPath,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

The cache key omitted the tenant id.
`,
      'utf-8',
    );

    const options = {
      resolver,
      workspaceRoot: paths.root,
      managedRoot: paths.artifacts,
      managedRoots: [paths.artifacts, paths.specs],
      trustedValidatorRoots: paths.trustedValidatorRoots,
      validatorRuntime: { pythonExecutable: 'python3', timeoutMs: 5_000, maxOutputBytes: 65_536 },
    };

    const fileResult = await validateArtifact(artifactPath, options);
    expect(fileResult.valid).toBe(true);
    expect(fileResult.protocol).toBe('opencontract-validation');

    const directoryResult = await validateDirectory(paths.artifacts, options);
    expect(directoryResult.fileCount).toBe(1);
    expect(directoryResult.valid).toBe(true);

    const layout = parseActionRunLayout(run);
    expect(layout.outputs).toHaveLength(1);

    const runResult = await validateActionRun(
      run,
      resolver.resolveAction('explore', 'v1.0.0'),
      options,
    );
    expect(runResult.valid).toBe(true);
    expect(runResult.action).toBe('explore');
  });

  it('exposes the parsing and core-metadata primitives', () => {
    const path = join(workspace, 'artifact.md');
    writeFileSync(
      path,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const parsed = parseMarkdown(path);
    expect(parsed.frontmatter.contract).toBe('note');
    expect(parsed.headings[0].text).toBe('Observation');
    expect(validateArtifactCore(parsed, {})).toEqual([]);
  });

  it('exposes Contract fixture testing', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    updateSystem(paths, discovered.config);

    const resolver = new DefinitionResolver(paths, discovered.config);
    const result = testContractFixtures(resolver.resolveContract('proposal', 'v1.0.0'));

    expect(result.passed).toBe(true);
    expect(result.valid.length).toBeGreaterThan(0);
    expect(result.invalid.length).toBeGreaterThan(0);
  });

  it('exposes lifecycle path and Decision helpers', () => {
    expect(isTimestampedName('20260131T120000-add-auth')).toBe(true);
    expect(isTimestampedName('not-timestamped')).toBe(false);

    const roots = {
      artifacts: join(workspace, 'artifacts'),
      archive: join(workspace, 'artifacts', 'archive'),
    };
    const parsed = parseManagedArtifactPath(
      join(roots.artifacts, '20260131T120000-task', '20260131T120500-plan', 'tasks.md'),
      roots,
    );
    expect('parsed' in parsed).toBe(true);

    const pendingDecision = {
      path: '/decision.md',
      raw: '',
      frontmatter: { contract: 'decision', options: ['a', 'b'] },
      frontmatterEndLine: 4,
      body: '',
      bodyOffset: 0,
      bodyStartLine: 5,
      headings: [],
    };
    expect(readDecisionState(pendingDecision).status).toBe('pending');
    expect(queryAuthorization(pendingDecision).authorized).toBe(false);
  });

  it('exposes archive planning', () => {
    initWorkspace(workspace, { harnesses: [], localSystem: true });
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);

    const task = join(paths.artifacts, '20260131T120000-task');
    const run = join(task, '20260131T120500-explore');
    mkdirSync(run, { recursive: true });
    writeFileSync(
      join(run, 'note.md'),
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const plan = planArchive(task, paths.archive, {
      artifacts: paths.artifacts,
      archive: paths.archive,
      specs: paths.specs,
    });
    expect(plan.safe).toBe(true);
    expect(plan.destination).toContain('archive');
  });

  it('exposes the error catalog and exit codes', () => {
    const error = new OpenContractError('WORKSPACE_NOT_FOUND');
    expect(isOpenContractError(error)).toBe(true);
    expect(error.exitCode).toBe(EXIT_CODES.CONFIGURATION);
    expect(error.repairHint.length).toBeGreaterThan(0);
  });

  it('exposes bundled resources and harness metadata', () => {
    expect(bundledSystemRoot()).toContain('resources');
    expect(SUPPORTED_HARNESSES.map((h) => h.name)).toContain('claude');
  });

  it('does not export CLI presentation helpers', async () => {
    // Terminal formatting is deliberately not part of the library surface: a
    // consumer renders results itself rather than depending on CLI wording.
    // `renderAdapter` is the exception — it generates a harness file, which is
    // system management, not presentation.
    const surface = await import('../src/index.js');
    const presentationExports = Object.keys(surface).filter(
      (name) => name.startsWith('render') && name !== 'renderAdapter',
    );
    expect(presentationExports).toEqual([]);
  });
});
