import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  DoctorCheck,
  DoctorResult,
  ResolvedPaths,
  SystemManifest,
  WorkspaceConfig,
} from '../domain/types.js';
import { repairHintFor } from '../domain/errors.js';
import type { DefinitionResolver } from '../definitions/resolver.js';
import { adapterFor, isGenerated, SUPPORTED_HARNESSES } from './harnesses.js';

/**
 * Workspace health checks behind `doctor`.
 *
 * Each check names the component it examined so a failure points at one thing to
 * repair. Checks that describe an optional feature report healthy with an
 * explanatory message rather than failing the workspace.
 */

function ok(component: string, message: string): DoctorCheck {
  return { component, healthy: true, message };
}

function bad(component: string, message: string, code: string): DoctorCheck {
  return { component, healthy: false, message, repairHint: repairHintFor(code) };
}

function checkConfiguration(paths: ResolvedPaths): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  if (!existsSync(paths.configPath)) {
    return [bad('configuration', 'The workspace configuration is missing.', 'WORKSPACE_NOT_FOUND')];
  }
  checks.push(ok('configuration', `Configuration found at ${paths.configPath}.`));

  // Roots the workspace cannot operate without.
  for (const [component, path] of [
    ['system-root', paths.system],
    ['artifacts-root', paths.artifacts],
    ['specs-root', paths.specs],
  ] as const) {
    if (!existsSync(path)) {
      checks.push(bad(component, `${component} does not exist: ${path}`, 'SYSTEM_MISSING'));
    } else if (!statSync(path).isDirectory()) {
      checks.push(bad(component, `${component} is not a directory: ${path}`, 'CONFIG_INVALID'));
    } else {
      checks.push(ok(component, `${path} is present.`));
    }
  }

  return checks;
}

function checkManifest(paths: ResolvedPaths, resolver: DefinitionResolver): DoctorCheck[] {
  const manifestPath = join(paths.system, 'manifest.yaml');
  if (!existsSync(manifestPath)) {
    return [bad('manifest', 'The system manifest is missing.', 'MANIFEST_MISSING')];
  }

  let manifest: SystemManifest;
  try {
    manifest = parseYaml(readFileSync(manifestPath, 'utf-8')) as SystemManifest;
  } catch (cause) {
    return [
      bad(
        'manifest',
        `The system manifest is not valid YAML: ${cause instanceof Error ? cause.message : String(cause)}`,
        'MANIFEST_INVALID',
      ),
    ];
  }

  if (!Array.isArray(manifest?.actions) || !Array.isArray(manifest?.contracts)) {
    return [
      bad('manifest', 'The system manifest does not list actions and contracts.', 'MANIFEST_INVALID'),
    ];
  }

  const checks: DoctorCheck[] = [
    ok(
      'manifest',
      `Manifest lists ${manifest.actions.length} Action(s) and ${manifest.contracts.length} Contract(s).`,
    ),
  ];

  // Every manifest entry must point at a package that is actually installed.
  const missing = [...manifest.actions, ...manifest.contracts].filter(
    (entry) => !existsSync(join(paths.system, entry.packagePath)),
  );
  if (missing.length > 0) {
    checks.push(
      bad(
        'manifest',
        `Manifest references ${missing.length} package(s) that are not installed: ${missing
          .map((e) => `${e.name}@${e.version}`)
          .join(', ')}`,
        'MANIFEST_INVALID',
      ),
    );
  } else {
    checks.push(ok('manifest', 'Every manifest entry resolves to an installed package.'));
  }

  // The installed catalog must be parseable, not merely present.
  try {
    const actions = resolver.listActions();
    const contracts = resolver.listContracts();
    checks.push(
      ok('definitions', `${actions.length} Action(s) and ${contracts.length} Contract(s) parse.`),
    );

    const manifestActions = new Set(manifest.actions.map((e) => e.name));
    const parsedActions = new Set(actions.map((a) => a.name));
    const unparseable = [...manifestActions].filter((name) => !parsedActions.has(name));
    if (unparseable.length > 0) {
      checks.push(
        bad(
          'definitions',
          `Manifest Action(s) failed to parse: ${unparseable.join(', ')}`,
          'SYSTEM_INVALID',
        ),
      );
    }
  } catch (cause) {
    checks.push(
      bad(
        'definitions',
        `Definition enumeration failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        'SYSTEM_INVALID',
      ),
    );
  }

  return checks;
}

function checkTrustedRoots(paths: ResolvedPaths): DoctorCheck[] {
  if (paths.trustedValidatorRoots.length === 0) {
    // Not a defect: semantic validators are optional, and no trusted root means
    // none will run.
    return [
      ok('trust', 'No trusted validator roots configured; semantic validators will be skipped.'),
    ];
  }

  const checks: DoctorCheck[] = [];
  for (const root of paths.trustedValidatorRoots) {
    if (!existsSync(root)) {
      checks.push(bad('trust', `Trusted validator root does not exist: ${root}`, 'CONFIG_INVALID'));
    } else if (!statSync(root).isDirectory()) {
      checks.push(bad('trust', `Trusted validator root is not a directory: ${root}`, 'CONFIG_INVALID'));
    } else {
      checks.push(ok('trust', `Trusted validator root ${root} is present.`));
    }
  }
  return checks;
}

function checkCaches(paths: ResolvedPaths): DoctorCheck[] {
  if (!existsSync(paths.cache)) {
    return [ok('cache', 'No cache directory yet; it is created on first update.')];
  }
  if (!statSync(paths.cache).isDirectory()) {
    return [bad('cache', `The cache path is not a directory: ${paths.cache}`, 'CACHE_INVALID')];
  }

  // A cache entry is a snapshot directory; a stray file means a partial write.
  const strayFiles = readdirSync(paths.cache, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  return strayFiles.length > 0
    ? [
        bad(
          'cache',
          `The cache contains ${strayFiles.length} unexpected file(s): ${strayFiles.join(', ')}`,
          'CACHE_INVALID',
        ),
      ]
    : [ok('cache', 'The cache directory is well-formed.')];
}

function checkAdapters(paths: ResolvedPaths, config: WorkspaceConfig): DoctorCheck[] {
  const selected = config.harnesses ?? [];
  if (selected.length === 0) {
    return [ok('adapters', 'No harness adapters selected.')];
  }

  const checks: DoctorCheck[] = [];
  for (const harness of selected) {
    const adapter = adapterFor(harness);
    if (!adapter) {
      checks.push(
        bad(
          'adapters',
          `Configured harness "${harness}" is not supported. Supported: ${SUPPORTED_HARNESSES.map(
            (a) => a.name,
          ).join(', ')}`,
          'CONFIG_INVALID',
        ),
      );
      continue;
    }

    const target = join(paths.root, adapter.relativePath);
    if (!existsSync(target)) {
      checks.push(bad('adapters', `The ${harness} adapter is not installed.`, 'ADAPTER_MISSING'));
    } else if (!isGenerated(target)) {
      // An unmarked file is user-authored; update will not touch it.
      checks.push(
        bad(
          'adapters',
          `${adapter.relativePath} exists but is not OpenContract-owned.`,
          'ADAPTER_CONFLICT',
        ),
      );
    } else {
      checks.push(ok('adapters', `The ${harness} adapter is installed and OpenContract-owned.`));
    }
  }

  return checks;
}

/** Run every check and summarize. */
export function runDoctor(
  paths: ResolvedPaths,
  config: WorkspaceConfig,
  resolver: DefinitionResolver,
): DoctorResult {
  const checks: DoctorCheck[] = [
    ...checkConfiguration(paths),
    ...checkManifest(paths, resolver),
    ...checkTrustedRoots(paths),
    ...checkCaches(paths),
    ...checkAdapters(paths, config),
  ];

  return { healthy: checks.every((c) => c.healthy), checks };
}
