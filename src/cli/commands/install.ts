import { EXIT_CODES } from '../../domain/errors.js';
import { installGlobalSystem, isGlobalSystemInstalled } from '../../system/install.js';
import { intro, note, outro, promptHarnessSelection } from '../prompts.js';

const SUPPORTED_HARNESSES = ['codex', 'claude', 'cursor'];

export interface InstallCommandOptions {
  readonly force?: boolean;
  readonly nonInteractive?: boolean;
  readonly harness?: string;
}

/**
 * `opencontract install` — create the global system at `~/.opencontract/` and
 * generate user-level harness adapters.
 *
 * Exit codes: 0 success, 1 already installed without `--force`,
 * 2 validation/permission failure (including adapter collisions).
 */
export async function runInstallCommand(options: InstallCommandOptions): Promise<number> {
  const interactive = !options.nonInteractive;

  // Already-installed check happens before prompting so the user is not asked
  // to pick harnesses for an install that is going to be refused.
  if (!options.force && isGlobalSystemInstalled()) {
    process.stderr.write('Already installed. Use --force to reinstall.\n');
    return EXIT_CODES.INVALID_CONTENT;
  }

  let harnesses: string[];

  if (options.harness) {
    harnesses = options.harness
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    const unknown = harnesses.filter((name) => !SUPPORTED_HARNESSES.includes(name));
    if (unknown.length > 0) {
      process.stderr.write(
        `Unknown harness: ${unknown.join(', ')}. Supported: ${SUPPORTED_HARNESSES.join(', ')}.\n`,
      );
      return EXIT_CODES.CONFIGURATION;
    }
    if (harnesses.length === 0) {
      process.stderr.write('--harness requires at least one harness name.\n');
      return EXIT_CODES.CONFIGURATION;
    }
  } else if (interactive) {
    intro('OpenContract — install global system');
    harnesses = await promptHarnessSelection();
  } else {
    process.stderr.write(
      '--harness is required with --non-interactive (e.g. --harness claude,cursor).\n',
    );
    return EXIT_CODES.CONFIGURATION;
  }

  const result = installGlobalSystem({ harnesses, force: options.force });

  if (!result.success) {
    for (const message of result.errors) {
      process.stderr.write(`${message}\n`);
    }
    return EXIT_CODES.CONFIGURATION;
  }

  const summary = [
    `System:  ${result.systemRoot}`,
    `Cache:   ${result.cacheRoot}`,
    `Config:  ${result.configPath}`,
    '',
    ...Object.entries(result.userAdapters).map(
      ([harness, counts]) =>
        `${harness}: ${counts.commands} commands, ${counts.skills} skills`,
    ),
  ].join('\n');

  if (interactive) {
    note(summary, 'Installed');
    outro('Global system installed. Run `opencontract init` in a project to get started.');
  } else {
    process.stdout.write(`${summary}\n`);
  }

  return EXIT_CODES.VALID;
}
