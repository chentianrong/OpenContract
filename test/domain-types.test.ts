import { describe, it, expect } from 'vitest';
import type {
  WorkspaceConfig,
  ResolvedPaths,
  ActionDefinition,
  ContractDefinition,
  ArtifactMetadata,
  ValidationResult,
  ActionRunMetadata,
  SystemManifest,
  DoctorResult,
  DecisionMetadata,
} from '../src/domain/types.js';

/**
 * Domain types must round-trip through JSON without terminal-specific strings:
 * presentation formatting lives in src/presentation, not in the data model.
 */
function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const ANSI_OR_GLYPH = /\[|[✓✗→…]/;

function assertNoTerminalStrings(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(ANSI_OR_GLYPH);
}

describe('Domain type serialization', () => {
  it('round-trips a workspace configuration', () => {
    const config: WorkspaceConfig = {
      system: '.opencontract/system',
      cache: '.opencontract/cache',
      projectActions: '.opencontract/actions',
      projectContracts: '.opencontract/contracts',
      specs: 'opencontract/specs',
      artifacts: 'opencontract/artifacts',
      archive: 'opencontract/artifacts/archive',
      registries: ['vendor/registry'],
      trust: { validatorRoots: ['.opencontract/system'] },
      validator: { pythonExecutable: 'python3', timeoutMs: 5000, maxOutputBytes: 1_048_576 },
      overrides: { actions: { plan: 'project' }, contracts: { design: 'system' } },
      harnesses: ['codex', 'claude', 'cursor'],
    };

    expect(roundTrip(config)).toEqual(config);
    assertNoTerminalStrings(config);
  });

  it('round-trips resolved paths', () => {
    const paths: ResolvedPaths = {
      root: '/workspace',
      configPath: '/workspace/.opencontract/config.yaml',
      system: '/workspace/.opencontract/system',
      cache: '/workspace/.opencontract/cache',
      projectActions: '/workspace/.opencontract/actions',
      projectContracts: '/workspace/.opencontract/contracts',
      specs: '/workspace/opencontract/specs',
      artifacts: '/workspace/opencontract/artifacts',
      archive: '/workspace/opencontract/artifacts/archive',
      registries: ['/workspace/vendor/registry'],
      trustedValidatorRoots: ['/workspace/.opencontract/system'],
    };

    expect(roundTrip(paths)).toEqual(paths);
    assertNoTerminalStrings(paths);
  });

  it('round-trips Action and Contract definitions', () => {
    const action: ActionDefinition = {
      name: 'plan',
      version: 'v1.0.0',
      description: 'Produce a plan for a task.',
      source: 'system',
      packagePath: '/workspace/.opencontract/system/actions/plan',
      skillPath: '/workspace/.opencontract/system/actions/plan/SKILL.md',
      inputs: [{ contract: 'proposal', version: 'v1.0.0', required: true, minCount: 1 }],
      outputs: [
        { contract: 'tasks', version: 'v1.0.0', required: true, minCount: 1, maxCount: 1 },
      ],
    };

    const contract: ContractDefinition = {
      name: 'tasks',
      version: 'v1.0.0',
      artifactType: 'tasks',
      artifactCoreVersion: 'v1.0.0',
      description: 'An ordered, verifiable task list.',
      source: 'system',
      packagePath: '/workspace/.opencontract/system/contracts/tasks',
      contractPath: '/workspace/.opencontract/system/contracts/tasks/contract.md',
      templatePath: '/workspace/.opencontract/system/contracts/tasks/template.md',
      variants: [
        { name: 'minimal', path: '/workspace/.opencontract/system/contracts/tasks/minimal.md' },
      ],
      validator: {
        runtime: 'python',
        entrypoint: '/workspace/.opencontract/system/contracts/tasks/validator.py',
      },
      rules: {
        frontmatterSchema: { type: 'object', required: ['contract'] },
        sections: [{ name: 'Tasks', level: 2, required: true, minimumContent: 1 }],
      },
    };

    expect(roundTrip(action)).toEqual(action);
    expect(roundTrip(contract)).toEqual(contract);
    assertNoTerminalStrings(action);
    assertNoTerminalStrings(contract);
  });

  it('round-trips Artifact and Decision metadata', () => {
    const metadata: ArtifactMetadata = {
      contract: 'tasks',
      version: 'v1.0.0',
      action: 'plan',
      action_version: 'v1.0.0',
      created_at: '2026-01-31T12:00:00Z',
      inputs: ['../20260131T115900-explore/note.md'],
    };

    const decision: DecisionMetadata = {
      contract: 'decision',
      version: 'v1.0.0',
      action: 'clarify',
      action_version: 'v1.0.0',
      created_at: '2026-01-31T12:05:00Z',
      inputs: [],
      status: 'decided',
      decider: 'human',
      decided_at: '2026-01-31T12:06:00Z',
      selected_option: 'option-a',
    };

    expect(roundTrip(metadata)).toEqual(metadata);
    expect(roundTrip(decision)).toEqual(decision);
    assertNoTerminalStrings(metadata);
    assertNoTerminalStrings(decision);
  });

  it('round-trips a ValidationResult with phases, errors, and warnings', () => {
    const result: ValidationResult = {
      protocol: 'opencontract-validation',
      version: 'v1.0.0',
      target: {
        path: '/workspace/opencontract/artifacts/t/r/tasks.md',
        type: 'file',
        contract: 'tasks',
        contractVersion: 'v1.0.0',
        action: 'plan',
        actionVersion: 'v1.0.0',
      },
      valid: false,
      phases: [
        { phase: 'parse', status: 'passed', duration: 3 },
        { phase: 'artifact_core', status: 'passed' },
        { phase: 'contract_structure', status: 'failed' },
        { phase: 'semantic_validator', status: 'skipped' },
        { phase: 'references', status: 'skipped' },
      ],
      errors: [
        {
          code: 'SECTION_MISSING',
          phase: 'contract_structure',
          message: 'Required section "Tasks" is missing.',
          path: '/workspace/opencontract/artifacts/t/r/tasks.md',
          line: 12,
          column: 1,
          detail: 'level 2 heading',
          repairHint: 'Add the required heading and its content.',
        },
      ],
      warnings: [
        {
          code: 'MARKDOWN_LINK_BROKEN',
          phase: 'references',
          message: 'Link target does not exist.',
          path: '/workspace/opencontract/artifacts/t/r/tasks.md',
          line: 20,
        },
      ],
    };

    expect(roundTrip(result)).toEqual(result);
    assertNoTerminalStrings(result);
  });

  it('round-trips ActionRun, manifest, and doctor results', () => {
    const run: ActionRunMetadata = {
      directory: '/workspace/opencontract/artifacts/t/20260131T120000-plan-work',
      timestamp: '20260131T120000',
      description: 'plan-work',
      action: 'plan',
      actionVersion: 'v1.0.0',
      outputs: [],
      mergedInputs: ['../20260131T115900-explore/note.md'],
    };

    const manifest: SystemManifest = {
      version: '1.0.0',
      installedAt: '2026-01-31T12:00:00Z',
      actions: [{ name: 'plan', version: 'v1.0.0', packagePath: 'actions/plan' }],
      contracts: [{ name: 'tasks', version: 'v1.0.0', packagePath: 'contracts/tasks' }],
    };

    const doctor: DoctorResult = {
      healthy: false,
      checks: [
        { component: 'configuration', healthy: true, message: 'Configuration is valid.' },
        {
          component: 'adapters',
          healthy: false,
          message: 'The Cursor adapter is stale.',
          repairHint: 'Run `opencontract update` to refresh generated adapters.',
        },
      ],
    };

    expect(roundTrip(run)).toEqual(run);
    expect(roundTrip(manifest)).toEqual(manifest);
    expect(roundTrip(doctor)).toEqual(doctor);
    assertNoTerminalStrings(run);
    assertNoTerminalStrings(manifest);
    assertNoTerminalStrings(doctor);
  });
});
