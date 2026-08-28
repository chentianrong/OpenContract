import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';
import matter from 'gray-matter';
import {
  enumerateActions,
  enumerateContracts,
  parseActionDefinition,
  parseContractDefinition,
} from '../src/definitions/parser.js';
import { bundledSystemRoot } from '../src/resources.js';
import type { SystemManifest } from '../src/domain/types.js';

/**
 * The bundled catalog is the shipped product surface: the entry Action, the
 * twelve business Actions, and the fourteen Contracts must all be present at
 * exact v1.0.0 and parse under the same rules validation uses.
 */

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
] as const;

const CONTRACTS = [
  'note',
  'decision',
  'decomposition',
  'suggestion',
  'proposal',
  'specification',
  'design',
  'tasks',
  'execution-report',
  'debug-report',
  'review-report',
  'verification-report',
  'report',
  'archive-report',
] as const;

function readManifest(): SystemManifest {
  const manifestPath = join(bundledSystemRoot(), 'manifest.yaml');
  return parseYaml(readFileSync(manifestPath, 'utf-8')) as SystemManifest;
}

describe('Bundled Action catalog', () => {
  it('ships the entry Action plus the twelve business Actions at v1.0.0', () => {
    const actions = enumerateActions(join(bundledSystemRoot(), 'actions'), 'system');
    const names = actions.map((a) => a.name).sort();

    expect(names).toEqual([...BUSINESS_ACTIONS, 'opencontract'].sort());
    for (const action of actions) {
      expect(action.version).toBe('v1.0.0');
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it('parses every bundled Action without falling back to enumeration skipping', () => {
    // enumerateActions silently skips malformed packages, so parse each
    // directly to surface any metadata failure.
    for (const name of [...BUSINESS_ACTIONS, 'opencontract']) {
      const skillPath = join(bundledSystemRoot(), 'actions', name, 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      const action = parseActionDefinition(skillPath, 'system');
      expect(action.name).toBe(name);
      expect(action.version).toBe('v1.0.0');
    }
  });

  it('declares only exact v1.0.0 contract references', () => {
    const actions = enumerateActions(join(bundledSystemRoot(), 'actions'), 'system');
    for (const action of actions) {
      for (const declaration of [...action.inputs, ...action.outputs]) {
        expect(declaration.version).toBe('v1.0.0');
        expect(CONTRACTS).toContain(declaration.contract as (typeof CONTRACTS)[number]);
      }
    }
  });

  it('keeps the entry Action free of concrete business declarations', () => {
    const entry = parseActionDefinition(
      join(bundledSystemRoot(), 'actions', 'opencontract', 'SKILL.md'),
      'system',
    );
    expect(entry.inputs).toEqual([]);
    expect(entry.outputs).toEqual([]);
  });

  it('gives every business Action at least one declared output', () => {
    for (const name of BUSINESS_ACTIONS) {
      const action = parseActionDefinition(
        join(bundledSystemRoot(), 'actions', name, 'SKILL.md'),
        'system',
      );
      expect(action.outputs.length).toBeGreaterThan(0);
    }
  });
});

describe('Bundled Contract catalog', () => {
  it('ships the fourteen Contracts at v1.0.0', () => {
    const contracts = enumerateContracts(join(bundledSystemRoot(), 'contracts'), 'system');
    expect(contracts.map((c) => c.name).sort()).toEqual([...CONTRACTS].sort());

    for (const contract of contracts) {
      expect(contract.version).toBe('v1.0.0');
      expect(contract.artifactCoreVersion).toBe('v1.0.0');
      expect(contract.description.length).toBeGreaterThan(0);
    }
  });

  it('parses every bundled Contract directly', () => {
    for (const name of CONTRACTS) {
      const packagePath = join(bundledSystemRoot(), 'contracts', name);
      expect(existsSync(join(packagePath, 'contract.md'))).toBe(true);
      const contract = parseContractDefinition(packagePath, 'system');
      expect(contract.name).toBe(name);
      expect(contract.version).toBe('v1.0.0');
      expect(existsSync(contract.templatePath)).toBe(true);
    }
  });

  it('gives every template the artifact-core metadata fields', () => {
    const required = ['contract', 'version', 'action', 'action_version', 'created_at', 'inputs'];
    for (const name of CONTRACTS) {
      const contract = parseContractDefinition(
        join(bundledSystemRoot(), 'contracts', name),
        'system',
      );
      const template = readFileSync(contract.templatePath, 'utf-8');
      const parsed = matter(template);
      for (const field of required) {
        expect(Object.keys(parsed.data)).toContain(field);
      }
      expect(parsed.data.contract).toBe(name);
      expect(parsed.data.version).toBe('v1.0.0');
    }
  });

  it('declares required sections that appear in the template', () => {
    for (const name of CONTRACTS) {
      const contract = parseContractDefinition(
        join(bundledSystemRoot(), 'contracts', name),
        'system',
      );
      const body = matter(readFileSync(contract.templatePath, 'utf-8')).content;
      for (const section of contract.rules.sections ?? []) {
        if (!section.required) continue;
        const heading = `${'#'.repeat(section.level)} ${section.name}`;
        expect(body).toContain(heading);
      }
    }
  });

  it('ships a valid and an invalid fixture for every Contract', () => {
    for (const name of CONTRACTS) {
      const packagePath = join(bundledSystemRoot(), 'contracts', name);
      expect(existsSync(join(packagePath, 'fixtures', 'valid'))).toBe(true);
      expect(existsSync(join(packagePath, 'fixtures', 'invalid'))).toBe(true);
    }
  });
});

describe('System manifest', () => {
  it('records every bundled Action and Contract at v1.0.0', () => {
    const manifest = readManifest();

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.actions.map((a) => a.name).sort()).toEqual(
      [...BUSINESS_ACTIONS, 'opencontract'].sort(),
    );
    expect(manifest.contracts.map((c) => c.name).sort()).toEqual([...CONTRACTS].sort());

    for (const entry of [...manifest.actions, ...manifest.contracts]) {
      expect(entry.version).toBe('v1.0.0');
      expect(entry.packagePath).toMatch(/^(actions|contracts)\//);
    }
  });

  it('points every manifest entry at a package that exists on disk', () => {
    const manifest = readManifest();
    for (const entry of [...manifest.actions, ...manifest.contracts]) {
      expect(existsSync(join(bundledSystemRoot(), entry.packagePath))).toBe(true);
    }
  });
});
