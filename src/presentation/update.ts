import type { UpdateOutcome } from '../system/update.js';

/**
 * Presentation for `init` and `update`. Both report the same operation: what
 * version is now installed, what was cached, and what happened to each harness
 * adapter.
 */

export function renderUpdateHuman(outcome: UpdateOutcome): string {
  const lines: string[] = [];

  if (outcome.success) {
    lines.push(`installed  system ${outcome.newVersion}`);
  } else if (outcome.rollbackPerformed) {
    lines.push('FAILED  update rolled back; the previous system is still installed');
  } else {
    lines.push('FAILED  update aborted; the installed system was not modified');
  }

  if (outcome.previousVersion && outcome.previousVersion !== outcome.newVersion) {
    lines.push(`  previous: ${outcome.previousVersion}`);
  }
  if (outcome.cachedAs) {
    lines.push(`  cached:   ${outcome.cachedAs}`);
  }

  if (outcome.adapters.length > 0) {
    lines.push('');
    lines.push('  Adapters:');
    for (const adapter of outcome.adapters) {
      if (adapter.kind === 'written') {
        lines.push(`    written      ${adapter.path}`);
      } else if (adapter.kind === 'unsupported') {
        lines.push(`    unsupported  ${adapter.harness}`);
      } else {
        lines.push(`    CONFLICT     ${adapter.path} (not OpenContract-owned; left unchanged)`);
      }
    }
  }

  if (outcome.errors.length > 0) {
    lines.push('');
    lines.push(`  Problems (${outcome.errors.length}):`);
    for (const [index, error] of outcome.errors.entries()) {
      lines.push(`  ${index + 1}. [${error.code}] ${error.message}`);
      if (error.detail) lines.push(`     ${error.detail}`);
      lines.push(`     hint: ${error.repairHint}`);
    }
  }

  return lines.join('\n');
}

export function renderUpdateJson(outcome: UpdateOutcome): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-update',
      version: 'v1.0.0',
      success: outcome.success,
      newVersion: outcome.newVersion,
      previousVersion: outcome.previousVersion,
      cachedAs: outcome.cachedAs,
      rollbackPerformed: outcome.rollbackPerformed,
      adapters: outcome.adapters,
      errors: outcome.errors.map((error) => error.toJSON()),
    },
    null,
    2,
  );
}
