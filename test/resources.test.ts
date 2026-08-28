import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resourcesRoot,
  resourcePath,
  bundledSystemRoot,
  bundledHarnessRoot,
} from '../src/resources.js';

describe('Bundled package resources', () => {
  it('locates the resources root', () => {
    const root = resourcesRoot();
    expect(existsSync(root)).toBe(true);
    expect(root.endsWith('resources')).toBe(true);
  });

  it('resolves the bundled system and harness trees', () => {
    expect(existsSync(bundledSystemRoot())).toBe(true);
    expect(existsSync(bundledHarnessRoot())).toBe(true);
  });

  it('joins resource paths under the resources root', () => {
    expect(resourcePath('system', 'manifest.yaml')).toBe(
      join(resourcesRoot(), 'system', 'manifest.yaml'),
    );
  });
});
