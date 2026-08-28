#!/usr/bin/env node
/**
 * Post-build guard: the compiled CLI resolves bundled Actions, Contracts, and
 * harness templates from `resources/` at runtime, so a build that emits `dist/`
 * without those resources would install an empty system tree. Fail the build
 * instead.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Files and directories that must exist for a publishable build. */
const REQUIRED = [
  'dist/cli/index.js',
  'dist/domain/types.js',
  'dist/domain/errors.js',
  'dist/resources.js',
  'resources/system',
  'resources/harnesses',
];

const missing = REQUIRED.filter((relative) => !existsSync(join(packageRoot, relative)));

if (missing.length > 0) {
  console.error('Build verification failed. Missing build outputs or resources:');
  for (const relative of missing) {
    console.error(`  - ${relative}`);
  }
  process.exit(1);
}

function countFiles(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(full);
    } else if (statSync(full).isFile()) {
      count += 1;
    }
  }
  return count;
}

const systemFiles = countFiles(join(packageRoot, 'resources', 'system'));
const harnessFiles = countFiles(join(packageRoot, 'resources', 'harnesses'));

// Detect accidental nesting (resources/ directory copied inside itself)
const nestedResourcesDirs = [];
function findNestedResources(dir, depth = 0) {
  if (depth > 10) return; // prevent infinite recursion
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'resources') {
        nestedResourcesDirs.push(join(dir, entry.name));
      }
      findNestedResources(join(dir, entry.name), depth + 1);
    }
  }
}

findNestedResources(join(packageRoot, 'resources', 'system', 'contracts'));
findNestedResources(join(packageRoot, 'resources', 'system', 'actions'));

if (nestedResourcesDirs.length > 0) {
  console.error('Build verification failed. Detected nested resources/ directories:');
  for (const nested of nestedResourcesDirs) {
    console.error(`  ${nested}`);
  }
  console.error(
    'This indicates accidental recursive copy. Remove nested directories and rebuild.',
  );
  process.exit(1);
}

if (systemFiles === 0 || harnessFiles === 0) {
  console.error('Build verification failed. Bundled resources are empty:');
  console.error(`  resources/system: ${systemFiles} file(s)`);
  console.error(`  resources/harnesses: ${harnessFiles} file(s)`);
  process.exit(1);
}

/**
 * Catalog shape: one `contract.md` and one `template.md` per Contract package,
 * one `SKILL.md` per Action. A count that exceeds the package total means a
 * stray copy was bundled — the same defect the nesting check above guards.
 */
function packageDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function countByName(root, filename) {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      count += countByName(full, filename);
    } else if (entry.name === filename) {
      count += 1;
    }
  }
  return count;
}

const contractsRoot = join(packageRoot, 'resources', 'system', 'contracts');
const actionsRoot = join(packageRoot, 'resources', 'system', 'actions');

const contractCount = packageDirs(contractsRoot).length;
const actionCount = packageDirs(actionsRoot).length;

const catalogProblems = [];
for (const [filename, expected] of [
  ['contract.md', contractCount],
  ['template.md', contractCount],
]) {
  const found = countByName(contractsRoot, filename);
  if (found !== expected) {
    catalogProblems.push(
      `resources/system/contracts: expected ${expected} ${filename}, found ${found}`,
    );
  }
}

const skillsFound = countByName(actionsRoot, 'SKILL.md');
if (skillsFound !== actionCount) {
  catalogProblems.push(
    `resources/system/actions: expected ${actionCount} SKILL.md, found ${skillsFound}`,
  );
}

if (catalogProblems.length > 0) {
  console.error('Build verification failed. Bundled catalog is inconsistent:');
  for (const problem of catalogProblems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Build verified: dist output present, ${systemFiles} system resource file(s), ` +
    `${harnessFiles} harness resource file(s).`,
);
