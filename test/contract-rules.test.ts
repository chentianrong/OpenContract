import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarkdown } from '../src/markdown/parser.js';
import { validateContractRules } from '../src/validation/contract-rules.js';
import type { ContractDefinition } from '../src/domain/types.js';

describe('Contract rules validation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-rules-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function validate(content: string, contract: ContractDefinition) {
    const path = join(tempDir, 'artifact.md');
    writeFileSync(path, content, 'utf-8');
    return validateContractRules(parseMarkdown(path), contract);
  }

  function codes(content: string, contract: ContractDefinition): string[] {
    return validate(content, contract).map((e) => e.code);
  }

  const baseContract: ContractDefinition = {
    name: 'note',
    version: 'v1.0.0',
    artifactType: 'note',
    artifactCoreVersion: 'v1.0.0',
    description: 'A test Contract',
    source: 'system',
    packagePath: '/tmp/note',
    contractPath: '/tmp/note/contract.md',
    templatePath: '/tmp/note/template.md',
    rules: {},
  };

  it('passes when no rules are declared', () => {
    expect(
      validate(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Anything Goes

Prose.
`,
        baseContract,
      ),
    ).toEqual([]);
  });

  it('validates frontmatter against a JSON Schema', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        frontmatterSchema: {
          type: 'object',
          required: ['priority'],
          properties: {
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
    };

    expect(
      codes(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---
`,
        contract,
      ),
    ).toContain('SCHEMA_VIOLATION');

    expect(
      validate(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
priority: medium
---
`,
        contract,
      ),
    ).toEqual([]);
  });

  it('reports a missing required section', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true }],
      },
    };

    expect(
      codes(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Other Section
`,
        contract,
      ),
    ).toContain('SECTION_MISSING');
  });

  it('reports wrong heading level', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true }],
      },
    };

    const found = codes(
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

### Findings
`,
      contract,
    );
    expect(found).toContain('SECTION_LEVEL_INVALID');
  });

  it('reports insufficient content in a section', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true, minimumContent: 10 }],
      },
    };

    expect(
      codes(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

abc
`,
        contract,
      ),
    ).toContain('SECTION_EMPTY');

    expect(
      validate(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

abcdefghij
`,
        contract,
      ),
    ).toEqual([]);
  });

  it('reports misordered sections', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [
          { name: 'Problem', level: 2, required: true },
          { name: 'Solution', level: 2, required: true },
        ],
      },
    };

    const found = validate(
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Solution

Text.

## Problem

Text.
`,
      contract,
    );
    expect(found.map((e) => e.code)).toContain('SECTION_MISORDERED');
    expect(found.find((e) => e.code === 'SECTION_MISORDERED')!.detail).toContain('Problem, Solution');
  });

  it('rejects unexpected sections when allowExtraSections is false', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true }],
        allowExtraSections: false,
      },
    };

    const found = codes(
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

Text.

## Unrelated

More text.
`,
      contract,
    );
    expect(found).toContain('SECTION_UNEXPECTED');
  });

  it('allows extra sections by default', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true }],
      },
    };

    expect(
      validate(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

Text.

## Extra

More text.
`,
        contract,
      ),
    ).toEqual([]);
  });

  it('enforces occurrence bounds', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Item', level: 2, required: false, minOccurrences: 2, maxOccurrences: 3 }],
      },
    };

    expect(
      codes(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Item

One
`,
        contract,
      ),
    ).toContain('SECTION_MISSING');

    expect(
      codes(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Item
One
## Item
Two
## Item
Three
## Item
Four
`,
        contract,
      ),
    ).toContain('SECTION_DUPLICATE');

    expect(
      validate(
        `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Item
One
## Item
Two
`,
        contract,
      ),
    ).toEqual([]);
  });

  it('anchors every error to contract_structure phase with repair hints', () => {
    const contract: ContractDefinition = {
      ...baseContract,
      rules: {
        sections: [{ name: 'Findings', level: 2, required: true }],
      },
    };

    for (const err of validate(
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---
`,
      contract,
    )) {
      expect(err.phase).toBe('contract_structure');
      expect(err.repairHint.length).toBeGreaterThan(0);
    }
  });
});
