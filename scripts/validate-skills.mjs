#!/usr/bin/env node
/**
 * Skills conformance gate.
 *
 * Runs the Agent Skills reference validator (`skills-ref`) against the entry
 * Skill and all twelve business Actions. Kept as a script so the same check runs
 * locally and in CI instead of living only in the workflow file.
 *
 * `skills-ref` is a third-party port of the reference implementation and is not
 * a runtime dependency of this package, so it is fetched on demand via npx.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Pinned so a validator release cannot silently change the gate. */
const VALIDATOR = 'skills-ref@0.1.5';

const ENTRY_ACTION = 'opencontract';
const BUSINESS_ACTIONS = [
  'explore',
  'clarify',
  'decompose',
  'suggest',
  'build',
  'plan',
  'execute',
  'debug',
  'review',
  'verify',
  'report',
  'archive',
];

const failures = [];

for (const action of [ENTRY_ACTION, ...BUSINESS_ACTIONS]) {
  const skill = join(packageRoot, 'resources', 'system', 'actions', action, 'SKILL.md');

  if (!existsSync(skill)) {
    failures.push(`${action}: SKILL.md not found at ${skill}`);
    console.error(`  MISSING  ${action}`);
    continue;
  }

  try {
    const output = execFileSync('npx', ['--yes', VALIDATOR, 'validate', skill], {
      cwd: packageRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // The validator exits 0 on success; the banner confirms which skill passed.
    if (!/valid skill/i.test(output)) {
      failures.push(`${action}: unexpected validator output: ${output.trim()}`);
      console.error(`  FAIL     ${action}`);
      continue;
    }

    console.log(`  ok       ${action}`);
  } catch (err) {
    const e = err;
    const detail = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message;
    failures.push(`${action}: ${detail}`);
    console.error(`  FAIL     ${action}`);
  }
}

console.log('');

if (failures.length > 0) {
  console.error(`Skills conformance failed (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Skills conformance passed: ${1 + BUSINESS_ACTIONS.length} Skill(s) validated ` +
    `with ${VALIDATOR} (1 entry + ${BUSINESS_ACTIONS.length} business).`,
);
