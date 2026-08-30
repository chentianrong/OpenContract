import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstallCommand } from '../../../src/cli/commands/install.js';
import { EXIT_CODES } from '../../../src/domain/errors.js';
import * as prompts from '../../../src/cli/prompts.js';

// Mock the prompts module
vi.mock('../../../src/cli/prompts.js', async () => {
  const actual = await vi.importActual<typeof prompts>('../../../src/cli/prompts.js');
  return {
    ...actual,
    promptHarnessSelection: vi.fn(),
    intro: vi.fn(),
    note: vi.fn(),
    outro: vi.fn(),
  };
});

describe('install command', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-install-test-'));
    // Mock HOME environment variable for tests
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    vi.clearAllMocks();
  });

  it('installs fresh with interactive harness selection', async () => {
    vi.mocked(prompts.promptHarnessSelection).mockResolvedValue(['claude', 'cursor']);

    const code = await runInstallCommand({ nonInteractive: false });

    expect(code).toBe(EXIT_CODES.VALID);
    expect(existsSync(join(tempDir, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(tempDir, '.opencontract', 'cache'))).toBe(true);
    expect(existsSync(join(tempDir, '.opencontract', 'config.yaml'))).toBe(true);
    expect(prompts.promptHarnessSelection).toHaveBeenCalled();
  });

  it('rejects already-installed without force', async () => {
    // First install
    mkdirSync(join(tempDir, '.opencontract', 'system'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'system', 'manifest.yaml'), 'version: 1.0.0\n');

    const code = await runInstallCommand({ nonInteractive: true, harness: 'claude' });

    expect(code).toBe(EXIT_CODES.INVALID_CONTENT);
  });

  it('reinstalls with force flag', async () => {
    // First install
    mkdirSync(join(tempDir, '.opencontract', 'system'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'system', 'manifest.yaml'),
      'version: 1.0.0\ninstalledAt: 2024-01-01\n',
    );

    const code = await runInstallCommand({ force: true, nonInteractive: true, harness: 'claude' });

    expect(code).toBe(EXIT_CODES.VALID);
    expect(existsSync(join(tempDir, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
  });

  it('requires harness flag in non-interactive mode', async () => {
    const code = await runInstallCommand({ nonInteractive: true });

    expect(code).toBe(EXIT_CODES.CONFIGURATION);
  });

  it('accepts explicit harness list in non-interactive mode', async () => {
    const code = await runInstallCommand({ nonInteractive: true, harness: 'claude,cursor' });

    expect(code).toBe(EXIT_CODES.VALID);
    expect(existsSync(join(tempDir, '.opencontract', 'system', 'manifest.yaml'))).toBe(true);
  });

  it('rejects unknown harness names', async () => {
    const code = await runInstallCommand({
      nonInteractive: true,
      harness: 'claude,unknown-harness',
    });

    expect(code).toBe(EXIT_CODES.CONFIGURATION);
  });

  it('rejects empty harness list', async () => {
    const code = await runInstallCommand({ nonInteractive: true, harness: '' });

    expect(code).toBe(EXIT_CODES.CONFIGURATION);
  });
});
