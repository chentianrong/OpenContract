import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface UninstallOptions {
  readonly home?: string;
  readonly keepCache?: boolean;
}

export interface UninstallResult {
  readonly success: boolean;
  readonly removed: string[];
  readonly preserved: string[];
  readonly errors: string[];
}

const HARNESSES = ['claude', 'codex', 'cursor'];

export function uninstallGlobalSystem(options: UninstallOptions = {}): UninstallResult {
  const home = options.home ?? homedir();
  const globalRoot = join(home, '.opencontract');
  const systemRoot = join(globalRoot, 'system');
  const configPath = join(globalRoot, 'config.yaml');
  const cacheRoot = join(globalRoot, 'cache');

  const removed: string[] = [];
  const preserved: string[] = [];
  const errors: string[] = [];

  // System
  if (existsSync(systemRoot)) {
    try {
      rmSync(systemRoot, { recursive: true, force: true });
      removed.push(systemRoot);
    } catch (err) {
      errors.push(`Failed to remove ${systemRoot}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Config
  if (existsSync(configPath)) {
    try {
      rmSync(configPath, { force: true });
      removed.push(configPath);
    } catch (err) {
      errors.push(`Failed to remove ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Cache
  if (!options.keepCache && existsSync(cacheRoot)) {
    try {
      rmSync(cacheRoot, { recursive: true, force: true });
      removed.push(cacheRoot);
    } catch (err) {
      errors.push(`Failed to remove ${cacheRoot}: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (existsSync(cacheRoot)) {
    preserved.push(cacheRoot);
  }

  // User adapters
  for (const harness of HARNESSES) {
    const harnessRoot = join(home, `.${harness}`);
    if (!existsSync(harnessRoot)) continue;

    const commandsDir = join(harnessRoot, 'commands', 'oc');
    if (existsSync(commandsDir)) {
      try {
        rmSync(commandsDir, { recursive: true, force: true });
        removed.push(commandsDir);
      } catch (err) {
        errors.push(`Failed to remove ${commandsDir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const skillsRoot = join(harnessRoot, 'skills');
    if (existsSync(skillsRoot)) {
      for (const entry of readdirSync(skillsRoot)) {
        if (entry.startsWith('oc-')) {
          const skillDir = join(skillsRoot, entry);
          try {
            rmSync(skillDir, { recursive: true, force: true });
            removed.push(skillDir);
          } catch (err) {
            errors.push(`Failed to remove ${skillDir}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  }

  // Clean up empty .opencontract
  if (existsSync(globalRoot) && readdirSync(globalRoot).length === 0) {
    try {
      rmSync(globalRoot, { recursive: true, force: true });
      removed.push(globalRoot);
    } catch {
      // Ignore
    }
  }

  return { success: errors.length === 0, removed, preserved, errors };
}

export function isGlobalSystemInstalled(home?: string): boolean {
  const root = home ?? homedir();
  return existsSync(join(root, '.opencontract', 'system', 'manifest.yaml'));
}
