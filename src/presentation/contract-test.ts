import type { ContractTestResult } from '../definitions/fixtures.js';

/**
 * Presentation for `contract test`. Human output summarizes each fixture and
 * the template check; JSON output is the machine surface for CI.
 */

export function renderContractTestHuman(result: ContractTestResult): string {
  const lines: string[] = [];
  const status = result.passed ? 'passed' : 'FAILED';
  lines.push(`Contract ${result.contract}@${result.version}: ${status}`);

  lines.push('');
  lines.push(`Template: ${result.templateOk ? 'ok' : 'FAILED'}`);
  for (const problem of result.templateProblems) {
    lines.push(`  ${problem}`);
  }

  const renderGroup = (label: string, fixtures: ContractTestResult['valid']) => {
    if (fixtures.length === 0) {
      lines.push('');
      lines.push(`${label}: none present`);
      return;
    }
    lines.push('');
    lines.push(`${label}: ${fixtures.filter((f) => f.ok).length}/${fixtures.length} as expected`);
    for (const fixture of fixtures) {
      if (fixture.ok) {
        lines.push(`  ok    ${fixture.name}`);
      } else {
        lines.push(`  FAIL  ${fixture.name} - ${fixture.reason}`);
      }
    }
  };

  renderGroup('Valid fixtures', result.valid);
  renderGroup('Invalid fixtures', result.invalid);

  return lines.join('\n');
}

export function renderContractTestJson(result: ContractTestResult): string {
  return JSON.stringify(
    {
      protocol: 'opencontract-contract-test',
      version: 'v1.0.0',
      contract: result.contract,
      contractVersion: result.version,
      passed: result.passed,
      template: {
        ok: result.templateOk,
        problems: result.templateProblems,
      },
      fixtures: {
        valid: result.valid.map(toFixtureJson),
        invalid: result.invalid.map(toFixtureJson),
      },
    },
    null,
    2,
  );
}

function toFixtureJson(fixture: ContractTestResult['valid'][number]) {
  return {
    name: fixture.name,
    path: fixture.path,
    ok: fixture.ok,
    actualCodes: fixture.actualCodes,
    reason: fixture.reason,
  };
}
