import type { DoctorResult } from '../domain/types.js';

/**
 * Presentation for `doctor`. Failures are listed first with their repair hints,
 * since that is what the reader needs to act on; passing checks follow as
 * confirmation of what was examined.
 */

export function renderDoctorHuman(result: DoctorResult): string {
  const lines: string[] = [];
  const failing = result.checks.filter((c) => !c.healthy);
  const passing = result.checks.filter((c) => c.healthy);

  lines.push(result.healthy ? 'healthy' : 'UNHEALTHY');
  lines.push(`  ${passing.length}/${result.checks.length} check(s) passed`);

  if (failing.length > 0) {
    lines.push('');
    lines.push(`  Problems (${failing.length}):`);
    for (const [index, check] of failing.entries()) {
      lines.push(`  ${index + 1}. [${check.component}] ${check.message}`);
      if (check.repairHint) {
        lines.push(`     hint: ${check.repairHint}`);
      }
    }
  }

  if (passing.length > 0) {
    lines.push('');
    lines.push('  Passed:');
    for (const check of passing) {
      lines.push(`    ${check.component}: ${check.message}`);
    }
  }

  return lines.join('\n');
}

export function renderDoctorJson(result: DoctorResult): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-doctor',
      version: 'v1.0.0',
      healthy: result.healthy,
      checks: result.checks,
    },
    null,
    2,
  );
}
