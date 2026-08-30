import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { bundledSystemRoot } from '../resources.js';
import { generateAdapters } from './generators.js';

/**
 * Options for global system installation.
 */
export interface InstallOptions {
  /** Selected harnesses for user-level adapter generation. */
  readonly harnesses: string[];
  /** Overwrite existing installation. */
  readonly force?: boolean;
  /**
   * Override the home directory the global tree is installed under. Defaults to
   * `os.homedir()`; tests point it at a temporary directory so they never touch
   * the real `~`.
   */
  readonly home?: string;
}

/**
 * Result of global system installation.
 */
export interface InstallResult {
  readonly success: boolean;
  readonly globalRoot: string;
  readonly systemRoot: string;
  readonly cacheRoot: string;
  readonly configPath: string;
  readonly userAdapters: Record<string, { commands: number; skills: number }>;
  readonly errors: string[];
}

/**
 * Install OpenContract global system to ~/.opencontract/.
 * Creates system/, cache/, and global-config.yaml with selected harnesses.
 * Generates user-level adapters at ~/.{harness}/ for each selected harness.
 */
export function installGlobalSystem(options: InstallOptions): InstallResult {
  const home = options.home ?? homedir();
  const globalRoot = join(home, '.opencontract');
  const systemRoot = join(globalRoot, 'system');
  const cacheRoot = join(globalRoot, 'cache');
  const configPath = join(globalRoot, 'global-config.yaml');
  const errors: string[] = [];
  const userAdapters: Record<string, { commands: number; skills: number }> = {};

  // Check if already installed
  if (!options.force && existsSync(join(systemRoot, 'manifest.yaml'))) {
    errors.push('Global system already installed. Use --force to reinstall.');
    return {
      success: false,
      globalRoot,
      systemRoot,
      cacheRoot,
      configPath,
      userAdapters,
      errors,
    };
  }

  try {
    // Create directory structure
    mkdirSync(systemRoot, { recursive: true });
    mkdirSync(cacheRoot, { recursive: true });

    // Copy bundled system
    const bundled = bundledSystemRoot();
    cpSync(bundled, systemRoot, { recursive: true });

    // Write global config with selected harnesses
    const configContent = generateGlobalConfig(options.harnesses);
    writeFileSync(configPath, configContent, 'utf-8');

    // Generate user-level adapters for each harness
    for (const harness of options.harnesses) {
      const targetRoot = join(home, `.${harness}`);
      try {
        const result = generateAdapters({
          systemRoot,
          targetRoot,
          harness,
          force: options.force,
        });

        if (result.collisions.length > 0) {
          errors.push(
            `Adapter collision for ${harness}: ${result.collisions.join(', ')}. Use --force to overwrite.`,
          );
        } else {
          userAdapters[harness] = {
            commands: result.commands.length,
            skills: result.skills.length,
          };
        }
      } catch (err) {
        errors.push(
          `Failed to generate adapters for ${harness}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      success: errors.length === 0,
      globalRoot,
      systemRoot,
      cacheRoot,
      configPath,
      userAdapters,
      errors,
    };
  } catch (err) {
    errors.push(`Installation failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      globalRoot,
      systemRoot,
      cacheRoot,
      configPath,
      userAdapters,
      errors,
    };
  }
}

function generateGlobalConfig(harnesses: string[]): string {
  const now = new Date().toISOString();
  return `# OpenContract global configuration
# Created: ${now}

# Selected harnesses for adapter generation
harnesses: [${harnesses.map((h) => `"${h}"`).join(', ')}]
`;
}

/**
 * Check if global system is installed. `home` overrides the home directory for
 * tests; production callers pass nothing and get `os.homedir()`.
 */
export function isGlobalSystemInstalled(home?: string): boolean {
  const root = home ?? homedir();
  const manifestPath = join(root, '.opencontract', 'system', 'manifest.yaml');
  return existsSync(manifestPath);
}

/**
 * Harnesses recorded in the global config, used to pre-select the checkbox when
 * a project initializes. Returns undefined when there is no global config or it
 * carries no harness list, so callers can fall back to their own default.
 */
export function readGlobalHarnesses(home?: string): string[] | undefined {
  const root = home ?? homedir();
  const configPath = join(root, '.opencontract', 'global-config.yaml');
  if (!existsSync(configPath)) return undefined;

  try {
    const parsed = parseYaml(readFileSync(configPath, 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const harnesses = (parsed as Record<string, unknown>).harnesses;
    if (!Array.isArray(harnesses)) return undefined;
    const names = harnesses.filter((h): h is string => typeof h === 'string');
    return names.length > 0 ? names : undefined;
  } catch {
    // A malformed global config must not block project initialization.
    return undefined;
  }
}
