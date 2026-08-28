import type { ActionRunValidationResult } from '../actions/validate.js';
import { EXIT_CODES, errorClassOf, type ExitCode } from '../domain/errors.js';
import type { ValidationError, ValidationWarning } from '../domain/types.js';

/**
 * Presentation for `validate-action`. The human form leads with the run's
 * identity and counts, then the findings; the JSON form is the same data with
 * per-output results preserved so a caller can act on one output at a time.
 */

function formatLocation(item: ValidationError | ValidationWarning): string {
  const parts = [item.path];
  if (item.line !== undefined) parts.push(String(item.line));
  if (item.column !== undefined) parts.push(String(item.column));
  return parts.join(':');
}

export function renderActionRunHuman(result: ActionRunValidationResult): string {
  const lines: string[] = [
    `${result.valid ? 'valid' : 'INVALID'}  ${result.directory}`,
    `  action:   ${result.action}@${result.actionVersion}`,
    `  outputs:  ${result.outputs.length}`,
    `  inputs:   ${result.mergedInputs.length}`,
  ];

  const invalidOutputs = result.outputs.filter((o) => !o.valid);
  if (invalidOutputs.length > 0) {
    lines.push(`  invalid outputs: ${invalidOutputs.length}`);
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`  Errors (${result.errors.length}):`);
    for (const [index, error] of result.errors.entries()) {
      lines.push(`  ${index + 1}. [${error.code}] ${error.message}`);
      lines.push(`     at ${formatLocation(error)}`);
      if (error.detail) lines.push(`     ${error.detail}`);
      lines.push(`     hint: ${error.repairHint}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`  Warnings (${result.warnings.length}):`);
    for (const [index, warning] of result.warnings.entries()) {
      lines.push(`  ${index + 1}. [${warning.code}] ${warning.message}`);
      lines.push(`     at ${formatLocation(warning)}`);
    }
  }

  return lines.join('\n');
}

export function renderActionRunJson(result: ActionRunValidationResult): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-action-validation',
      version: 'v1.0.0',
      ...result,
    },
    null,
    2,
  );
}

/** Same exit-code rule as `validate`: content defect 1, configuration fault 2. */
export function exitCodeForActionRun(result: ActionRunValidationResult): ExitCode {
  if (result.errors.some((e) => errorClassOf(e.code) === 'content')) {
    return EXIT_CODES.INVALID_CONTENT;
  }
  if (result.errors.some((e) => errorClassOf(e.code) === 'configuration')) {
    return EXIT_CODES.CONFIGURATION;
  }
  if (result.errors.some((e) => errorClassOf(e.code) === 'unexpected')) {
    return EXIT_CODES.UNEXPECTED;
  }
  return EXIT_CODES.VALID;
}
