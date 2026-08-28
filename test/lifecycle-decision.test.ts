import { describe, it, expect } from 'vitest';
import {
  readDecisionState,
  validateDecisionState,
  queryAuthorization,
  checkDecisionImmutability,
} from '../src/lifecycle/decision.js';
import type { ParsedMarkdown } from '../src/markdown/parser.js';

function decision(frontmatter: Record<string, unknown>, body = ''): ParsedMarkdown {
  return {
    path: '/test/decision.md',
    raw: '',
    frontmatter,
    frontmatterEndLine: 5,
    body,
    bodyOffset: 0,
    bodyStartLine: 6,
    headings: [],
  };
}

describe('Decision state', () => {
  it('reads a pending Decision when no selected_option is declared', () => {
    const state = readDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
      }),
    );

    expect(state.status).toBe('pending');
    expect(state.selectedOption).toBeUndefined();
  });

  it('reads a decided Decision when selected_option, decider, and decided_at are present', () => {
    const state = readDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
    );

    expect(state.status).toBe('decided');
    expect(state.selectedOption).toBe('approve');
    expect(state.decider).toBe('alice');
    expect(state.decidedAt).toBe('2026-01-31T12:00:00Z');
  });

  it('treats a Decision with only selected_option as pending', () => {
    const state = readDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        selected_option: 'approve',
      }),
    );

    expect(state.status).toBe('pending');
  });

  it('validates that the selected option is one of the declared options', () => {
    const errors = validateDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
        selected_option: 'unknown',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('DECISION_OPTION_INVALID');
    expect(errors[0].message).toContain('unknown');
  });

  it('validates that decided_at is a valid ISO 8601 timestamp', () => {
    const errors = validateDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve'],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: 'not-a-timestamp',
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('DECISION_TIMESTAMP_INVALID');
  });

  it('accepts a well-formed decided Decision', () => {
    const errors = validateDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('accepts options declared as objects with name fields', () => {
    const errors = validateDecisionState(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: [{ name: 'approve', rationale: 'Go ahead' }, { name: 'reject' }],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
    );

    expect(errors).toHaveLength(0);
  });
});

describe('Authorization query', () => {
  it('blocks when the Decision is pending', () => {
    const query = queryAuthorization(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
      }),
    );

    expect(query.authorized).toBe(false);
    expect(query.blockingReason).toContain('pending');
  });

  it('authorizes when the Decision is decided', () => {
    const query = queryAuthorization(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
    );

    expect(query.authorized).toBe(true);
    expect(query.blockingReason).toBeUndefined();
  });
});

describe('Decision immutability', () => {
  it('allows a pending Decision when not archived', () => {
    const errors = checkDecisionImmutability(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
      }),
      false,
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects an archived Decision that is still pending', () => {
    const errors = checkDecisionImmutability(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
      }),
      true,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('DECISION_ARCHIVED_PENDING');
    expect(errors[0].message).toContain('pending decisions cannot be archived');
  });

  it('allows an archived Decision that is decided', () => {
    const errors = checkDecisionImmutability(
      decision({
        contract: 'decision',
        version: 'v1.0.0',
        options: ['approve', 'reject'],
        selected_option: 'approve',
        decider: 'alice',
        decided_at: '2026-01-31T12:00:00Z',
      }),
      true,
    );

    expect(errors).toHaveLength(0);
  });
});
