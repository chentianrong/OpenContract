import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Package manifest checks.
 *
 * A published tarball has to carry the compiled output, the bundled system tree,
 * and both entry points. These assertions guard the manifest fields that decide
 * that, so a missing `files` entry fails here rather than after publish.
 */

const packageRoot = process.cwd();
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));

describe('Package manifest', () => {
  it('declares the CLI bin and the library entry point', () => {
    expect(manifest.bin).toEqual({ opencontract: './dist/cli/index.js' });
    expect(manifest.exports['.'].import).toBe('./dist/index.js');
    expect(manifest.exports['.'].types).toBe('./dist/index.d.ts');
  });

  it('ships compiled output and bundled resources', () => {
    expect(manifest.files).toContain('dist');
    expect(manifest.files).toContain('resources');
  });

  it('declares the Node.js 22 engine constraint and ESM type', () => {
    expect(manifest.type).toBe('module');
    expect(manifest.engines.node).toBe('>=22.0.0');
  });

  it('carries provenance metadata', () => {
    expect(manifest.name).toBe('@opencontract/cli');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.license).toBeTruthy();
    expect(manifest.repository?.url).toBeTruthy();
    expect(manifest.homepage).toBeTruthy();
    expect(manifest.bugs?.url).toBeTruthy();
  });

  it('keeps every runtime import in dependencies, not devDependencies', () => {
    // A runtime dependency listed only under devDependencies would resolve in
    // this repo but fail for an installed consumer.
    for (const name of [
      'commander',
      'yaml',
      'gray-matter',
      'ajv',
      'ajv-formats',
      'remark-parse',
      'unified',
      'mdast-util-to-string',
    ]) {
      expect(manifest.dependencies).toHaveProperty(name);
      expect(manifest.devDependencies ?? {}).not.toHaveProperty(name);
    }
  });

  it('has a build script that verifies bundled resources', () => {
    expect(manifest.scripts.build).toContain('tsc');
    expect(manifest.scripts.build).toContain('verify-resources');
    expect(existsSync(join(packageRoot, 'scripts', 'verify-resources.mjs'))).toBe(true);
  });
});

describe('Build output', () => {
  it('emits both entry points with type declarations', () => {
    // These exist only after `pnpm build`; the CLI end-to-end suites depend on
    // the same output, so a stale dist fails there too.
    for (const relative of [
      'dist/cli/index.js',
      'dist/index.js',
      'dist/index.d.ts',
      'dist/domain/errors.js',
      'dist/validation/pipeline.js',
    ]) {
      expect(existsSync(join(packageRoot, relative))).toBe(true);
    }
  });

  it('keeps the bundled system tree complete', () => {
    const system = join(packageRoot, 'resources', 'system');
    expect(existsSync(join(system, 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(system, 'actions', 'opencontract', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(system, 'actions', 'plan', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(system, 'contracts', 'tasks', 'contract.md'))).toBe(true);
    expect(existsSync(join(system, 'contracts', 'tasks', 'template.md'))).toBe(true);
  });
});
