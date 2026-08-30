import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverWorkspace,
  requireWorkspace,
  resolvePaths,
  validateReferencePath,
} from '../src/workspace/discovery.js';
import { OpenContractError } from '../src/domain/errors.js';

describe('Workspace discovery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('discovers the nearest ancestor configuration', () => {
    const root = join(tempDir, 'project');
    const nested = join(root, 'src', 'nested');
    mkdirSync(join(root, '.opencontract'), { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, '.opencontract', 'config.yaml'), 'system: .opencontract/system\n');

    const workspace = discoverWorkspace(nested);
    expect(workspace).toBeDefined();
    expect(workspace!.root).toBe(root);
    expect(workspace!.configPath).toBe(join(root, '.opencontract', 'config.yaml'));
  });

  it('prefers nested workspace over ancestor', () => {
    const outer = join(tempDir, 'outer');
    const inner = join(outer, 'inner');
    mkdirSync(join(outer, '.opencontract'), { recursive: true });
    mkdirSync(join(inner, '.opencontract'), { recursive: true });
    writeFileSync(join(outer, '.opencontract', 'config.yaml'), 'system: outer\n');
    writeFileSync(join(inner, '.opencontract', 'config.yaml'), 'system: inner\n');

    const workspace = discoverWorkspace(inner);
    expect(workspace).toBeDefined();
    expect(workspace!.root).toBe(inner);
    expect(workspace!.config.system).toBe('inner');
  });

  it('returns undefined when no workspace is found', () => {
    const nowhere = join(tempDir, 'nowhere');
    mkdirSync(nowhere, { recursive: true });
    expect(discoverWorkspace(nowhere)).toBeUndefined();
  });

  it('requireWorkspace throws WORKSPACE_NOT_FOUND', () => {
    const nowhere = join(tempDir, 'nowhere');
    mkdirSync(nowhere, { recursive: true });
    expect(() => requireWorkspace(nowhere)).toThrow(OpenContractError);
    try {
      requireWorkspace(nowhere);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('WORKSPACE_NOT_FOUND');
    }
  });

  it('throws CONFIG_PARSE_ERROR for malformed YAML', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), '{ invalid yaml');
    expect(() => discoverWorkspace(tempDir)).toThrow(OpenContractError);
    try {
      discoverWorkspace(tempDir);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('throws CONFIG_INVALID for non-mapping configuration', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), '["array"]');
    expect(() => discoverWorkspace(tempDir)).toThrow(OpenContractError);
    try {
      discoverWorkspace(tempDir);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('CONFIG_INVALID');
    }
  });

  it('merges user config with defaults', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'specs: custom/specs\nharnesses: [codex]\n',
    );
    const workspace = discoverWorkspace(tempDir);
    expect(workspace!.config.specs).toBe('custom/specs');
    expect(workspace!.config.harnesses).toEqual(['codex']);
    expect(workspace!.config.system).toBe('.opencontract/system'); // default
  });
});

describe('Path resolution and safety', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves all configured paths against the workspace root', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), 'system: .opencontract/system\n');
    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);

    expect(paths.root).toBe(tempDir);
    expect(paths.system).toBe(join(tempDir, '.opencontract', 'system'));
    expect(paths.specs).toBe(join(tempDir, 'opencontract', 'specs'));
  });

  it('rejects absolute paths in configuration', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    // System paths use validateSystemPath, which checks home directory first
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), 'system: /absolute/path\n');
    const workspace = requireWorkspace(tempDir);
    expect(() => resolvePaths(workspace)).toThrow(OpenContractError);
    try {
      resolvePaths(workspace);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_OUTSIDE_HOME');
    }
  });

  it('rejects paths that escape the workspace root with ..', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(join(tempDir, '.opencontract', 'config.yaml'), 'system: ../../escape\n');
    const workspace = requireWorkspace(tempDir);
    expect(() => resolvePaths(workspace)).toThrow(OpenContractError);
    try {
      resolvePaths(workspace);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_ESCAPES_ROOT');
    }
  });

  it('rejects symlinks that escape the workspace root', () => {
    const outside = join(tempDir, 'outside');
    const inside = join(tempDir, 'workspace');
    const link = join(inside, 'link-to-outside');
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(inside, '.opencontract'), { recursive: true });

    try {
      symlinkSync(outside, link, 'dir');
    } catch {
      // Skip test on systems that don't support symlinks
      return;
    }

    writeFileSync(join(inside, '.opencontract', 'config.yaml'), 'system: link-to-outside\n');
    const workspace = requireWorkspace(inside);
    expect(() => resolvePaths(workspace)).toThrow(OpenContractError);
    try {
      resolvePaths(workspace);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_SYMLINK_ESCAPE');
    }
  });

  it('accepts absolute system paths under user home with ~/', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: ~/.opencontract/system\n',
    );
    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);

    expect(paths.system).toContain('.opencontract/system');
    expect(paths.system).toMatch(/^\/.*\.opencontract\/system$/);
  });

  it('accepts relative system paths as before', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\n',
    );
    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);

    expect(paths.system).toBe(join(tempDir, '.opencontract', 'system'));
  });

  it('rejects absolute system paths outside user home', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: /etc/opencontract/system\n',
    );
    const workspace = requireWorkspace(tempDir);
    expect(() => resolvePaths(workspace)).toThrow(OpenContractError);
    try {
      resolvePaths(workspace);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_OUTSIDE_HOME');
    }
  });

  it('validates trust.validatorRoots with system path rules', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\ntrust:\n  validatorRoots:\n    - ~/.opencontract/system\n',
    );
    const workspace = requireWorkspace(tempDir);
    const paths = resolvePaths(workspace);

    expect(paths.trustedValidatorRoots).toHaveLength(1);
    expect(paths.trustedValidatorRoots[0]).toContain('.opencontract/system');
  });

  it('rejects workspace paths with absolute values', () => {
    mkdirSync(join(tempDir, '.opencontract'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencontract', 'config.yaml'),
      'system: .opencontract/system\nspecs: /tmp/specs\n',
    );
    const workspace = requireWorkspace(tempDir);
    expect(() => resolvePaths(workspace)).toThrow(OpenContractError);
    try {
      resolvePaths(workspace);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_NOT_RELATIVE');
    }
  });
});

describe('validateReferencePath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts valid relative paths within the root', () => {
    const baseDir = join(tempDir, 'artifacts', 'task', 'run');
    const root = join(tempDir, 'artifacts');
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(baseDir, 'artifact.md'), '# Test');

    const resolved = validateReferencePath(baseDir, 'artifact.md', root, {
      mustExist: true,
      mustBeFile: true,
    });
    expect(resolved).toBe(join(baseDir, 'artifact.md'));
  });

  it('rejects absolute paths', () => {
    expect(() => validateReferencePath(tempDir, '/absolute/path', tempDir)).toThrow(
      OpenContractError,
    );
    try {
      validateReferencePath(tempDir, '/absolute/path', tempDir);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('PATH_NOT_RELATIVE');
    }
  });

  it('rejects paths that escape the root', () => {
    const baseDir = join(tempDir, 'artifacts');
    const root = join(tempDir, 'artifacts');
    expect(() => validateReferencePath(baseDir, '../../escape', root)).toThrow(OpenContractError);
    try {
      validateReferencePath(baseDir, '../../escape', root);
    } catch (err) {
      expect((err as OpenContractError).code).toBe('REFERENCE_UNSAFE');
    }
  });

  it('rejects missing paths when mustExist is true', () => {
    expect(() =>
      validateReferencePath(tempDir, 'missing.md', tempDir, { mustExist: true }),
    ).toThrow(OpenContractError);
    try {
      validateReferencePath(tempDir, 'missing.md', tempDir, { mustExist: true });
    } catch (err) {
      expect((err as OpenContractError).code).toBe('REFERENCE_NOT_FOUND');
    }
  });

  it('rejects directories when mustBeFile is true', () => {
    const dir = join(tempDir, 'directory');
    mkdirSync(dir);
    expect(() => validateReferencePath(tempDir, 'directory', tempDir, { mustBeFile: true })).toThrow(
      OpenContractError,
    );
    try {
      validateReferencePath(tempDir, 'directory', tempDir, { mustBeFile: true });
    } catch (err) {
      expect((err as OpenContractError).code).toBe('REFERENCE_IS_DIRECTORY');
    }
  });
});
