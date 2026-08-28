import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefinitionResolver } from '../src/definitions/resolver.js';
import { initWorkspace } from '../src/workspace/init.js';
import { requireWorkspace, resolvePaths } from '../src/workspace/discovery.js';
import { OpenContractError } from '../src/domain/errors.js';

describe('Definition resolver', () => {
  let tempDir: string;
  let resolver: DefinitionResolver;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
    initWorkspace(tempDir, { harnesses: [] });
    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);
    resolver = new DefinitionResolver(paths, workspace.config);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createAction(source: 'project' | 'system', name: string, version: string) {
    const dir =
      source === 'project' ? '.opencontract/actions' : '.opencontract/system/actions';
    const packagePath = join(tempDir, dir, name);
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'SKILL.md'),
      `---
name: ${name}
description: ${name} action
metadata:
  version: ${version}
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );
  }

  function createContract(source: 'project' | 'system', name: string, version: string) {
    const dir =
      source === 'project' ? '.opencontract/contracts' : '.opencontract/system/contracts';
    const packagePath = join(tempDir, dir, name);
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: ${name}
version: ${version}
artifactType: ${name}
artifactCoreVersion: v1.0.0
template: template.md
---
`,
    );
    writeFileSync(join(packagePath, 'template.md'), '');
  }

  it('resolves an Action from system source', () => {
    createAction('system', 'plan', 'v1.0.0');
    const action = resolver.resolveAction('plan', 'v1.0.0');
    expect(action.name).toBe('plan');
    expect(action.version).toBe('v1.0.0');
    expect(action.source).toBe('system');
  });

  it('resolves a Contract from project source', () => {
    createContract('project', 'custom', 'v2.0.0');
    const contract = resolver.resolveContract('custom', 'v2.0.0');
    expect(contract.name).toBe('custom');
    expect(contract.version).toBe('v2.0.0');
    expect(contract.source).toBe('project');
  });

  it('throws ACTION_NOT_FOUND for missing Action', () => {
    expect(() => resolver.resolveAction('missing', 'v1.0.0')).toThrow(OpenContractError);
    try {
      resolver.resolveAction('missing', 'v1.0.0');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_NOT_FOUND');
    }
  });

  it('throws CONTRACT_NOT_FOUND for missing Contract', () => {
    expect(() => resolver.resolveContract('missing', 'v1.0.0')).toThrow(OpenContractError);
    try {
      resolver.resolveContract('missing', 'v1.0.0');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONTRACT_NOT_FOUND');
    }
  });

  it('throws INVALID_VERSION_REFERENCE for non-exact version', () => {
    expect(() => resolver.resolveAction('plan', 'latest')).toThrow(OpenContractError);
    try {
      resolver.resolveAction('plan', 'latest');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('INVALID_VERSION_REFERENCE');
    }

    expect(() => resolver.resolveAction('plan', '1.0.0')).toThrow(OpenContractError);
    expect(() => resolver.resolveAction('plan', 'v1.0')).toThrow(OpenContractError);
  });

  it('throws DEFINITION_SOURCE_CONFLICT when same definition exists in multiple sources', () => {
    createAction('project', 'plan', 'v1.0.0');
    createAction('system', 'plan', 'v1.0.0');
    resolver.clearCache();

    expect(() => resolver.resolveAction('plan', 'v1.0.0')).toThrow(OpenContractError);
    try {
      resolver.resolveAction('plan', 'v1.0.0');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('DEFINITION_SOURCE_CONFLICT');
      expect(err.message).toContain('project');
      expect(err.message).toContain('system');
    }
  });

  it('resolves with explicit override when sources conflict', () => {
    createAction('project', 'plan', 'v1.0.0');
    createAction('system', 'plan', 'v1.0.0');

    // Recreate resolver with override config
    const workspace = requireWorkspace(tempDir);
    workspace.config.overrides = { actions: { plan: 'project' }, contracts: {} };
    const paths = resolvePaths(workspace);
    resolver = new DefinitionResolver(paths, workspace.config);

    const action = resolver.resolveAction('plan', 'v1.0.0');
    expect(action.source).toBe('project');
  });

  it('throws DEFINITION_OVERRIDE_INVALID when override selects non-existent source', () => {
    createAction('system', 'plan', 'v1.0.0');

    const workspace = requireWorkspace(tempDir);
    workspace.config.overrides = { actions: { plan: 'project' }, contracts: {} };
    const paths = resolvePaths(workspace);
    resolver = new DefinitionResolver(paths, workspace.config);

    expect(() => resolver.resolveAction('plan', 'v1.0.0')).toThrow(OpenContractError);
    try {
      resolver.resolveAction('plan', 'v1.0.0');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('DEFINITION_OVERRIDE_INVALID');
    }
  });

  it('lists all available Actions', () => {
    createAction('system', 'plan', 'v1.0.0');
    createAction('system', 'execute', 'v1.0.0');
    createAction('project', 'custom', 'v2.0.0');

    const actions = resolver.listActions();
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.name).sort()).toEqual(['custom', 'execute', 'plan']);
  });

  it('lists all available Contracts', () => {
    createContract('system', 'tasks', 'v1.0.0');
    createContract('system', 'proposal', 'v1.0.0');
    createContract('project', 'custom', 'v1.0.0');

    const contracts = resolver.listContracts();
    expect(contracts).toHaveLength(3);
    expect(contracts.map((c) => c.name).sort()).toEqual(['custom', 'proposal', 'tasks']);
  });

  it('resolves different versions of the same definition independently', () => {
    createAction('system', 'plan', 'v1.0.0');
    createAction('project', 'plan', 'v2.0.0');
    resolver.clearCache();

    const v1 = resolver.resolveAction('plan', 'v1.0.0');
    const v2 = resolver.resolveAction('plan', 'v2.0.0');

    expect(v1.version).toBe('v1.0.0');
    expect(v1.source).toBe('system');
    expect(v2.version).toBe('v2.0.0');
    expect(v2.source).toBe('project');
  });

  it('caches enumeration results', () => {
    createAction('system', 'plan', 'v1.0.0');
    const first = resolver.listActions();
    const second = resolver.listActions();
    // Cache hit returns the same content without re-enumerating
    expect(second.map((a) => a.name)).toEqual(['plan']);
    expect(first).toEqual(second);
  });

  it('clearCache forces re-enumeration', () => {
    createAction('system', 'plan', 'v1.0.0');
    resolver.listActions();
    createAction('system', 'execute', 'v1.0.0'); // Add after first enumeration
    const beforeClear = resolver.listActions();
    expect(beforeClear.map((a) => a.name).sort()).toEqual(['plan']); // Cached, doesn't see execute

    resolver.clearCache();
    const afterClear = resolver.listActions();
    expect(afterClear.map((a) => a.name).sort()).toEqual(['execute', 'plan']); // Re-enumerated
  });
});
