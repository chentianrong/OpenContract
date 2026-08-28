import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { OpenContractError } from '../domain/errors.js';
import type { WorkspaceConfig, WorkspaceRoot, ResolvedPaths } from '../domain/types.js';

/**
 * Default workspace configuration values when user does not supply them.
 */
interface DefaultConfigShape {
  readonly system: string;
  readonly cache: string;
  readonly projectActions: string;
  readonly projectContracts: string;
  readonly specs: string;
  readonly artifacts: string;
  readonly archive: string;
  readonly registries: string[];
  readonly trust: { readonly validatorRoots: string[] };
  readonly validator: {
    readonly pythonExecutable: string;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
  };
  readonly overrides: {
    readonly actions: Record<string, 'project' | 'system' | 'cache' | 'registry'>;
    readonly contracts: Record<string, 'project' | 'system' | 'cache' | 'registry'>;
  };
  readonly harnesses: string[];
}

const DEFAULT_CONFIG: DefaultConfigShape = {
  system: '.opencontract/system',
  cache: '.opencontract/cache',
  projectActions: '.opencontract/actions',
  projectContracts: '.opencontract/contracts',
  specs: 'opencontract/specs',
  artifacts: 'opencontract/artifacts',
  archive: 'opencontract/artifacts/archive',
  registries: [],
  trust: { validatorRoots: [] },
  validator: {
    pythonExecutable: 'python3',
    timeoutMs: 30_000,
    maxOutputBytes: 1_048_576, // 1 MiB
  },
  overrides: { actions: {}, contracts: {} },
  harnesses: ['codex', 'claude', 'cursor'],
};

/**
 * Search upward from `startDir` to locate the nearest `.opencontract/config.yaml`.
 * Returns undefined if no workspace is found before reaching the filesystem root.
 */
export function discoverWorkspace(startDir: string): WorkspaceRoot | undefined {
  let current = resolve(startDir);
  for (;;) {
    const configPath = join(current, '.opencontract', 'config.yaml');
    if (existsSync(configPath)) {
      let parsed: unknown;
      try {
        const raw = readFileSync(configPath, 'utf-8');
        parsed = parseYaml(raw);
      } catch (cause) {
        throw new OpenContractError('CONFIG_PARSE_ERROR', undefined, {
          path: configPath,
          detail: cause instanceof Error ? cause.message : String(cause),
          cause,
        });
      }
      // Structural validation reports CONFIG_INVALID and must not be
      // re-wrapped as a YAML syntax failure.
      try {
        return { root: current, configPath, config: mergeWithDefaults(parsed) };
      } catch (cause) {
        if (cause instanceof OpenContractError) {
          throw new OpenContractError(cause.code, cause.message, {
            path: configPath,
            detail: cause.detail,
            cause,
          });
        }
        throw cause;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined; // reached filesystem root
    }
    current = parent;
  }
}

/**
 * Like `discoverWorkspace` but throws `WORKSPACE_NOT_FOUND` instead of returning undefined.
 */
export function requireWorkspace(startDir: string): WorkspaceRoot {
  const found = discoverWorkspace(startDir);
  if (!found) {
    throw new OpenContractError('WORKSPACE_NOT_FOUND', undefined, { path: startDir });
  }
  return found;
}

function mergeWithDefaults(parsed: unknown): WorkspaceConfig {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new OpenContractError('CONFIG_INVALID', 'Configuration must be a YAML mapping.');
  }

  const obj = parsed as Record<string, unknown>;

  return {
    system: stringOrDefault(obj.system, DEFAULT_CONFIG.system),
    cache: stringOrDefault(obj.cache, DEFAULT_CONFIG.cache),
    projectActions: stringOrDefault(obj.projectActions, DEFAULT_CONFIG.projectActions),
    projectContracts: stringOrDefault(obj.projectContracts, DEFAULT_CONFIG.projectContracts),
    specs: stringOrDefault(obj.specs, DEFAULT_CONFIG.specs),
    artifacts: stringOrDefault(obj.artifacts, DEFAULT_CONFIG.artifacts),
    archive: stringOrDefault(obj.archive, DEFAULT_CONFIG.archive),
    registries: arrayOrDefault(obj.registries, DEFAULT_CONFIG.registries),
    trust: parseTrust(obj.trust),
    validator: parseValidator(obj.validator),
    overrides: parseOverrides(obj.overrides),
    harnesses: arrayOrDefault(obj.harnesses, DEFAULT_CONFIG.harnesses),
  };
}

function stringOrDefault(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return fallback;
  throw new OpenContractError('CONFIG_INVALID', `Expected string, got ${typeof value}`);
}

function arrayOrDefault(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string') {
        throw new OpenContractError('CONFIG_INVALID', 'Array must contain only strings.');
      }
    }
    return value;
  }
  if (value === undefined) return fallback;
  throw new OpenContractError('CONFIG_INVALID', `Expected array, got ${typeof value}`);
}

function parseTrust(value: unknown): NonNullable<WorkspaceConfig['trust']> {
  if (value === undefined) return DEFAULT_CONFIG.trust;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONFIG_INVALID', 'trust must be a mapping.');
  }
  const obj = value as Record<string, unknown>;
  return {
    validatorRoots: arrayOrDefault(obj.validatorRoots, DEFAULT_CONFIG.trust.validatorRoots),
  };
}

function parseValidator(value: unknown): NonNullable<WorkspaceConfig['validator']> {
  if (value === undefined) return DEFAULT_CONFIG.validator;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONFIG_INVALID', 'validator must be a mapping.');
  }
  const obj = value as Record<string, unknown>;
  return {
    pythonExecutable: stringOrDefault(
      obj.pythonExecutable,
      DEFAULT_CONFIG.validator.pythonExecutable,
    ),
    timeoutMs:
      typeof obj.timeoutMs === 'number' ? obj.timeoutMs : DEFAULT_CONFIG.validator.timeoutMs,
    maxOutputBytes:
      typeof obj.maxOutputBytes === 'number'
        ? obj.maxOutputBytes
        : DEFAULT_CONFIG.validator.maxOutputBytes,
  };
}

function parseOverrides(value: unknown): NonNullable<WorkspaceConfig['overrides']> {
  if (value === undefined) return DEFAULT_CONFIG.overrides;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONFIG_INVALID', 'overrides must be a mapping.');
  }
  const obj = value as Record<string, unknown>;
  return {
    actions: parseOverrideMap(obj.actions),
    contracts: parseOverrideMap(obj.contracts),
  };
}

function parseOverrideMap(
  value: unknown,
): Record<string, 'project' | 'system' | 'cache' | 'registry'> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenContractError('CONFIG_INVALID', 'overrides.actions/contracts must be a mapping.');
  }
  const obj = value as Record<string, unknown>;
  const result: Record<string, 'project' | 'system' | 'cache' | 'registry'> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== 'project' && val !== 'system' && val !== 'cache' && val !== 'registry') {
      throw new OpenContractError(
        'CONFIG_INVALID',
        `Override source must be project, system, cache, or registry; got ${val}`,
      );
    }
    result[key] = val;
  }
  return result;
}

/**
 * Resolve all configured paths against the workspace root and validate that
 * none escape the root (before or after symlink resolution).
 */
export function resolvePaths(workspace: WorkspaceRoot): ResolvedPaths {
  const { root, config } = workspace;

  return {
    root,
    configPath: workspace.configPath,
    system: validateRelative(root, config.system!, 'system'),
    cache: validateRelative(root, config.cache!, 'cache'),
    projectActions: validateRelative(root, config.projectActions!, 'projectActions'),
    projectContracts: validateRelative(root, config.projectContracts!, 'projectContracts'),
    specs: validateRelative(root, config.specs!, 'specs'),
    artifacts: validateRelative(root, config.artifacts!, 'artifacts'),
    archive: validateRelative(root, config.archive!, 'archive'),
    registries: config.registries!.map((reg, i) =>
      validateRelative(root, reg, `registries[${i}]`),
    ),
    trustedValidatorRoots: config.trust!.validatorRoots!.map((vr, i) =>
      validateRelative(root, vr, `trust.validatorRoots[${i}]`),
    ),
  };
}

function validateRelative(workspaceRoot: string, configuredPath: string, label: string): string {
  if (isAbsolute(configuredPath)) {
    throw new OpenContractError('PATH_NOT_RELATIVE', `${label} must be relative to the workspace.`, {
      path: configuredPath,
      detail: label,
    });
  }

  const resolved = resolve(workspaceRoot, configuredPath);

  // Check before realpath
  if (!isUnderRoot(workspaceRoot, resolved)) {
    throw new OpenContractError('PATH_ESCAPES_ROOT', `${label} escapes the workspace root.`, {
      path: resolved,
      detail: label,
    });
  }

  // Check after realpath (symlink resolution)
  let realResolved: string;
  try {
    if (existsSync(resolved)) {
      realResolved = realpathSync(resolved);
    } else {
      // If the path doesn't exist yet, check each ancestor that does exist
      realResolved = realpathOfNearestAncestor(resolved);
    }
  } catch (cause) {
    throw new OpenContractError('PATH_ESCAPES_ROOT', `Cannot resolve ${label} symlinks.`, {
      path: resolved,
      detail: label,
      cause,
    });
  }

  if (!isUnderRoot(workspaceRoot, realResolved)) {
    throw new OpenContractError(
      'PATH_SYMLINK_ESCAPE',
      `${label} resolves through a symlink outside the workspace.`,
      {
        path: resolved,
        detail: `real: ${realResolved}`,
      },
    );
  }

  return resolved;
}

function realpathOfNearestAncestor(path: string): string {
  let current = path;
  for (;;) {
    if (existsSync(current)) {
      return realpathSync(current);
    }
    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding an existing ancestor
      return path; // fallback to the original
    }
    current = parent;
  }
}

function isUnderRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePathForComparison(root);
  const normalizedCandidate = normalizePathForComparison(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

function normalizePathForComparison(path: string): string {
  // Ensure trailing slashes are removed and separators are normalized
  return resolve(path);
}

/**
 * Guard for inputs, artifact paths, and other references: reject absolute paths,
 * directory traversal that leaves the configured root, symlink escapes, and
 * directory targets where a file is required.
 */
export function validateReferencePath(
  baseDir: string,
  referencePath: string,
  root: string,
  opts: { mustExist?: boolean; mustBeFile?: boolean } = {},
): string {
  if (isAbsolute(referencePath)) {
    throw new OpenContractError('PATH_NOT_RELATIVE', 'References must be relative paths.', {
      path: referencePath,
    });
  }

  const resolved = resolve(baseDir, referencePath);

  if (!isUnderRoot(root, resolved)) {
    throw new OpenContractError('REFERENCE_UNSAFE', 'Reference escapes the managed root.', {
      path: referencePath,
      detail: `resolved: ${resolved}, root: ${root}`,
    });
  }

  if (opts.mustExist && !existsSync(resolved)) {
    throw new OpenContractError('REFERENCE_NOT_FOUND', 'Referenced path does not exist.', {
      path: referencePath,
    });
  }

  if (existsSync(resolved)) {
    let real: string;
    try {
      real = realpathSync(resolved);
    } catch (cause) {
      throw new OpenContractError('REFERENCE_UNSAFE', 'Cannot resolve reference symlinks.', {
        path: referencePath,
        cause,
      });
    }

    if (!isUnderRoot(root, real)) {
      throw new OpenContractError(
        'PATH_SYMLINK_ESCAPE',
        'Reference resolves through a symlink outside the managed root.',
        {
          path: referencePath,
          detail: `real: ${real}`,
        },
      );
    }

    if (opts.mustBeFile) {
      const stat = statSync(real);
      if (stat.isDirectory()) {
        throw new OpenContractError('REFERENCE_IS_DIRECTORY', 'Expected a file, got a directory.', {
          path: referencePath,
        });
      }
      if (!stat.isFile()) {
        throw new OpenContractError('PATH_NOT_FILE', 'Path is not a regular file.', {
          path: referencePath,
        });
      }
    }
  }

  return resolved;
}
