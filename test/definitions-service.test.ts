import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefinitionQueryService } from '../src/definitions/service.js';
import { DefinitionResolver } from '../src/definitions/resolver.js';
import { initWorkspace } from '../src/workspace/init.js';
import { requireWorkspace, resolvePaths } from '../src/workspace/discovery.js';
import { bundledSystemRoot } from '../src/resources.js';
import { OpenContractError } from '../src/domain/errors.js';

/**
 * Inspection runs against the real bundled catalog so the views reflect what
 * ships, and so a catalog change that breaks inspection is caught here.
 */
describe('Definition query service', () => {
  let tempDir: string;
  let service: DefinitionQueryService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-query-'));
    initWorkspace(tempDir, { harnesses: [], localSystem: true });
    // Install the bundled system tree the way `init`/`update` will.
    cpSync(bundledSystemRoot(), join(tempDir, '.opencontract', 'system'), { recursive: true });

    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);
    service = new DefinitionQueryService(new DefinitionResolver(paths, workspace.config));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists Actions sorted by name with source and exact version', () => {
    const actions = service.listActions();

    expect(actions).toHaveLength(13);
    expect(actions.map((a) => a.name)).toEqual([...actions.map((a) => a.name)].sort());
    for (const action of actions) {
      expect(action.version).toBe('v1.0.0');
      expect(action.source).toBe('system');
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it('lists Contracts sorted by name with artifact type', () => {
    const contracts = service.listContracts();

    expect(contracts).toHaveLength(14);
    expect(contracts.map((c) => c.name)).toEqual([...contracts.map((c) => c.name)].sort());
    const tasks = contracts.find((c) => c.name === 'tasks');
    expect(tasks?.artifactType).toBe('tasks');
    expect(tasks?.version).toBe('v1.0.0');
    expect(tasks?.source).toBe('system');
  });

  it('exposes declared inputs and outputs when inspecting an Action', () => {
    const plan = service.inspectAction('plan', 'v1.0.0');

    expect(plan.name).toBe('plan');
    expect(plan.version).toBe('v1.0.0');
    expect(plan.source).toBe('system');
    expect(plan.skillPath.endsWith('SKILL.md')).toBe(true);

    const proposal = plan.inputs.find((i) => i.contract === 'proposal');
    expect(proposal).toBeDefined();
    expect(proposal?.required).toBe(true);
    expect(proposal?.version).toBe('v1.0.0');

    const tasks = plan.outputs.find((o) => o.contract === 'tasks');
    expect(tasks).toBeDefined();
    expect(tasks?.required).toBe(true);
    expect(tasks?.maxCount).toBe(1);
  });

  it('exposes rule summaries when inspecting a Contract', () => {
    const view = service.inspectContract('proposal', 'v1.0.0');

    expect(view.name).toBe('proposal');
    expect(view.artifactCoreVersion).toBe('v1.0.0');
    expect(view.hasFrontmatterSchema).toBe(true);
    expect(view.requiredSections).toEqual(['Why', 'What Changes', 'Impact']);
    expect(view.templatePath.endsWith('template.md')).toBe(true);
  });

  it('reports a not-found Action rather than selecting another version', () => {
    try {
      service.inspectAction('plan', 'v9.9.9');
      expect.unreachable('expected ACTION_NOT_FOUND');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_NOT_FOUND');
    }

    try {
      service.inspectAction('no-such-action', 'v1.0.0');
      expect.unreachable('expected ACTION_NOT_FOUND');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_NOT_FOUND');
    }
  });

  it('reports a not-found Contract rather than selecting another version', () => {
    try {
      service.inspectContract('tasks', 'v2.0.0');
      expect.unreachable('expected CONTRACT_NOT_FOUND');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONTRACT_NOT_FOUND');
    }
  });

  it('rejects inexact version references on inspection', () => {
    for (const version of ['latest', '1.0.0', 'v1.0', '^1.0.0']) {
      try {
        service.inspectAction('plan', version);
        expect.unreachable(`expected INVALID_VERSION_REFERENCE for ${version}`);
      } catch (err) {
        expect((err as OpenContractError).code).toBe('INVALID_VERSION_REFERENCE');
      }
    }
  });

  it('returns presentation data without executing an Action', () => {
    // The views are plain data: no functions, no file handles, JSON-round-trippable.
    const view = service.inspectAction('execute', 'v1.0.0');
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
