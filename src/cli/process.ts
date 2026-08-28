import { EXIT_CODES, isOpenContractError, toUnexpectedError } from '../domain/errors.js';

/**
 * Process lifecycle at the CLI edge. Expected failures print a message, a
 * location, and a repair hint — never a stack trace; only genuinely unexpected
 * errors print one, because those are bugs worth reporting.
 */
export function reportAndExit(err: unknown): never {
  if (isOpenContractError(err)) {
    const lines = [`Error [${err.code}]: ${err.message}`];
    if (err.detail) {
      lines.push(`  ${err.detail}`);
    }
    if (err.path) {
      const location = [err.path, err.line, err.column].filter((p) => p !== undefined).join(':');
      lines.push(`  at ${location}`);
    }
    lines.push('');
    lines.push(`Hint: ${err.repairHint}`);
    process.stderr.write(`${lines.join('\n')}\n`);
    process.exit(err.exitCode);
  }

  const wrapped = toUnexpectedError(err);
  process.stderr.write(`Error [${wrapped.code}]: ${wrapped.message}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(EXIT_CODES.UNEXPECTED);
}
