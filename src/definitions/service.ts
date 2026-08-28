import type { DefinitionResolver } from './resolver.js';
import type {
  ActionListItem,
  ActionInspectView,
  ContractListItem,
  ContractInspectView,
} from './presentation.js';
import {
  toActionListItem,
  toActionInspectView,
  toContractListItem,
  toContractInspectView,
} from './presentation.js';

/**
 * Application service for querying Actions and Contracts. This layer sits
 * between the CLI and the resolver, converting domain models to presentation
 * models and handling not-found cases with appropriate error codes.
 */
export class DefinitionQueryService {
  constructor(private readonly resolver: DefinitionResolver) {}

  /**
   * List all available Actions across all sources, sorted by name.
   */
  listActions(): ActionListItem[] {
    return this.resolver
      .listActions()
      .map(toActionListItem)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Inspect a specific Action by exact name and version.
   * Throws ACTION_NOT_FOUND if the definition does not exist.
   */
  inspectAction(name: string, version: string): ActionInspectView {
    const def = this.resolver.resolveAction(name, version);
    return toActionInspectView(def);
  }

  /**
   * List all available Contracts across all sources, sorted by name.
   */
  listContracts(): ContractListItem[] {
    return this.resolver
      .listContracts()
      .map(toContractListItem)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Inspect a specific Contract by exact name and version.
   * Throws CONTRACT_NOT_FOUND if the definition does not exist.
   */
  inspectContract(name: string, version: string): ContractInspectView {
    const def = this.resolver.resolveContract(name, version);
    return toContractInspectView(def);
  }
}
