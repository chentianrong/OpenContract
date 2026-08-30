import { EXIT_CODES } from '../../domain/errors.js';
import { uninstallGlobalSystem, isGlobalSystemInstalled } from '../../system/uninstall.js';
import { intro, note, outro, promptConfirm } from '../prompts.js';

export interface UninstallCommandOptions {
  readonly keepCache?: boolean;
  readonly nonInteractive?: boolean;
}

export async function runUninstallCommand(options: UninstallCommandOptions): Promise<number> {
  const interactive = !options.nonInteractive;

  if (!isGlobalSystemInstalled()) {
    if (interactive) {
      process.stderr.write('Global system not installed. Nothing to uninstall.\n');
    }
    return EXIT_CODES.INVALID_CONTENT;
  }

  if (interactive) {
    intro('OpenContract — uninstall global system');
    const confirmed = await promptConfirm(
      'Remove ~/.opencontract/ and user-level adapters?',
      false,
    );
    if (!confirmed) {
      outro('Cancelled.');
      return EXIT_CODES.VALID;
    }
  }

  const result = uninstallGlobalSystem({ keepCache: options.keepCache });

  if (!result.success) {
    for (const message of result.errors) {
      process.stderr.write(`${message}\n`);
    }
    return EXIT_CODES.CONFIGURATION;
  }

  const summary = [
    'Removed:',
    ...result.removed.map((p) => `  ${p}`),
    ...(result.preserved.length > 0
      ? ['', 'Preserved:', ...result.preserved.map((p) => `  ${p}`)]
      : []),
  ].join('\n');

  if (interactive) {
    note(summary, 'Uninstalled');
    outro('Global system removed.');
  } else {
    process.stdout.write(`${summary}\n`);
  }

  return EXIT_CODES.VALID;
}
