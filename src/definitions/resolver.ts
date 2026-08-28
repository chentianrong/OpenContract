import { join } from 'node:path';
import { OpenContractError } from '../domain/errors.js';
import type {
  ActionDefinition,
  ContractDefinition,
  DefinitionSource,
  ResolvedPaths,
  WorkspaceConfig,
} from '../domain/types.js';
import { enumerateActions, enumerateContracts } from './parser.js';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

/**
 * Exact-version definition resolution across project, system, cache, and
 * registry sources. Requires explicit overrides when the same name/version
 * exists in multiple sources or when both project and system provide a
 * definition without an override.
 */
export class DefinitionResolver {
  private actionCache: Map<string, ActionDefinition[]> | undefined;
  private contractCache: Map<string, ContractDefinition[]> | undefined;

  constructor(
    private readonly paths: ResolvedPaths,
    private readonly config: WorkspaceConfig,
  ) {}

  /**
   * Resolve an Action by exact name and version. Throws ACTION_NOT_FOUND if
   * the definition does not exist, or DEFINITION_SOURCE_CONFLICT if it exists
   * in multiple sources without an override.
   */
  resolveAction(name: string, version: string): ActionDefinition {
    this.validateVersionFormat(version);
    const all = this.enumerateAllActions();
    const candidates = all.filter((def) => def.name === name && def.version === version);

    if (candidates.length === 0) {
      throw new OpenContractError(
        'ACTION_NOT_FOUND',
        `No Action definition for ${name}@${version}.`,
        { detail: `${name}@${version}` },
      );
    }

    return this.selectCandidate(
      candidates,
      this.config.overrides?.actions?.[name],
      'Action',
      name,
      version,
    );
  }

  /**
   * Resolve a Contract by exact name and version.
   */
  resolveContract(name: string, version: string): ContractDefinition {
    this.validateVersionFormat(version);
    const all = this.enumerateAllContracts();
    const candidates = all.filter((def) => def.name === name && def.version === version);

    if (candidates.length === 0) {
      throw new OpenContractError(
        'CONTRACT_NOT_FOUND',
        `No Contract definition for ${name}@${version}.`,
        { detail: `${name}@${version}` },
      );
    }

    return this.selectCandidate(
      candidates,
      this.config.overrides?.contracts?.[name],
      'Contract',
      name,
      version,
    );
  }

  /**
   * Select a definition from candidates, applying override rules. An override
   * selects the source even when there's only one candidate, and must point at
   * a source that actually provides the definition.
   */
  private selectCandidate<T extends { source: DefinitionSource }>(
    candidates: T[],
    override: DefinitionSource | undefined,
    kind: 'Action' | 'Contract',
    name: string,
    version: string,
  ): T {
    if (candidates.length === 0) {
      throw new Error('selectCandidate called with empty candidates array');
    }

    if (override) {
      const selected = candidates.find((c) => c.source === override);
      if (!selected) {
        throw new OpenContractError(
          'DEFINITION_OVERRIDE_INVALID',
          `Override selects ${override} for ${name}, but that source does not provide ${version}.`,
          { detail: `${name}@${version}` },
        );
      }
      return selected;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Multiple sources without override
    const sources = candidates.map((c) => c.source).join(', ');
    throw new OpenContractError(
      'DEFINITION_SOURCE_CONFLICT',
      `${kind} ${name}@${version} exists in multiple sources: ${sources}.`,
      { detail: `${name}@${version}` },
    );
  }

  /**
   * List all available Actions across all sources.
   */
  listActions(): ActionDefinition[] {
    return this.enumerateAllActions();
  }

  /**
   * List all available Contracts across all sources.
   */
  listContracts(): ContractDefinition[] {
    return this.enumerateAllContracts();
  }

  private enumerateAllActions(): ActionDefinition[] {
    if (this.actionCache) {
      return Array.from(this.actionCache.values()).flat();
    }

    const all: ActionDefinition[] = [];
    all.push(...enumerateActions(this.paths.projectActions, 'project'));
    all.push(...enumerateActions(join(this.paths.system, 'actions'), 'system'));
    // Cache and registry enumeration deferred to future tasks

    this.actionCache = new Map();
    for (const def of all) {
      const key = `${def.name}@${def.version}`;
      if (!this.actionCache.has(key)) {
        this.actionCache.set(key, []);
      }
      this.actionCache.get(key)!.push(def);
    }

    return all;
  }

  private enumerateAllContracts(): ContractDefinition[] {
    if (this.contractCache) {
      return Array.from(this.contractCache.values()).flat();
    }

    const all: ContractDefinition[] = [];
    all.push(...enumerateContracts(this.paths.projectContracts, 'project'));
    all.push(...enumerateContracts(join(this.paths.system, 'contracts'), 'system'));
    // Cache and registry enumeration deferred to future tasks

    this.contractCache = new Map();
    for (const def of all) {
      const key = `${def.name}@${def.version}`;
      if (!this.contractCache.has(key)) {
        this.contractCache.set(key, []);
      }
      this.contractCache.get(key)!.push(def);
    }

    return all;
  }

  private validateVersionFormat(version: string): void {
    if (!VERSION_PATTERN.test(version)) {
      throw new OpenContractError(
        'INVALID_VERSION_REFERENCE',
        `Version must be exact vX.Y.Z; got "${version}".`,
        { detail: version },
      );
    }
  }

  /**
   * Clear caches to force re-enumeration. Used after system updates or in tests.
   */
  clearCache(): void {
    this.actionCache = undefined;
    this.contractCache = undefined;
  }
}
