import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundled system definitions ship as package resources rather than compiled
 * modules, so the locator has to work both from `src/` during development and
 * from `dist/` in a published tarball.
 */

const moduleDir = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(startDir: string): string {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate the @opencontract/cli package root from ${startDir}`);
    }
    current = parent;
  }
}

let cachedResourcesRoot: string | undefined;

/**
 * Absolute path to the bundled `resources/` tree containing the system
 * manifest, Action Skills, Contract packages, and harness adapter templates.
 */
export function resourcesRoot(): string {
  if (cachedResourcesRoot) {
    return cachedResourcesRoot;
  }
  const packageRoot = findPackageRoot(moduleDir);
  const candidates = [
    join(packageRoot, 'resources'),
    // When compiled output lives in dist/, the package root resolves to the
    // repository root and the same relative path applies; the second candidate
    // covers a layout where resources are copied beside the compiled files.
    join(packageRoot, 'dist', 'resources'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedResourcesRoot = candidate;
      return candidate;
    }
  }
  throw new Error(
    `Bundled OpenContract resources were not found. Looked in: ${candidates.join(', ')}`,
  );
}

/** Absolute path to a file or directory inside the bundled resources tree. */
export function resourcePath(...segments: string[]): string {
  return join(resourcesRoot(), ...segments);
}

/** Absolute path to the bundled system tree that `init`/`update` install. */
export function bundledSystemRoot(): string {
  return resourcePath('system');
}

/** Absolute path to the bundled harness adapter templates. */
export function bundledHarnessRoot(): string {
  return resourcePath('harnesses');
}

/** Resets the cached lookup; used by tests that relocate the package. */
export function resetResourcesRootCache(): void {
  cachedResourcesRoot = undefined;
}
