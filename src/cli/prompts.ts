import * as clack from '@clack/prompts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Prompt user to select harnesses with a checkbox interface.
 * Detects existing harness directories in ~/ and pre-checks them.
 */
export async function promptHarnessSelection(): Promise<string[]> {
  const availableHarnesses = ['codex', 'claude', 'cursor'];
  const detected = detectExistingHarnesses();

  const selected = await clack.multiselect({
    message: 'Select harnesses to install adapters for:',
    options: availableHarnesses.map((h) => ({
      value: h,
      label: h,
      hint: detected.includes(h) ? 'detected' : undefined,
    })),
    initialValues: detected.length > 0 ? detected : availableHarnesses,
    required: true,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Installation cancelled.');
    process.exit(0);
  }

  return selected as string[];
}

/**
 * Detect existing harness directories in user home.
 */
function detectExistingHarnesses(): string[] {
  const harnesses = ['codex', 'claude', 'cursor'];
  const home = homedir();
  return harnesses.filter((h) => existsSync(join(home, `.${h}`)));
}

/**
 * Prompt user to confirm an action with yes/no.
 */
export async function promptConfirm(message: string, initialValue = true): Promise<boolean> {
  const answer = await clack.confirm({
    message,
    initialValue,
  });

  if (clack.isCancel(answer)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return answer;
}

/**
 * Display a spinner while running an async operation.
 */
export function spinner(message: string): ReturnType<typeof clack.spinner> {
  return clack.spinner();
}

/**
 * Show an intro message.
 */
export function intro(message: string): void {
  clack.intro(message);
}

/**
 * Show an outro message.
 */
export function outro(message: string): void {
  clack.outro(message);
}

/**
 * Show a note message.
 */
export function note(message: string, title?: string): void {
  clack.note(message, title);
}
