import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { parse as parseYaml } from 'yaml';
import { OpenContractError } from '../domain/errors.js';
import type {
  ActionDefinition,
  ActionArtifactDeclaration,
  ContractDefinition,
  DefinitionSource,
  SectionRule,
  TemplateVariant,
  ValidatorDeclaration,
} from '../domain/types.js';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

/**
 * Parse an Action definition from a SKILL.md file. The directory name must
 * match the frontmatter `name`, and the frontmatter must declare `description`,
 * exact `metadata.version`, and a parseable `yaml opencontract` block.
 */
export function parseActionDefinition(
  skillPath: string,
  source: DefinitionSource,
): ActionDefinition {
  if (!existsSync(skillPath)) {
    throw new OpenContractError('ACTION_METADATA_INVALID', 'SKILL.md does not exist.', {
      path: skillPath,
    });
  }

  const packagePath = join(skillPath, '..');
  const expectedName = basename(packagePath);

  let frontmatter: Record<string, unknown>;
  let body: string;
  try {
    const raw = readFileSync(skillPath, 'utf-8');
    const parsed = matter(raw);
    frontmatter = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (cause) {
    throw new OpenContractError('ACTION_METADATA_INVALID', 'Failed to parse SKILL.md frontmatter.', {
      path: skillPath,
      cause,
    });
  }

  const name = frontmatter.name;
  if (typeof name !== 'string' || name !== expectedName) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      `Directory name "${expectedName}" does not match frontmatter name "${name}".`,
      { path: skillPath },
    );
  }

  if (!isKebabCase(name)) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      `Action name "${name}" is not lowercase kebab-case.`,
      { path: skillPath },
    );
  }

  const description = frontmatter.description;
  if (typeof description !== 'string' || !description) {
    throw new OpenContractError('ACTION_METADATA_INVALID', 'Missing or invalid description.', {
      path: skillPath,
    });
  }

  const metadata = frontmatter.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new OpenContractError('ACTION_METADATA_INVALID', 'Missing or invalid metadata.', {
      path: skillPath,
    });
  }

  const metadataObj = metadata as Record<string, unknown>;
  const version = metadataObj.version;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      `Action version must be an exact vX.Y.Z; got "${version}".`,
      { path: skillPath },
    );
  }

  const ocObj = extractOpenContractBlock(body, skillPath);
  const inputs = parseActionArtifacts(ocObj.inputs, 'inputs', skillPath);
  const outputs = parseActionArtifacts(ocObj.outputs, 'outputs', skillPath);

  return {
    name,
    version,
    description,
    source,
    packagePath,
    skillPath,
    inputs,
    outputs,
  };
}

/**
 * Extract the machine-readable declaration from the Skill body. Standard Skill
 * files keep their frontmatter minimal, so the OpenContract declaration lives
 * in a fenced ```yaml opencontract block rather than a frontmatter key.
 *
 * Both a flat mapping (`inputs:`/`outputs:` at the top level) and a nested
 * mapping under an `opencontract:` key are accepted, since the fence label
 * already names the block.
 */
function extractOpenContractBlock(body: string, skillPath: string): Record<string, unknown> {
  const fence = /^[ \t]*```[ \t]*yaml[ \t]+opencontract[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/m;
  const matched = fence.exec(body);
  if (!matched) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      'Missing a fenced ```yaml opencontract block declaring inputs and outputs.',
      { path: skillPath },
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(matched[1]);
  } catch (cause) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      'Failed to parse the opencontract block as YAML.',
      { path: skillPath, cause },
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      'The opencontract block must be a YAML mapping.',
      { path: skillPath },
    );
  }

  const obj = parsed as Record<string, unknown>;
  const nested = obj.opencontract;
  if (nested !== undefined) {
    if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        'The opencontract key must map to inputs and outputs.',
        { path: skillPath },
      );
    }
    return nested as Record<string, unknown>;
  }
  return obj;
}

function parseActionArtifacts(
  value: unknown,
  label: string,
  skillPath: string,
): ActionArtifactDeclaration[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new OpenContractError(
      'ACTION_METADATA_INVALID',
      `opencontract.${label} must be an array.`,
      { path: skillPath },
    );
  }
  return value.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}] must be an object.`,
        { path: skillPath },
      );
    }
    const obj = item as Record<string, unknown>;
    const contract = obj.contract;
    const version = obj.version;
    const required = obj.required;
    const minCount = obj.minCount;
    const maxCount = obj.maxCount;

    if (typeof contract !== 'string' || !isKebabCase(contract)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}].contract must be kebab-case.`,
        { path: skillPath, detail: String(contract) },
      );
    }
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}].version must be exact vX.Y.Z.`,
        { path: skillPath, detail: String(version) },
      );
    }
    if (typeof required !== 'boolean') {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}].required must be boolean.`,
        { path: skillPath },
      );
    }
    if (minCount !== undefined && (typeof minCount !== 'number' || minCount < 0)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}].minCount must be a non-negative number.`,
        { path: skillPath },
      );
    }
    if (maxCount !== undefined && (typeof maxCount !== 'number' || maxCount < 1)) {
      throw new OpenContractError(
        'ACTION_METADATA_INVALID',
        `opencontract.${label}[${i}].maxCount must be a positive number.`,
        { path: skillPath },
      );
    }
    return { contract, version, required, minCount, maxCount };
  });
}

/**
 * Parse a Contract definition from a package directory containing contract.md,
 * template.md, optional variants, optional validator, and fixtures subdirectories.
 */
export function parseContractDefinition(
  packagePath: string,
  source: DefinitionSource,
): ContractDefinition {
  const contractPath = join(packagePath, 'contract.md');
  if (!existsSync(contractPath)) {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'contract.md does not exist.', {
      path: packagePath,
    });
  }

  let frontmatter: Record<string, unknown>;
  try {
    const raw = readFileSync(contractPath, 'utf-8');
    const parsed = matter(raw);
    frontmatter = parsed.data as Record<string, unknown>;
  } catch (cause) {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      'Failed to parse contract.md frontmatter.',
      { path: contractPath, cause },
    );
  }

  const name = frontmatter.name;
  const expectedName = basename(packagePath);
  if (typeof name !== 'string' || name !== expectedName) {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      `Directory name "${expectedName}" does not match contract name "${name}".`,
      { path: contractPath },
    );
  }

  if (!isKebabCase(name)) {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      `Contract name "${name}" is not lowercase kebab-case.`,
      { path: contractPath },
    );
  }

  const version = frontmatter.version;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      `Contract version must be exact vX.Y.Z; got "${version}".`,
      { path: contractPath },
    );
  }

  const artifactType = frontmatter.artifactType;
  if (typeof artifactType !== 'string' || !artifactType) {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'Missing or invalid artifactType.', {
      path: contractPath,
    });
  }

  const artifactCoreVersion = frontmatter.artifactCoreVersion;
  if (typeof artifactCoreVersion !== 'string' || !VERSION_PATTERN.test(artifactCoreVersion)) {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      `artifactCoreVersion must be exact vX.Y.Z; got "${artifactCoreVersion}".`,
      { path: contractPath },
    );
  }

  const rawDescription = frontmatter.description;
  if (rawDescription !== undefined && typeof rawDescription !== 'string') {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'description must be a string.', {
      path: contractPath,
    });
  }
  const description = rawDescription ?? '';

  const templateName = frontmatter.template ?? 'template.md';
  if (typeof templateName !== 'string') {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'template must be a string.', {
      path: contractPath,
    });
  }
  const templatePath = join(packagePath, templateName);
  if (!existsSync(templatePath)) {
    throw new OpenContractError('CONTRACT_TEMPLATE_MISSING', `Template "${templateName}" not found.`, {
      path: contractPath,
      detail: templatePath,
    });
  }

  const variants = parseTemplateVariants(frontmatter.variants, packagePath);
  const validator = parseValidatorDeclaration(frontmatter.validator, packagePath);
  const rules = parseContractRules(frontmatter.rules, contractPath);

  return {
    name,
    version,
    artifactType,
    artifactCoreVersion,
    description,
    source,
    packagePath,
    contractPath,
    templatePath,
    variants,
    validator,
    rules,
  };
}

function parseTemplateVariants(value: unknown, packagePath: string): TemplateVariant[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'variants must be an array.', {
      path: packagePath,
    });
  }
  return value.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new OpenContractError('CONTRACT_METADATA_INVALID', `variants[${i}] must be an object.`, {
        path: packagePath,
      });
    }
    const obj = item as Record<string, unknown>;
    const name = obj.name;
    const file = obj.file;
    if (typeof name !== 'string' || typeof file !== 'string') {
      throw new OpenContractError(
        'CONTRACT_METADATA_INVALID',
        `variants[${i}] must have name and file strings.`,
        { path: packagePath },
      );
    }
    const path = join(packagePath, file);
    if (!existsSync(path)) {
      throw new OpenContractError(
        'CONTRACT_TEMPLATE_MISSING',
        `Variant "${name}" file "${file}" not found.`,
        { path: packagePath },
      );
    }
    return { name, path };
  });
}

function parseValidatorDeclaration(
  value: unknown,
  packagePath: string,
): ValidatorDeclaration | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'validator must be an object.', {
      path: packagePath,
    });
  }
  const obj = value as Record<string, unknown>;
  const runtime = obj.runtime;
  const entrypoint = obj.entrypoint;
  if (runtime !== 'python') {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      'Only python validator runtime is supported.',
      { path: packagePath },
    );
  }
  if (typeof entrypoint !== 'string') {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'validator.entrypoint must be a string.', {
      path: packagePath,
    });
  }
  const entrypointPath = join(packagePath, entrypoint);
  if (!existsSync(entrypointPath)) {
    throw new OpenContractError(
      'VALIDATOR_ENTRYPOINT_MISSING',
      `Validator entrypoint "${entrypoint}" not found.`,
      { path: packagePath },
    );
  }
  return { runtime: 'python', entrypoint: entrypointPath };
}

function parseContractRules(value: unknown, contractPath: string) {
  if (value === undefined || value === null) {
    return { frontmatterSchema: undefined, sections: undefined };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONTRACT_METADATA_INVALID', 'rules must be an object.', {
      path: contractPath,
    });
  }
  const obj = value as Record<string, unknown>;
  const frontmatterSchema = obj.frontmatterSchema;
  const sections = obj.sections;

  if (frontmatterSchema !== undefined && typeof frontmatterSchema !== 'object') {
    throw new OpenContractError(
      'CONTRACT_METADATA_INVALID',
      'rules.frontmatterSchema must be a JSON Schema object.',
      { path: contractPath },
    );
  }

  let parsedSections: SectionRule[] | undefined;
  if (sections !== undefined) {
    if (!Array.isArray(sections)) {
      throw new OpenContractError('CONTRACT_METADATA_INVALID', 'rules.sections must be an array.', {
        path: contractPath,
      });
    }
    parsedSections = sections.map((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new OpenContractError(
          'CONTRACT_METADATA_INVALID',
          `rules.sections[${i}] must be an object.`,
          { path: contractPath },
        );
      }
      const sec = item as Record<string, unknown>;
      if (typeof sec.name !== 'string' || typeof sec.level !== 'number' || typeof sec.required !== 'boolean') {
        throw new OpenContractError(
          'CONTRACT_METADATA_INVALID',
          `rules.sections[${i}] must have name (string), level (number), required (boolean).`,
          { path: contractPath },
        );
      }
      return {
        name: sec.name,
        level: sec.level,
        required: sec.required,
        minOccurrences: typeof sec.minOccurrences === 'number' ? sec.minOccurrences : undefined,
        maxOccurrences: typeof sec.maxOccurrences === 'number' ? sec.maxOccurrences : undefined,
        minimumContent: typeof sec.minimumContent === 'number' ? sec.minimumContent : undefined,
        allowExtra: typeof sec.allowExtra === 'boolean' ? sec.allowExtra : undefined,
      };
    });
  }

  return {
    frontmatterSchema: frontmatterSchema as object | undefined,
    sections: parsedSections,
  };
}

function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

/**
 * Enumerate all Action or Contract packages under a directory. Each immediate
 * child directory is treated as a package if it contains the expected definition file.
 */
export function enumerateActions(directory: string, source: DefinitionSource): ActionDefinition[] {
  if (!existsSync(directory)) {
    return [];
  }
  const results: ActionDefinition[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(directory, entry.name);
    const skillPath = join(packagePath, 'SKILL.md');
    if (existsSync(skillPath)) {
      try {
        results.push(parseActionDefinition(skillPath, source));
      } catch {
        // Skip malformed packages during enumeration
      }
    }
  }
  return results;
}

export function enumerateContracts(directory: string, source: DefinitionSource): ContractDefinition[] {
  if (!existsSync(directory)) {
    return [];
  }
  const results: ContractDefinition[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(directory, entry.name);
    const contractPath = join(packagePath, 'contract.md');
    if (existsSync(contractPath)) {
      try {
        results.push(parseContractDefinition(packagePath, source));
      } catch {
        // Skip malformed packages during enumeration
      }
    }
  }
  return results;
}
