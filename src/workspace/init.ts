import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenContractError } from '../domain/errors.js';
import { discoverWorkspace } from './discovery.js';
import { isGlobalSystemInstalled } from '../system/install.js';

/**
 * Initialize a new OpenContract workspace in the target directory.
 * Creates the required directory structure and default configuration.
 * Does not overwrite an existing workspace.
 */
export function initWorkspace(
  targetDir: string,
  options: {
    harnesses?: string[];
    checkGlobalSystem?: boolean;
    /**
     * Keep the system and cache inside the project instead of referencing the
     * global installation. The documented fallback for a home directory on a
     * slow network filesystem, and what the local-tree tests exercise.
     */
    localSystem?: boolean;
  } = {},
): void {
  // Check if workspace already exists
  if (discoverWorkspace(targetDir)) {
    throw new OpenContractError(
      'WORKSPACE_EXISTS',
      'An OpenContract workspace already exists at this location.',
      { path: targetDir },
    );
  }

  const localSystem = options.localSystem === true;

  // A local-system workspace carries its own tree, so the global one is not required.
  if (!localSystem && options.checkGlobalSystem !== false && !isGlobalSystemInstalled()) {
    throw new OpenContractError(
      'GLOBAL_SYSTEM_NOT_INSTALLED',
      'Global system not installed. Run "opencontract install" first.',
      { path: targetDir },
    );
  }

  const harnesses = options.harnesses ?? ['codex', 'claude', 'cursor'];

  const dirs = [
    '.opencontract',
    '.opencontract/actions',
    '.opencontract/contracts',
    'opencontract',
    'opencontract/specs',
    'opencontract/artifacts',
    'opencontract/artifacts/archive',
    // The system and cache live under ~/ unless this workspace opted out.
    ...(localSystem ? ['.opencontract/system', '.opencontract/cache'] : []),
  ];

  for (const dir of dirs) {
    const fullPath = join(targetDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  const configPath = join(targetDir, '.opencontract', 'config.yaml');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, generateDefaultConfig(harnesses, localSystem), 'utf-8');
  }

  // Create harness adapter directories (actual adapters will be generated separately)
  for (const harness of harnesses) {
    const harnessDir = join(targetDir, `.${harness}`, 'skills');
    mkdirSync(harnessDir, { recursive: true });
  }
}

function generateDefaultConfig(harnesses: string[], localSystem: boolean): string {
  const systemPath = localSystem ? '.opencontract/system' : '~/.opencontract/system';
  const cachePath = localSystem ? '.opencontract/cache' : '~/.opencontract/cache';
  const validatorRoot = localSystem ? '.opencontract/system' : '~/.opencontract/system';

  return `# OpenContract workspace configuration
# Project paths are relative to the workspace root (parent of .opencontract/).
# System paths point at the shared global installation under ~/.

# System-owned definition tree (shared across projects)
system: ${systemPath}

# Cached exact-version definitions (shared across projects)
cache: ${cachePath}

# Project-owned Action and Contract extensions
projectActions: .opencontract/actions
projectContracts: .opencontract/contracts

# Canonical specifications and managed artifacts
specs: opencontract/specs
artifacts: opencontract/artifacts
archive: opencontract/artifacts/archive

# Local registries (optional)
registries: []

# Trust configuration for semantic validators
trust:
  validatorRoots:
    - ${validatorRoot}

# Validator subprocess configuration
validator:
  pythonExecutable: python3
  timeoutMs: 30000
  maxOutputBytes: 1048576

# Definition source overrides (optional)
overrides:
  actions: {}
  contracts: {}

# Selected harness adapters
harnesses: [${harnesses.map((h) => `"${h}"`).join(', ')}]
`;
}

/**
 * Check if a workspace is properly initialized by verifying required paths exist.
 */
export function isWorkspaceInitialized(workspaceRoot: string): boolean {
  const requiredPaths = [
    '.opencontract/config.yaml',
    'opencontract/specs',
    'opencontract/artifacts',
  ];

  return requiredPaths.every((path) => existsSync(join(workspaceRoot, path)));
}
