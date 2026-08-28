import { describe, it, expect } from 'vitest';
import {
  ERROR_CATALOG,
  EXIT_CODES,
  errorDefinition,
  errorClassOf,
  exitCodeForErrorCode,
  repairHintFor,
  OpenContractError,
  isOpenContractError,
  toUnexpectedError,
} from '../src/domain/errors.js';

describe('Error catalog', () => {
  it('should have consistent exit code mappings', () => {
    for (const code of Object.keys(ERROR_CATALOG)) {
      const def = errorDefinition(code);
      expect(def.code).toBe(code);
      expect(['content', 'configuration', 'unexpected']).toContain(def.errorClass);
      expect(def.summary).toBeTruthy();
      expect(def.repairHint).toBeTruthy();
    }
  });

  it('should map error classes to exit codes', () => {
    expect(errorClassOf('WORKSPACE_NOT_FOUND')).toBe('configuration');
    expect(exitCodeForErrorCode('WORKSPACE_NOT_FOUND')).toBe(EXIT_CODES.CONFIGURATION);

    expect(errorClassOf('FRONTMATTER_MISSING')).toBe('content');
    expect(exitCodeForErrorCode('FRONTMATTER_MISSING')).toBe(EXIT_CODES.INVALID_CONTENT);

    expect(errorClassOf('UNEXPECTED_ERROR')).toBe('unexpected');
    expect(exitCodeForErrorCode('UNEXPECTED_ERROR')).toBe(EXIT_CODES.UNEXPECTED);
  });

  it('should retrieve repair hints', () => {
    const hint = repairHintFor('WORKSPACE_NOT_FOUND');
    expect(hint).toContain('init');
  });

  it('should throw for unknown error codes', () => {
    expect(() => errorDefinition('UNKNOWN_CODE')).toThrow('Unknown OpenContract error code');
  });
});

describe('OpenContractError', () => {
  it('should construct with code and message', () => {
    const err = new OpenContractError('WORKSPACE_NOT_FOUND', 'Custom message');
    expect(err.code).toBe('WORKSPACE_NOT_FOUND');
    expect(err.message).toBe('Custom message');
    expect(err.errorClass).toBe('configuration');
    expect(err.exitCode).toBe(EXIT_CODES.CONFIGURATION);
    expect(err.repairHint).toBeTruthy();
  });

  it('should use default summary when message is omitted', () => {
    const err = new OpenContractError('WORKSPACE_NOT_FOUND');
    expect(err.message).toBeTruthy();
    expect(err.message).toContain('.opencontract');
  });

  it('should include location details when provided', () => {
    const err = new OpenContractError('FRONTMATTER_MISSING', 'Missing frontmatter', {
      path: '/path/to/file.md',
      line: 1,
      column: 1,
      detail: 'Expected YAML delimiters',
    });
    expect(err.path).toBe('/path/to/file.md');
    expect(err.line).toBe(1);
    expect(err.column).toBe(1);
    expect(err.detail).toBe('Expected YAML delimiters');
  });

  it('should serialize to JSON without stack trace', () => {
    const err = new OpenContractError('ACTION_NOT_FOUND', undefined, {
      path: '/some/path',
      detail: 'Not in catalog',
    });
    const json = err.toJSON();
    expect(json.code).toBe('ACTION_NOT_FOUND');
    expect(json.errorClass).toBe('configuration');
    expect(json.path).toBe('/some/path');
    expect(json.detail).toBe('Not in catalog');
    expect(json.message).toBeTruthy();
    expect(json.repairHint).toBeTruthy();
    expect('stack' in json).toBe(false);
  });

  it('should be recognized by type guard', () => {
    const err = new OpenContractError('CONFIG_INVALID');
    expect(isOpenContractError(err)).toBe(true);
    expect(isOpenContractError(new Error('plain'))).toBe(false);
    expect(isOpenContractError('string')).toBe(false);
    expect(isOpenContractError(null)).toBe(false);
  });
});

describe('toUnexpectedError', () => {
  it('should preserve OpenContractError', () => {
    const original = new OpenContractError('CONFIG_INVALID');
    const wrapped = toUnexpectedError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap plain Error', () => {
    const original = new Error('Something went wrong');
    const wrapped = toUnexpectedError(original, '/path/to/file');
    expect(wrapped.code).toBe('UNEXPECTED_ERROR');
    expect(wrapped.message).toBe('Something went wrong');
    expect(wrapped.path).toBe('/path/to/file');
    expect(wrapped.errorClass).toBe('unexpected');
  });

  it('should wrap non-Error values', () => {
    const wrapped = toUnexpectedError('string failure');
    expect(wrapped.code).toBe('UNEXPECTED_ERROR');
    expect(wrapped.message).toBe('string failure');
  });
});
