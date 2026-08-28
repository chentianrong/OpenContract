import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ParsedMarkdown, HeadingInfo } from '../markdown/parser.js';
import type { ContractDefinition, SectionRule, ValidationError } from '../domain/types.js';
import { repairHintFor } from '../domain/errors.js';

/**
 * Contract declarative rule evaluation: a Draft 2020-12 schema over the
 * frontmatter, plus heading name/level/order/occurrence/minimum-content rules
 * over the body. Rules come from `contract.md`; the template is guidance only
 * and never adds a requirement.
 *
 * This phase assumes artifact-core has already run — it checks the Contract's
 * additional constraints, not the shared metadata fields.
 */

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

/** Compiled schemas are cached per Contract identity, which is immutable. */
const schemaCache = new Map<string, ReturnType<typeof ajv.compile>>();

function compileSchema(contract: ContractDefinition) {
  const key = `${contract.name}@${contract.version}`;
  const cached = schemaCache.get(key);
  if (cached) return cached;
  const compiled = ajv.compile(contract.rules.frontmatterSchema as object);
  schemaCache.set(key, compiled);
  return compiled;
}

function error(
  code: string,
  message: string,
  path: string,
  detail?: string,
  line?: number,
  column?: number,
): ValidationError {
  return {
    code,
    phase: 'contract_structure',
    message,
    path,
    line,
    column,
    detail,
    repairHint: repairHintFor(code),
  };
}

function validateFrontmatterSchema(
  parsed: ParsedMarkdown,
  contract: ContractDefinition,
): ValidationError[] {
  if (!contract.rules.frontmatterSchema) return [];

  const validate = compileSchema(contract);
  if (validate(parsed.frontmatter)) return [];

  return (validate.errors ?? []).map((err) => {
    const field = err.instancePath.replace(/^\//, '') || 'frontmatter';
    return error(
      'SCHEMA_VIOLATION',
      `Frontmatter does not satisfy the ${contract.name} Contract schema.`,
      parsed.path,
      `${field} ${err.message ?? 'is invalid'}`,
      2,
    );
  });
}

/** Occurrence bounds default to "exactly one if required, at most one if not". */
function occurrenceBounds(rule: SectionRule): { min: number; max: number } {
  const min = rule.minOccurrences ?? (rule.required ? 1 : 0);
  const max = rule.maxOccurrences ?? 1;
  return { min, max: Math.max(min, max) };
}

function validateOccurrences(
  rule: SectionRule,
  matches: HeadingInfo[],
  parsed: ParsedMarkdown,
  contract: ContractDefinition,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { min, max } = occurrenceBounds(rule);

  if (matches.length < min) {
    if (matches.length === 0) {
      errors.push(
        error(
          'SECTION_MISSING',
          `Missing required section "${rule.name}".`,
          parsed.path,
          `${contract.name} requires this heading at level ${rule.level}`,
        ),
      );
    } else {
      errors.push(
        error(
          'SECTION_MISSING',
          `Section "${rule.name}" occurs ${matches.length} time(s) but at least ${min} are required.`,
          parsed.path,
          `${contract.name} declares minOccurrences ${min}`,
          matches[0].line,
        ),
      );
    }
  }

  if (matches.length > max) {
    // Anchor at the first occurrence beyond the allowance.
    const offending = matches[max];
    errors.push(
      error(
        'SECTION_DUPLICATE',
        `Section "${rule.name}" occurs ${matches.length} time(s) but at most ${max} are allowed.`,
        parsed.path,
        `${contract.name} declares maxOccurrences ${max}`,
        offending.line,
        offending.column,
      ),
    );
  }

  return errors;
}

function validateSectionShape(
  rule: SectionRule,
  matches: HeadingInfo[],
  parsed: ParsedMarkdown,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const heading of matches) {
    if (heading.depth !== rule.level) {
      errors.push(
        error(
          'SECTION_LEVEL_INVALID',
          `Section "${rule.name}" uses heading level ${heading.depth}.`,
          parsed.path,
          `expected level ${rule.level}`,
          heading.line,
          heading.column,
        ),
      );
    }

    const minimum = rule.minimumContent;
    if (minimum !== undefined && heading.contentLength < minimum) {
      errors.push(
        error(
          'SECTION_EMPTY',
          `Section "${rule.name}" does not contain the required minimum content.`,
          parsed.path,
          `expected at least ${minimum} non-whitespace characters, found ${heading.contentLength}`,
          heading.line,
          heading.column,
        ),
      );
    }
  }

  return errors;
}

/**
 * Declared sections must appear in declared order. Only the relative order of
 * declared sections matters; undeclared headings may sit anywhere.
 */
function validateOrder(
  parsed: ParsedMarkdown,
  contract: ContractDefinition,
  rules: SectionRule[],
): ValidationError[] {
  const declaredOrder = rules.map((r) => r.name);
  const present = parsed.headings.filter((h) => declaredOrder.includes(h.text));

  const errors: ValidationError[] = [];
  let highestSeen = -1;
  let highestName = '';

  for (const heading of present) {
    const position = declaredOrder.indexOf(heading.text);
    if (position < highestSeen) {
      errors.push(
        error(
          'SECTION_MISORDERED',
          `Section "${heading.text}" appears after "${highestName}".`,
          parsed.path,
          `${contract.name} declares the order: ${declaredOrder.join(', ')}`,
          heading.line,
          heading.column,
        ),
      );
    } else if (position > highestSeen) {
      highestSeen = position;
      highestName = heading.text;
    }
  }

  return errors;
}

/**
 * When a Contract sets `allowExtraSections: false`, headings at a declared
 * level that the Contract does not name are rejected. Deeper headings nested
 * inside a declared section are always allowed.
 */
function validateNoExtraSections(
  parsed: ParsedMarkdown,
  contract: ContractDefinition,
  rules: SectionRule[],
): ValidationError[] {
  if (contract.rules.allowExtraSections !== false) return [];

  const declaredNames = new Set(rules.map((r) => r.name));
  const declaredLevels = new Set(rules.map((r) => r.level));

  return parsed.headings
    .filter((h) => declaredLevels.has(h.depth) && !declaredNames.has(h.text))
    .map((h) =>
      error(
        'SECTION_UNEXPECTED',
        `Section "${h.text}" is not declared by the ${contract.name} Contract.`,
        parsed.path,
        `declared sections: ${[...declaredNames].join(', ')}`,
        h.line,
        h.column,
      ),
    );
}

/**
 * Evaluate a Contract's declarative rules against a parsed Artifact. Returns
 * every violation found so an agent can repair the document in one pass.
 */
export function validateContractRules(
  parsed: ParsedMarkdown,
  contract: ContractDefinition,
): ValidationError[] {
  const errors: ValidationError[] = [...validateFrontmatterSchema(parsed, contract)];

  const rules = contract.rules.sections;
  if (!rules || rules.length === 0) {
    return errors;
  }

  for (const rule of rules) {
    const matches = parsed.headings.filter((h) => h.text === rule.name);
    errors.push(...validateOccurrences(rule, matches, parsed, contract));
    errors.push(...validateSectionShape(rule, matches, parsed));
  }

  errors.push(...validateOrder(parsed, contract, rules));
  errors.push(...validateNoExtraSections(parsed, contract, rules));

  return errors;
}
