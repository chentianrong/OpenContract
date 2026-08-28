import type { ActionDefinition, ContractDefinition } from '../domain/types.js';

/**
 * Presentation for `action list/inspect` and `contract list/inspect`.
 *
 * Listings are aligned tables sorted by name; inspection shows the declared
 * contracts and rules that validation will actually enforce, so a reader can
 * predict what `validate` will check before running it.
 */

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function table(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  return rows.map((row) =>
    row
      .map((cell, column) => (column === row.length - 1 ? cell : pad(cell, widths[column])))
      .join('  ')
      .trimEnd(),
  );
}

export function renderActionListHuman(actions: ActionDefinition[]): string {
  if (actions.length === 0) {
    return 'No Actions installed. Run `opencontract update` to install the system tree.';
  }

  const sorted = [...actions].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [`${sorted.length} Action(s):`, ''];
  lines.push(
    ...table([
      ['NAME', 'VERSION', 'SOURCE', 'DESCRIPTION'],
      ...sorted.map((a) => [a.name, a.version, a.source, a.description]),
    ]).map((row) => `  ${row}`),
  );
  return lines.join('\n');
}

export function renderActionListJson(actions: ActionDefinition[]): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-action-list',
      version: 'v1.0.0',
      actions: [...actions]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({
          name: a.name,
          version: a.version,
          source: a.source,
          description: a.description,
          inputs: a.inputs,
          outputs: a.outputs,
        })),
    },
    null,
    2,
  );
}

function renderDeclarations(
  label: string,
  declarations: ActionDefinition['inputs'],
): string[] {
  if (declarations.length === 0) {
    return [`  ${label}: none`];
  }
  const lines = [`  ${label}:`];
  for (const declaration of declarations) {
    const bounds: string[] = [];
    if (declaration.required) bounds.push('required');
    if (declaration.minCount !== undefined) bounds.push(`min ${declaration.minCount}`);
    if (declaration.maxCount !== undefined) bounds.push(`max ${declaration.maxCount}`);
    const suffix = bounds.length > 0 ? ` (${bounds.join(', ')})` : '';
    lines.push(`    ${declaration.contract}@${declaration.version}${suffix}`);
  }
  return lines;
}

export function renderActionInspectHuman(action: ActionDefinition): string {
  return [
    `${action.name}@${action.version}`,
    `  source:      ${action.source}`,
    `  description: ${action.description}`,
    `  skill:       ${action.skillPath}`,
    '',
    ...renderDeclarations('inputs', action.inputs),
    '',
    ...renderDeclarations('outputs', action.outputs),
  ].join('\n');
}

export function renderActionInspectJson(action: ActionDefinition): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-action',
      version: 'v1.0.0',
      action: {
        name: action.name,
        version: action.version,
        source: action.source,
        description: action.description,
        skillPath: action.skillPath,
        inputs: action.inputs,
        outputs: action.outputs,
      },
    },
    null,
    2,
  );
}

export function renderContractListHuman(contracts: ContractDefinition[]): string {
  if (contracts.length === 0) {
    return 'No Contracts installed. Run `opencontract update` to install the system tree.';
  }

  const sorted = [...contracts].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [`${sorted.length} Contract(s):`, ''];
  lines.push(
    ...table([
      ['NAME', 'VERSION', 'SOURCE', 'VALIDATOR', 'DESCRIPTION'],
      ...sorted.map((c) => [
        c.name,
        c.version,
        c.source,
        c.validator ? c.validator.runtime : '-',
        c.description,
      ]),
    ]).map((row) => `  ${row}`),
  );
  return lines.join('\n');
}

export function renderContractListJson(contracts: ContractDefinition[]): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-contract-list',
      version: 'v1.0.0',
      contracts: [...contracts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          name: c.name,
          version: c.version,
          source: c.source,
          artifactType: c.artifactType,
          description: c.description,
          hasValidator: c.validator !== undefined,
          variants: c.variants.map((v) => v.name),
        })),
    },
    null,
    2,
  );
}

export function renderContractInspectHuman(contract: ContractDefinition): string {
  const lines = [
    `${contract.name}@${contract.version}`,
    `  source:        ${contract.source}`,
    `  artifact type: ${contract.artifactType}`,
    `  core version:  ${contract.artifactCoreVersion}`,
    `  description:   ${contract.description}`,
    `  template:      ${contract.templatePath}`,
  ];

  if (contract.variants.length > 0) {
    lines.push(`  variants:      ${contract.variants.map((v) => v.name).join(', ')}`);
  }
  lines.push(
    `  validator:     ${contract.validator ? `${contract.validator.runtime} (${contract.validator.entrypoint})` : 'none'}`,
  );

  const sections = contract.rules.sections ?? [];
  lines.push('');
  if (sections.length === 0) {
    lines.push('  sections: none declared');
  } else {
    lines.push('  sections:');
    for (const section of sections) {
      const flags = [section.required ? 'required' : 'optional'];
      if (section.minimumContent !== undefined) {
        flags.push(`min content ${section.minimumContent}`);
      }
      lines.push(`    ${'#'.repeat(section.level)} ${section.name} (${flags.join(', ')})`);
    }
  }

  lines.push('');
  lines.push(
    `  frontmatter schema: ${contract.rules.frontmatterSchema ? 'declared' : 'none'}`,
  );

  return lines.join('\n');
}

export function renderContractInspectJson(contract: ContractDefinition): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-contract',
      version: 'v1.0.0',
      contract: {
        name: contract.name,
        version: contract.version,
        source: contract.source,
        artifactType: contract.artifactType,
        artifactCoreVersion: contract.artifactCoreVersion,
        description: contract.description,
        templatePath: contract.templatePath,
        variants: contract.variants,
        rules: contract.rules,
        validator: contract.validator,
      },
    },
    null,
    2,
  );
}
