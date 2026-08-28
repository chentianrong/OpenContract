import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown } from '../markdown/parser.js';
import { validateArtifactCore } from '../validation/artifact-core.js';
import { validateContractRules } from '../validation/contract-rules.js';
import { isOpenContractError } from '../domain/errors.js';
import type { ContractDefinition, ValidationError } from '../domain/types.js';

/**
 * The shared Contract fixture harness. Every Contract package carries
 * `fixtures/valid/` and `fixtures/invalid/` examples; this harness is the single
 * place that decides what "the fixture passes" means, so `contract test`, the
 * bundled-catalog conformance suite, and `update` staging all agree.
 *
 * Fixtures are checked with the same parse → artifact_core → contract_structure
 * phases the validation pipeline uses. The semantic-validator phase is out of
 * scope here: it needs a trusted root and a subprocess, which fixture testing
 * deliberately does not set up.
 */

export interface FixtureOutcome {
  /** Absolute path to the fixture file. */
  readonly path: string;
  /** Fixture file name, useful for terse reporting. */
  readonly name: string;
  /** Whether the fixture met its expectation. */
  readonly ok: boolean;
  /** Error codes the fixture actually produced. */
  readonly actualCodes: string[];
  /** Why the fixture failed its expectation, when it did. */
  readonly reason?: string;
}

export interface ContractTestResult {
  readonly contract: string;
  readonly version: string;
  readonly valid: FixtureOutcome[];
  readonly invalid: FixtureOutcome[];
  readonly templateOk: boolean;
  readonly templateProblems: string[];
  /** True when every fixture met its expectation and the template is sound. */
  readonly passed: boolean;
}

const ARTIFACT_CORE_FIELDS = [
  'contract',
  'version',
  'action',
  'action_version',
  'created_at',
  'inputs',
] as const;

/** Run the fixture-scope phases and collect the errors they report. */
function collectErrors(path: string, contract: ContractDefinition): ValidationError[] {
  try {
    const parsed = parseMarkdown(path);
    return [
      // Fixtures live inside the Contract package, not under a workspace
      // artifacts root, so the managed-root boundary is not applicable.
      ...validateArtifactCore(parsed, {}),
      ...validateContractRules(parsed, contract),
    ];
  } catch (err) {
    if (isOpenContractError(err)) {
      return [
        {
          code: err.code,
          phase: 'parse',
          message: err.message,
          path,
          line: err.line,
          column: err.column,
          detail: err.detail,
          repairHint: err.repairHint,
        },
      ];
    }
    throw err;
  }
}

function listFixtures(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

function testFixture(
  path: string,
  name: string,
  expectValid: boolean,
  contract: ContractDefinition,
): FixtureOutcome {
  const errors = collectErrors(path, contract);
  const actualCodes = errors.map((e) => e.code);
  const ok = expectValid ? errors.length === 0 : errors.length > 0;

  let reason: string | undefined;
  if (!ok) {
    if (expectValid) {
      reason = `expected valid, but got errors: ${actualCodes.join(', ')}`;
    } else {
      reason = 'expected at least one error, but got none';
    }
  }

  return { path, name, ok, actualCodes, reason };
}

/**
 * Test a Contract's fixtures and template. The template check verifies it parses
 * cleanly and carries the core metadata the Contract requires, so a harness that
 * instantiates from the template starts with a sound document.
 */
export function testContractFixtures(contract: ContractDefinition): ContractTestResult {
  const validDir = join(contract.packagePath, 'fixtures', 'valid');
  const invalidDir = join(contract.packagePath, 'fixtures', 'invalid');

  const valid = listFixtures(validDir).map((name) =>
    testFixture(join(validDir, name), name, true, contract),
  );
  const invalid = listFixtures(invalidDir).map((name) =>
    testFixture(join(invalidDir, name), name, false, contract),
  );

  // Verify the template parses cleanly and has all artifact-core fields.
  const templateProblems: string[] = [];
  let templateOk = false;
  try {
    const parsed = parseMarkdown(contract.templatePath);
    const missing = ARTIFACT_CORE_FIELDS.filter((field) => !(field in parsed.frontmatter));
    if (missing.length > 0) {
      templateProblems.push(`missing frontmatter fields: ${missing.join(', ')}`);
    }

    // The template should declare its own contract name and version.
    if (parsed.frontmatter.contract !== contract.name) {
      templateProblems.push(
        `contract mismatch: template declares "${parsed.frontmatter.contract}", package is "${contract.name}"`,
      );
    }
    if (parsed.frontmatter.version !== contract.version) {
      templateProblems.push(
        `version mismatch: template declares "${parsed.frontmatter.version}", package is "${contract.version}"`,
      );
    }

    templateOk = templateProblems.length === 0;
  } catch (err) {
    if (isOpenContractError(err)) {
      templateProblems.push(`${err.code}: ${err.message}`);
    } else {
      templateProblems.push(`unexpected error: ${String(err)}`);
    }
  }

  const passed =
    templateOk && valid.every((f) => f.ok) && invalid.every((f) => f.ok);

  return {
    contract: contract.name,
    version: contract.version,
    valid,
    invalid,
    templateOk,
    templateProblems,
    passed,
  };
}
