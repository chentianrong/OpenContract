import type {
  PhaseStatus,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from '../domain/types.js';
import type { DirectoryValidationResult } from '../validation/pipeline.js';
import { EXIT_CODES, errorClassOf, type ExitCode } from '../domain/errors.js';

/**
 * Presentation for `validate`. Human output is a reading order — target, phase
 * table, then each finding with its location and repair hint. JSON output is the
 * versioned protocol downstream agents consume; it carries the same facts with
 * no terminal formatting.
 */

const STATUS_LABEL: Record<PhaseStatus, string> = {
  passed: 'pass',
  failed: 'FAIL',
  skipped: 'skip',
};

function isDirectoryResult(
  result: ValidationResult | DirectoryValidationResult,
): result is DirectoryValidationResult {
  return result.target.type === 'directory';
}

function formatLocation(item: ValidationError | ValidationWarning): string {
  const parts = [item.path];
  if (item.line !== undefined) parts.push(String(item.line));
  if (item.column !== undefined) parts.push(String(item.column));
  return parts.join(':');
}

function renderFinding(item: ValidationError | ValidationWarning, index: number): string[] {
  const lines = [`${index}. [${item.code}] ${item.message}`];
  lines.push(`   at ${formatLocation(item)}`);
  if (item.detail) {
    lines.push(`   ${item.detail}`);
  }
  if ('repairHint' in item && item.repairHint) {
    lines.push(`   hint: ${item.repairHint}`);
  }
  return lines;
}

function renderFileResult(result: ValidationResult, indent = ''): string[] {
  const lines: string[] = [];
  const contract =
    result.target.contract && result.target.contractVersion
      ? `${result.target.contract}@${result.target.contractVersion}`
      : 'unresolved contract';

  lines.push(`${indent}${result.valid ? 'valid' : 'INVALID'}  ${result.target.path}`);
  lines.push(`${indent}  contract: ${contract}`);
  if (result.target.action && result.target.actionVersion) {
    lines.push(`${indent}  action:   ${result.target.action}@${result.target.actionVersion}`);
  }

  const phases = result.phases
    .map((phase) => `${phase.phase}=${STATUS_LABEL[phase.status]}`)
    .join('  ');
  lines.push(`${indent}  phases:   ${phases}`);

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`${indent}  Errors (${result.errors.length}):`);
    for (const [i, error] of result.errors.entries()) {
      for (const line of renderFinding(error, i + 1)) {
        lines.push(`${indent}  ${line}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`${indent}  Warnings (${result.warnings.length}):`);
    for (const [i, warning] of result.warnings.entries()) {
      for (const line of renderFinding(warning, i + 1)) {
        lines.push(`${indent}  ${line}`);
      }
    }
  }

  return lines;
}

export function renderValidationHuman(
  result: ValidationResult | DirectoryValidationResult,
): string {
  if (!isDirectoryResult(result)) {
    return renderFileResult(result).join('\n');
  }

  const lines: string[] = [
    `${result.valid ? 'valid' : 'INVALID'}  ${result.target.path}`,
    `  ${result.validCount}/${result.fileCount} file(s) valid`,
  ];

  // List failures first: that is what the reader needs to act on.
  const failing = result.results.filter((r) => !r.valid);
  const passing = result.results.filter((r) => r.valid);

  for (const file of failing) {
    lines.push('');
    lines.push(...renderFileResult(file, '  '));
  }

  if (passing.length > 0) {
    lines.push('');
    lines.push(`  Valid files (${passing.length}):`);
    for (const file of passing) {
      lines.push(`    ${file.target.path}`);
    }
  }

  return lines.join('\n');
}

export function renderValidationJson(
  result: ValidationResult | DirectoryValidationResult,
): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Map a result to its process exit code. A content defect is exit 1; a
 * configuration, definition, or trust fault is exit 2 even when no content
 * defect was found, because the Artifact was not fully examined.
 */
export function exitCodeForResult(
  result: ValidationResult | DirectoryValidationResult,
): ExitCode {
  const errors = isDirectoryResult(result)
    ? result.results.flatMap((r) => r.errors)
    : result.errors;

  if (errors.some((e) => errorClassOf(e.code) === 'content')) {
    return EXIT_CODES.INVALID_CONTENT;
  }
  if (errors.some((e) => errorClassOf(e.code) === 'configuration')) {
    return EXIT_CODES.CONFIGURATION;
  }
  if (errors.some((e) => errorClassOf(e.code) === 'unexpected')) {
    return EXIT_CODES.UNEXPECTED;
  }
  return EXIT_CODES.VALID;
}
