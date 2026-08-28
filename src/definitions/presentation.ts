import type {
  ActionDefinition,
  ContractDefinition,
  ActionArtifactDeclaration,
} from '../domain/types.js';

/**
 * Presentation model for the `action list` table.
 */
export interface ActionListItem {
  name: string;
  version: string;
  source: string;
  description: string;
}

/**
 * Presentation model for `action inspect <name>`.
 */
export interface ActionInspectView {
  name: string;
  version: string;
  source: string;
  description: string;
  packagePath: string;
  skillPath: string;
  inputs: ActionArtifactDeclaration[];
  outputs: ActionArtifactDeclaration[];
}

/**
 * Presentation model for the `contract list` table.
 */
export interface ContractListItem {
  name: string;
  version: string;
  source: string;
  artifactType: string;
  description: string;
}

/**
 * Presentation model for `contract inspect <name>`.
 */
export interface ContractInspectView {
  name: string;
  version: string;
  source: string;
  artifactType: string;
  artifactCoreVersion: string;
  description: string;
  packagePath: string;
  contractPath: string;
  templatePath: string;
  hasVariants: boolean;
  hasValidator: boolean;
  hasFrontmatterSchema: boolean;
  requiredSections: string[];
}

export function toActionListItem(def: ActionDefinition): ActionListItem {
  return {
    name: def.name,
    version: def.version,
    source: def.source,
    description: def.description,
  };
}

export function toActionInspectView(def: ActionDefinition): ActionInspectView {
  return {
    name: def.name,
    version: def.version,
    source: def.source,
    description: def.description,
    packagePath: def.packagePath,
    skillPath: def.skillPath,
    inputs: def.inputs,
    outputs: def.outputs,
  };
}

export function toContractListItem(def: ContractDefinition): ContractListItem {
  return {
    name: def.name,
    version: def.version,
    source: def.source,
    artifactType: def.artifactType,
    description: def.description,
  };
}

export function toContractInspectView(def: ContractDefinition): ContractInspectView {
  return {
    name: def.name,
    version: def.version,
    source: def.source,
    artifactType: def.artifactType,
    artifactCoreVersion: def.artifactCoreVersion,
    description: def.description,
    packagePath: def.packagePath,
    contractPath: def.contractPath,
    templatePath: def.templatePath,
    hasVariants: def.variants.length > 0,
    hasValidator: def.validator !== undefined,
    hasFrontmatterSchema: def.rules.frontmatterSchema !== undefined,
    requiredSections: (def.rules.sections ?? [])
      .filter((s) => s.required)
      .map((s) => s.name),
  };
}
