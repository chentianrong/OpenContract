import { describe, it, expect } from 'vitest';
import { enumerateContracts } from '../src/definitions/parser.js';
import { testContractFixtures } from '../src/definitions/fixtures.js';
import { bundledSystemRoot } from '../src/resources.js';
import { join } from 'node:path';

describe('Contract fixture conformance', () => {
  it('validates all bundled Contract fixtures', () => {
    const contracts = enumerateContracts(join(bundledSystemRoot(), 'contracts'), 'system');
    expect(contracts.length).toBeGreaterThan(0);

    const results = contracts.map(testContractFixtures);
    const failed = results.filter((r) => !r.passed);

    if (failed.length > 0) {
      const summary = failed
        .map((r) => {
          const lines = [`${r.contract}@${r.version}:`];
          if (!r.templateOk) {
            lines.push(`  template: ${r.templateProblems.join('; ')}`);
          }
          for (const f of [...r.valid, ...r.invalid]) {
            if (!f.ok) lines.push(`  ${f.name}: ${f.reason}`);
          }
          return lines.join('\n');
        })
        .join('\n\n');
      throw new Error(`${failed.length} Contract(s) failed fixture validation:\n\n${summary}`);
    }

    // Every Contract has at least one valid and one invalid fixture.
    for (const r of results) {
      expect(r.valid.length).toBeGreaterThan(0);
      expect(r.invalid.length).toBeGreaterThan(0);
    }
  });

  it('reports fixture outcomes with actionable details', () => {
    const contracts = enumerateContracts(join(bundledSystemRoot(), 'contracts'), 'system');
    const sample = contracts[0];
    const result = testContractFixtures(sample);

    for (const f of result.valid) {
      expect(f.path).toContain('fixtures/valid');
      expect(f.name).toMatch(/\.md$/);
      expect(f.actualCodes).toBeInstanceOf(Array);
    }

    for (const f of result.invalid) {
      expect(f.path).toContain('fixtures/invalid');
      if (!f.ok) {
        expect(f.reason).toBeDefined();
      }
    }
  });

  it('verifies the template contains all artifact-core fields', () => {
    const contracts = enumerateContracts(join(bundledSystemRoot(), 'contracts'), 'system');
    for (const contract of contracts) {
      const result = testContractFixtures(contract);
      expect(result.templateOk).toBe(true);
      expect(result.templateProblems).toEqual([]);
    }
  });
});
