import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateActionRun } from '../src/actions/validate.js';
import { initWorkspace } from '../src/workspace/init.js';
import { requireWorkspace, resolvePaths } from '../src/workspace/discovery.js';
import { DefinitionResolver } from '../src/definitions/resolver.js';
import { bundledSystemRoot } from '../src/resources.js';
import type { ActionDefinition } from '../src/domain/types.js';

/**
 * ActionRun validation tests: uniform metadata, merged inputs, required outputs,
 * count constraints, and per-output Artifact validation.
 */

describe('ActionRun validation', () => {
  let workspace: string;
  let artifactsRoot: string;
  let resolver: DefinitionResolver;
  let exploreAction: ActionDefinition;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-action-run-'));
    initWorkspace(workspace, { harnesses: [] });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });

    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    artifactsRoot = paths.artifacts;
    resolver = new DefinitionResolver(paths, discovered.config);

    exploreAction = refreshResolver().resolveAction('explore', 'v1.0.0');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function runDir(name: string): string {
    const path = join(artifactsRoot, name);
    mkdirSync(path, { recursive: true });
    return path;
  }

  function note(run: string, name: string, inputs: string[] = []): string {
    const path = join(run, name);
    writeFileSync(
      path,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: ${JSON.stringify(inputs)}
---

## Observation

Finding text.
`,
      'utf-8',
    );
    return path;
  }

  function refreshResolver() {
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    resolver = new DefinitionResolver(paths, discovered.config);
    return resolver;
  }

  const pipelineOptions = () => {
    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    return {
      resolver,
      workspaceRoot: paths.root,
      managedRoot: paths.artifacts,
      managedRoots: [paths.artifacts, paths.specs],
      trustedValidatorRoots: paths.trustedValidatorRoots,
      validatorRuntime: {
        pythonExecutable: 'python3',
        timeoutMs: 5_000,
        maxOutputBytes: 65_536,
      },
    };
  };

  it('validates a well-formed ActionRun', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md");
    note(run, "note-2.md");

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(true);
    expect(result.action).toBe('explore');
    expect(result.actionVersion).toBe('v1.0.0');
    expect(result.outputs).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('reports inconsistent action metadata across outputs', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md");
    writeFileSync(
      join(run, 'other.md'),
      `---
contract: note
version: v1.0.0
action: other-action
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_IDENTITY_INCONSISTENT')).toBe(true);
  });

  it('reports inconsistent action_version across outputs', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md");
    writeFileSync(
      join(run, 'other.md'),
      `---
contract: note
version: v1.0.0
action: explore
action_version: v2.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_IDENTITY_INCONSISTENT')).toBe(true);
  });

  it('merges inputs from every output', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md", ['a.md']);
    note(run, "note-2.md", ['b.md', 'c.md']);
    note(run, "note-3.md", ['a.md']); // duplicate is deduplicated

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.mergedInputs).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('reports a missing required output', async () => {
    // Create an Action that requires a proposal output.
    const actionDir = join(workspace, '.opencontract', 'actions', 'test-action');
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, 'SKILL.md'),
      `---
name: test-action
description: Test action with required output
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: []
outputs: 
  - contract: proposal
    version: v1.0.0
    required: true
\`\`\`
`,
      'utf-8',
    );

    refreshResolver();

    const testAction = refreshResolver().resolveAction('test-action', 'v1.0.0');
    const run = runDir('20260131T120530-test');
    writeFileSync(
      join(run, 'note.md'),
      `---
contract: note
version: v1.0.0
action: test-action
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, testAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_OUTPUT_MISSING')).toBe(true);
  });

  it('reports a minimum count violation', async () => {
    const actionDir = join(workspace, '.opencontract', 'actions', 'test-min');
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, 'SKILL.md'),
      `---
name: test-min
description: Test minimum count
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: []
outputs: 
  - contract: note
    required: false
    version: v1.0.0
    minCount: 3
\`\`\`
`,
      'utf-8',
    );

    refreshResolver();

    const testAction = refreshResolver().resolveAction('test-min', 'v1.0.0');
    const run = runDir('20260131T120530-test');
    writeFileSync(
      join(run, 'note-1.md'),
      `---
contract: note
version: v1.0.0
action: test-min
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );
    writeFileSync(
      join(run, 'note-2.md'),
      `---
contract: note
version: v1.0.0
action: test-min
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, testAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_OUTPUT_COUNT_LOW')).toBe(true);
  });

  it('reports a maximum count violation', async () => {
    const actionDir = join(workspace, '.opencontract', 'actions', 'test-max');
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, 'SKILL.md'),
      `---
name: test-max
description: Test maximum count
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: []
outputs: 
  - contract: note
    required: false
    version: v1.0.0
    maxCount: 1
\`\`\`
`,
      'utf-8',
    );

    refreshResolver();

    const testAction = refreshResolver().resolveAction('test-max', 'v1.0.0');
    const run = runDir('20260131T120530-test');
    writeFileSync(
      join(run, 'note-1.md'),
      `---
contract: note
version: v1.0.0
action: test-max
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );
    writeFileSync(
      join(run, 'note-2.md'),
      `---
contract: note
version: v1.0.0
action: test-max
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Text.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, testAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_OUTPUT_COUNT_HIGH')).toBe(true);
  });

  it('reports a missing required input', async () => {
    const actionDir = join(workspace, '.opencontract', 'actions', 'test-input');
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, 'SKILL.md'),
      `---
name: test-input
description: Action requiring an input
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: 
  - contract: note
    version: v1.0.0
    required: true
outputs: 
  - contract: note
    required: false
    version: v1.0.0
\`\`\`
`,
      'utf-8',
    );

    refreshResolver();

    const testAction = refreshResolver().resolveAction('test-input', 'v1.0.0');
    const run = runDir('20260131T120530-test');
    writeFileSync(
      join(run, 'output.md'),
      `---
contract: note
version: v1.0.0
action: test-input
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

No input referenced.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, testAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_INPUT_MISSING')).toBe(true);
  });

  it('reports input count below minimum', async () => {
    const actionDir = join(workspace, '.opencontract', 'actions', 'test-input-count');
    mkdirSync(actionDir, { recursive: true });
    writeFileSync(
      join(actionDir, 'SKILL.md'),
      `---
name: test-input-count
description: Action with minimum input count
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: 
  - contract: note
    required: false
    version: v1.0.0
    minCount: 2
outputs: 
  - contract: note
    required: false
    version: v1.0.0
\`\`\`
`,
      'utf-8',
    );

    refreshResolver();

    const testAction = refreshResolver().resolveAction('test-input-count', 'v1.0.0');
    const run = runDir('20260131T120530-test');
    const input = join(run, 'input.md');
    writeFileSync(
      input,
      `---
contract: note
version: v1.0.0
action: test-input-count
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Observation

Input note.
`,
      'utf-8',
    );
    writeFileSync(
      join(run, 'output.md'),
      `---
contract: note
version: v1.0.0
action: test-input-count
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: ["input.md"]
---

## Observation

Output referencing one input.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, testAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_INPUT_COUNT_LOW')).toBe(true);
  });

  it('reports an empty ActionRun directory', async () => {
    const run = runDir('20260131T120530-explore');

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ACTION_RUN_EMPTY')).toBe(true);
  });

  it('validates every output through the full Artifact pipeline', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md");
    writeFileSync(
      join(run, 'broken.md'),
      `---
contract: proposal
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:05:00Z"
inputs: []
---

## Why

Missing required sections.
`,
      'utf-8',
    );

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(false);
    // The broken output triggers SECTION_MISSING from the contract_structure phase.
    expect(result.errors.some((e) => e.code === 'SECTION_MISSING')).toBe(true);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs.filter((o) => !o.valid)).toHaveLength(1);
  });

  it('tolerates extra outputs beyond what the Action requires', async () => {
    const run = runDir('20260131T120530-explore');
    note(run, "note-1.md");
    note(run, "note-2.md");
    note(run, "note-3.md");

    const result = await validateActionRun(run, exploreAction, pipelineOptions());

    expect(result.valid).toBe(true);
    expect(result.outputs).toHaveLength(3);
  });
});
