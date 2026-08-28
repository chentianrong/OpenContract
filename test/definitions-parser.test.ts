import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseActionDefinition,
  parseContractDefinition,
  enumerateActions,
  enumerateContracts,
} from '../src/definitions/parser.js';
import { OpenContractError } from '../src/domain/errors.js';

describe('Action definition parser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses a valid Action SKILL.md', () => {
    const packagePath = join(tempDir, 'plan');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: plan
description: Produce a task plan.
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs:
    - contract: proposal
      version: v1.0.0
      required: true
  outputs:
    - contract: tasks
      version: v1.0.0
      required: true
      minCount: 1
      maxCount: 1
\`\`\`
# Plan Action
`,
    );

    const action = parseActionDefinition(skillPath, 'system');
    expect(action.name).toBe('plan');
    expect(action.version).toBe('v1.0.0');
    expect(action.description).toBe('Produce a task plan.');
    expect(action.source).toBe('system');
    expect(action.inputs).toHaveLength(1);
    expect(action.inputs[0].contract).toBe('proposal');
    expect(action.inputs[0].version).toBe('v1.0.0');
    expect(action.inputs[0].required).toBe(true);
    expect(action.outputs).toHaveLength(1);
    expect(action.outputs[0].contract).toBe('tasks');
    expect(action.outputs[0].minCount).toBe(1);
    expect(action.outputs[0].maxCount).toBe(1);
  });

  it('rejects Action with mismatched directory and name', () => {
    const packagePath = join(tempDir, 'plan');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: different-name
description: Mismatch
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );

    expect(() => parseActionDefinition(skillPath, 'system')).toThrow(OpenContractError);
    try {
      parseActionDefinition(skillPath, 'system');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_METADATA_INVALID');
    }
  });

  it('rejects Action with non-kebab-case name', () => {
    const packagePath = join(tempDir, 'PlanAction');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: PlanAction
description: Non-kebab
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );

    expect(() => parseActionDefinition(skillPath, 'system')).toThrow(OpenContractError);
    try {
      parseActionDefinition(skillPath, 'system');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_METADATA_INVALID');
    }
  });

  it('rejects Action with invalid version', () => {
    const packagePath = join(tempDir, 'plan');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: plan
description: Invalid version
metadata:
  version: 1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );

    expect(() => parseActionDefinition(skillPath, 'system')).toThrow(OpenContractError);
    try {
      parseActionDefinition(skillPath, 'system');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_METADATA_INVALID');
      expect(err.message).toContain('vX.Y.Z');
    }
  });

  it('parses Actions with empty inputs and outputs', () => {
    const packagePath = join(tempDir, 'explore');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: explore
description: Unstructured exploration
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );

    const action = parseActionDefinition(skillPath, 'system');
    expect(action.inputs).toEqual([]);
    expect(action.outputs).toEqual([]);
  });

  it('rejects an Action with no opencontract fence', () => {
    const packagePath = join(tempDir, 'plan');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: plan
description: No declaration block
metadata:
  version: v1.0.0
---
# Plan Action

Prose only, with no machine-readable declaration.
`,
    );

    try {
      parseActionDefinition(skillPath, 'system');
      expect.unreachable('expected a missing-declaration failure');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_METADATA_INVALID');
      expect((err as OpenContractError).message).toContain('opencontract');
    }
  });

  it('accepts a flat opencontract fence without the nested key', () => {
    const packagePath = join(tempDir, 'report');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: report
description: Flat declaration form
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs:
  - contract: tasks
    version: v1.0.0
    required: false
outputs:
  - contract: report
    version: v1.0.0
    required: true
    minCount: 1
\`\`\`
`,
    );

    const action = parseActionDefinition(skillPath, 'system');
    expect(action.inputs[0].contract).toBe('tasks');
    expect(action.inputs[0].required).toBe(false);
    expect(action.outputs[0].contract).toBe('report');
    expect(action.outputs[0].minCount).toBe(1);
  });

  it('rejects a declaration with a non-exact contract version', () => {
    const packagePath = join(tempDir, 'plan');
    mkdirSync(packagePath, { recursive: true });
    const skillPath = join(packagePath, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: plan
description: Range version
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
inputs: []
outputs:
  - contract: tasks
    version: ^1.0.0
    required: true
\`\`\`
`,
    );

    try {
      parseActionDefinition(skillPath, 'system');
      expect.unreachable('expected a version failure');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('ACTION_METADATA_INVALID');
      expect((err as OpenContractError).message).toContain('vX.Y.Z');
    }
  });

  it('enumerates Actions from a directory', () => {
    mkdirSync(join(tempDir, 'plan'), { recursive: true });
    mkdirSync(join(tempDir, 'execute'), { recursive: true });
    writeFileSync(
      join(tempDir, 'plan', 'SKILL.md'),
      `---
name: plan
description: Plan
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );
    writeFileSync(
      join(tempDir, 'execute', 'SKILL.md'),
      `---
name: execute
description: Execute
metadata:
  version: v1.0.0
---

\`\`\`yaml opencontract
opencontract:
  inputs: []
  outputs: []
\`\`\`
`,
    );

    const actions = enumerateActions(tempDir, 'system');
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.name).sort()).toEqual(['execute', 'plan']);
  });
});

describe('Contract definition parser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses a valid Contract package', () => {
    const packagePath = join(tempDir, 'tasks');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: tasks
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
description: An ordered task list
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version]
  sections:
    - name: Tasks
      level: 2
      required: true
      minimumContent: 1
---
# Tasks Contract
`,
    );
    writeFileSync(join(packagePath, 'template.md'), '---\ncontract: tasks\n---\n## Tasks\n');

    const contract = parseContractDefinition(packagePath, 'system');
    expect(contract.name).toBe('tasks');
    expect(contract.version).toBe('v1.0.0');
    expect(contract.artifactType).toBe('tasks');
    expect(contract.artifactCoreVersion).toBe('v1.0.0');
    expect(contract.description).toBe('An ordered task list');
    expect(contract.source).toBe('system');
    expect(contract.templatePath).toBe(join(packagePath, 'template.md'));
    expect(contract.rules.sections).toHaveLength(1);
    expect(contract.rules.sections![0].name).toBe('Tasks');
    expect(contract.rules.sections![0].level).toBe(2);
    expect(contract.rules.sections![0].required).toBe(true);
  });

  it('rejects Contract with mismatched directory and name', () => {
    const packagePath = join(tempDir, 'tasks');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: different
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
template: template.md
---
`,
    );
    writeFileSync(join(packagePath, 'template.md'), '');

    expect(() => parseContractDefinition(packagePath, 'system')).toThrow(OpenContractError);
    try {
      parseContractDefinition(packagePath, 'system');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONTRACT_METADATA_INVALID');
    }
  });

  it('rejects Contract with missing template', () => {
    const packagePath = join(tempDir, 'tasks');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: tasks
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
template: missing.md
---
`,
    );

    expect(() => parseContractDefinition(packagePath, 'system')).toThrow(OpenContractError);
    try {
      parseContractDefinition(packagePath, 'system');
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONTRACT_TEMPLATE_MISSING');
    }
  });

  it('parses template variants', () => {
    const packagePath = join(tempDir, 'specification');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: specification
version: v1.0.0
artifactType: specification
artifactCoreVersion: v1.0.0
template: template.md
variants:
  - name: minimal
    file: minimal.md
  - name: detailed
    file: detailed.md
---
`,
    );
    writeFileSync(join(packagePath, 'template.md'), '');
    writeFileSync(join(packagePath, 'minimal.md'), '');
    writeFileSync(join(packagePath, 'detailed.md'), '');

    const contract = parseContractDefinition(packagePath, 'system');
    expect(contract.variants).toHaveLength(2);
    expect(contract.variants[0].name).toBe('minimal');
    expect(contract.variants[1].name).toBe('detailed');
  });

  it('parses validator declaration', () => {
    const packagePath = join(tempDir, 'tasks');
    mkdirSync(packagePath, { recursive: true });
    writeFileSync(
      join(packagePath, 'contract.md'),
      `---
name: tasks
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
template: template.md
validator:
  runtime: python
  entrypoint: validator.py
---
`,
    );
    writeFileSync(join(packagePath, 'template.md'), '');
    writeFileSync(join(packagePath, 'validator.py'), '#!/usr/bin/env python3\n');

    const contract = parseContractDefinition(packagePath, 'system');
    expect(contract.validator).toBeDefined();
    expect(contract.validator!.runtime).toBe('python');
    expect(contract.validator!.entrypoint).toBe(join(packagePath, 'validator.py'));
  });

  it('enumerates Contracts from a directory', () => {
    mkdirSync(join(tempDir, 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, 'proposal'), { recursive: true });
    writeFileSync(
      join(tempDir, 'tasks', 'contract.md'),
      `---
name: tasks
version: v1.0.0
artifactType: tasks
artifactCoreVersion: v1.0.0
template: template.md
---
`,
    );
    writeFileSync(join(tempDir, 'tasks', 'template.md'), '');
    writeFileSync(
      join(tempDir, 'proposal', 'contract.md'),
      `---
name: proposal
version: v1.0.0
artifactType: proposal
artifactCoreVersion: v1.0.0
template: template.md
---
`,
    );
    writeFileSync(join(tempDir, 'proposal', 'template.md'), '');

    const contracts = enumerateContracts(tempDir, 'system');
    expect(contracts).toHaveLength(2);
    expect(contracts.map((c) => c.name).sort()).toEqual(['proposal', 'tasks']);
  });
});
