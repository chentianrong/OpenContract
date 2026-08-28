import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateArtifact,
  validateDirectory,
  validateTarget,
  type PipelineOptions,
} from '../src/validation/pipeline.js';
import { DefinitionResolver } from '../src/definitions/resolver.js';
import { initWorkspace } from '../src/workspace/init.js';
import { requireWorkspace, resolvePaths } from '../src/workspace/discovery.js';
import { bundledSystemRoot } from '../src/resources.js';
import type { PhaseStatus, ValidationPhase, ValidationResult } from '../src/domain/types.js';

/**
 * Pipeline tests assert phase status as much as validity: the contract is that
 * a phase whose prerequisite failed reports `skipped`, not `failed`.
 */
describe('Validation pipeline', () => {
  let workspace: string;
  let artifactsRoot: string;
  let options: PipelineOptions;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'opencontract-pipeline-'));
    initWorkspace(workspace, { harnesses: [] });
    cpSync(bundledSystemRoot(), join(workspace, '.opencontract', 'system'), { recursive: true });

    const discovered = requireWorkspace(workspace);
    const paths = resolvePaths(discovered);
    artifactsRoot = paths.artifacts;

    options = {
      resolver: new DefinitionResolver(paths, discovered.config),
      workspaceRoot: paths.root,
      managedRoot: paths.artifacts,
      managedRoots: [paths.artifacts, paths.specs],
      trustedValidatorRoots: paths.trustedValidatorRoots,
      validatorRuntime: { pythonExecutable: 'python3', timeoutMs: 5_000, maxOutputBytes: 65_536 },
    };
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Writes an Artifact into a task/run directory under the artifacts root. */
  function writeArtifact(relativePath: string, content: string): string {
    const full = join(artifactsRoot, relativePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
    return full;
  }

  const RUN = '20260131T120000-task/20260131T120500-explore';

  function noteBody(inputs: string[] = []): string {
    return `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: ${JSON.stringify(inputs)}
---

## Observation

The cache key omitted the tenant id.
`;
  }

  function statusOf(result: ValidationResult, phase: ValidationPhase): PhaseStatus {
    return result.phases.find((p) => p.phase === phase)!.status;
  }

  it('validates a well-formed Artifact through every phase', async () => {
    const path = writeArtifact(`${RUN}/note.md`, noteBody());
    const result = await validateArtifact(path, options);

    expect(result.protocol).toBe('opencontract-validation');
    expect(result.version).toBe('v1.0.0');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(statusOf(result, 'parse')).toBe('passed');
    expect(statusOf(result, 'artifact_core')).toBe('passed');
    expect(statusOf(result, 'contract_structure')).toBe('passed');
    expect(statusOf(result, 'references')).toBe('passed');
    // The bundled note Contract declares no validator.
    expect(statusOf(result, 'semantic_validator')).toBe('skipped');
  });

  it('reports target metadata from the frontmatter', async () => {
    const path = writeArtifact(`${RUN}/note.md`, noteBody());
    const result = await validateArtifact(path, options);

    expect(result.target).toEqual({
      path,
      type: 'file',
      contract: 'note',
      contractVersion: 'v1.0.0',
      action: 'explore',
      actionVersion: 'v1.0.0',
    });
  });

  it('skips every later phase when parsing fails', async () => {
    const path = writeArtifact(`${RUN}/broken.md`, '## No frontmatter\n\nProse.\n');
    const result = await validateArtifact(path, options);

    expect(result.valid).toBe(false);
    expect(statusOf(result, 'parse')).toBe('failed');
    for (const phase of [
      'artifact_core',
      'contract_structure',
      'semantic_validator',
      'references',
    ] as const) {
      expect(statusOf(result, phase)).toBe('skipped');
    }
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].phase).toBe('parse');
  });

  it('fails artifact_core but still checks references', async () => {
    const path = writeArtifact(
      `${RUN}/note.md`,
      `---
contract: note
version: 1.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Observation

Text.
`,
    );
    const result = await validateArtifact(path, options);

    expect(result.valid).toBe(false);
    expect(statusOf(result, 'artifact_core')).toBe('failed');
    // YAML parses unquoted 1.0 as the number 1, so the error is type mismatch.
    expect(result.errors.some((e) => e.code === 'CORE_FIELD_INVALID')).toBe(true);
    // References do not depend on core metadata being valid.
    expect(statusOf(result, 'references')).toBe('passed');
  });

  it('marks contract_structure failed and semantic skipped when the Contract cannot resolve', async () => {
    const path = writeArtifact(
      `${RUN}/unknown.md`,
      `---
contract: no-such-contract
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Observation

Text.
`,
    );
    const result = await validateArtifact(path, options);

    expect(statusOf(result, 'contract_structure')).toBe('failed');
    expect(statusOf(result, 'semantic_validator')).toBe('skipped');
    const notFound = result.errors.find((e) => e.code === 'CONTRACT_NOT_FOUND');
    expect(notFound).toBeDefined();
    // An unresolvable Contract is a configuration fault, not a document defect.
    expect(result.valid).toBe(true);
  });

  it('reports a Contract structure violation as a content defect', async () => {
    const path = writeArtifact(
      `${RUN}/proposal.md`,
      `---
contract: proposal
version: v1.0.0
action: build
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Why

Reason.
`,
    );
    const result = await validateArtifact(path, options);

    expect(result.valid).toBe(false);
    expect(statusOf(result, 'contract_structure')).toBe('failed');
    expect(result.errors.some((e) => e.code === 'SECTION_MISSING')).toBe(true);
  });

  it('validates direct inputs without following their inputs', async () => {
    writeArtifact(`${RUN}/first.md`, noteBody());
    writeArtifact(`${RUN}/second.md`, noteBody(['first.md']));
    const third = writeArtifact(`${RUN}/third.md`, noteBody(['second.md']));

    const result = await validateArtifact(third, options);
    expect(result.valid).toBe(true);
    expect(statusOf(result, 'references')).toBe('passed');
  });

  it('reports a missing input in the references phase', async () => {
    const path = writeArtifact(`${RUN}/note.md`, noteBody(['absent.md']));
    const result = await validateArtifact(path, options);

    expect(result.valid).toBe(false);
    expect(statusOf(result, 'references')).toBe('failed');
    expect(result.errors.some((e) => e.code === 'REFERENCE_NOT_FOUND')).toBe(true);
  });

  it('detects a cycle only when recursive is requested', async () => {
    const a = writeArtifact(`${RUN}/a.md`, noteBody(['b.md']));
    writeArtifact(`${RUN}/b.md`, noteBody(['a.md']));

    const shallow = await validateArtifact(a, options);
    expect(shallow.errors.some((e) => e.code === 'REFERENCE_CYCLE')).toBe(false);

    const deep = await validateArtifact(a, { ...options, recursive: true });
    expect(deep.valid).toBe(false);
    expect(deep.errors.some((e) => e.code === 'REFERENCE_CYCLE')).toBe(true);
  });

  it('rejects an Artifact outside every managed root', async () => {
    const stray = join(workspace, 'stray.md');
    writeFileSync(stray, noteBody(), 'utf-8');

    const result = await validateArtifact(stray, options);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ARTIFACT_OUTSIDE_MANAGED_ROOT')).toBe(true);
  });

  it('aggregates a directory while keeping per-file results', async () => {
    writeArtifact(`${RUN}/good.md`, noteBody());
    writeArtifact(`${RUN}/also-good.md`, noteBody());
    writeArtifact(`${RUN}/bad.md`, '## No frontmatter\n');

    const result = await validateDirectory(artifactsRoot, options);

    expect(result.target.type).toBe('directory');
    expect(result.fileCount).toBe(3);
    expect(result.validCount).toBe(2);
    expect(result.valid).toBe(false);
    expect(result.results).toHaveLength(3);
    // Independent per-file detail is preserved.
    const bad = result.results.find((r) => r.target.path.endsWith('bad.md'))!;
    expect(bad.valid).toBe(false);
    expect(bad.errors[0].phase).toBe('parse');
  });

  it('reports a directory as valid when every file passes', async () => {
    writeArtifact(`${RUN}/one.md`, noteBody());
    writeArtifact(`${RUN}/two.md`, noteBody());

    const result = await validateDirectory(artifactsRoot, options);
    expect(result.valid).toBe(true);
    expect(result.validCount).toBe(2);
  });

  it('enumerates directory files in deterministic order', async () => {
    writeArtifact(`${RUN}/zebra.md`, noteBody());
    writeArtifact(`${RUN}/alpha.md`, noteBody());
    writeArtifact(`${RUN}/middle.md`, noteBody());

    const first = await validateDirectory(artifactsRoot, options);
    const second = await validateDirectory(artifactsRoot, options);

    const paths = (r: typeof first) => r.results.map((x) => x.target.path);
    expect(paths(first)).toEqual(paths(second));
    expect(paths(first)).toEqual([...paths(first)].sort());
  });

  it('dispatches on whether the target is a file or a directory', async () => {
    const file = writeArtifact(`${RUN}/note.md`, noteBody());

    const fileResult = await validateTarget(file, options);
    expect(fileResult.target.type).toBe('file');

    const dirResult = await validateTarget(artifactsRoot, options);
    expect(dirResult.target.type).toBe('directory');
  });

  it('runs a trusted semantic validator and folds in its findings', async () => {
    // Add a project Contract whose validator lives under the trusted system root.
    const contractDir = join(workspace, '.opencontract', 'contracts', 'checked');
    mkdirSync(contractDir, { recursive: true });
    const validatorDir = join(workspace, '.opencontract', 'system', 'validators');
    mkdirSync(validatorDir, { recursive: true });
    const entrypoint = join(validatorDir, 'checked.py');
    writeFileSync(
      entrypoint,
      `import json, sys
request = json.load(sys.stdin)
body = open(request["artifactPath"]).read()
errors = [] if "APPROVED" in body else [{"message": "Body must contain APPROVED"}]
print(json.dumps({
    "protocol": "opencontract-validator",
    "version": "v1.0.0",
    "valid": not errors,
    "errors": errors,
}))
`,
      'utf-8',
    );
    writeFileSync(
      join(contractDir, 'contract.md'),
      `---
name: checked
version: v1.0.0
artifactType: checked
artifactCoreVersion: v1.0.0
description: A Contract with a semantic validator
template: template.md
validator:
  runtime: python
  entrypoint: ../../system/validators/checked.py
---
`,
      'utf-8',
    );
    writeFileSync(
      join(contractDir, 'template.md'),
      `---
contract: checked
version: v1.0.0
action: execute
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---
`,
      'utf-8',
    );

    const checkedBody = (marker: string) => `---
contract: checked
version: v1.0.0
action: execute
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Result

${marker}
`;

    const failing = writeArtifact(`${RUN}/failing.md`, checkedBody('PENDING'));
    const failingResult = await validateArtifact(failing, options);
    expect(statusOf(failingResult, 'semantic_validator')).toBe('failed');
    expect(failingResult.valid).toBe(false);
    expect(failingResult.errors.some((e) => e.code === 'SEMANTIC_VIOLATION')).toBe(true);

    const passing = writeArtifact(`${RUN}/passing.md`, checkedBody('APPROVED'));
    const passingResult = await validateArtifact(passing, options);
    expect(statusOf(passingResult, 'semantic_validator')).toBe('passed');
    expect(passingResult.valid).toBe(true);
  });

  it('skips an untrusted validator without failing the document', async () => {
    // Same Contract, but the validator sits outside the trusted roots.
    const contractDir = join(workspace, '.opencontract', 'contracts', 'untrusted');
    mkdirSync(contractDir, { recursive: true });
    writeFileSync(join(contractDir, 'validator.py'), 'import sys\nsys.exit(0)\n', 'utf-8');
    writeFileSync(
      join(contractDir, 'contract.md'),
      `---
name: untrusted
version: v1.0.0
artifactType: untrusted
artifactCoreVersion: v1.0.0
description: Validator outside the trusted root
template: template.md
validator:
  runtime: python
  entrypoint: validator.py
---
`,
      'utf-8',
    );
    writeFileSync(join(contractDir, 'template.md'), '---\ncontract: untrusted\n---\n', 'utf-8');

    const path = writeArtifact(
      `${RUN}/untrusted.md`,
      `---
contract: untrusted
version: v1.0.0
action: execute
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Result

Text.
`,
    );

    const result = await validateArtifact(path, options);
    expect(statusOf(result, 'semantic_validator')).toBe('skipped');
    expect(result.errors.some((e) => e.code === 'VALIDATOR_UNTRUSTED')).toBe(true);
    // The trust failure describes configuration, so the document is not invalid.
    expect(result.valid).toBe(true);
  });
});
