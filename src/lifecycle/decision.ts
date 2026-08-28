import type { ValidationError } from '../domain/types.js';
import type { ParsedMarkdown } from '../markdown/parser.js';
import { repairHintFor } from '../domain/errors.js';

/**
 * Decision contract helpers.
 *
 * A Decision artifact gates operations that require human approval. Its state
 * determines whether a proposed change can proceed:
 * - `pending`: awaiting human judgment; gated operations must halt.
 * - `decided`: approved or rejected with a selected option and timestamp.
 *
 * Archived Decisions remain traceable evidence but can no longer be modified.
 */

export type DecisionStatus = 'pending' | 'decided';

export interface DecisionState {
  readonly status: DecisionStatus;
  readonly decider?: string;
  readonly selectedOption?: string;
  readonly decidedAt?: string;
}

/**
 * Extract the Decision's state from its frontmatter and body. A Decision is
 * `decided` when it declares `selected_option`, `decider`, and `decided_at`.
 */
export function readDecisionState(artifact: ParsedMarkdown): DecisionState {
  const fm = artifact.frontmatter;
  const selected = fm.selected_option;
  const decider = fm.decider;
  const decidedAt = fm.decided_at;

  if (
    typeof selected === 'string' &&
    selected.length > 0 &&
    typeof decider === 'string' &&
    typeof decidedAt === 'string'
  ) {
    return { status: 'decided', decider, selectedOption: selected, decidedAt };
  }

  return { status: 'pending' };
}

/**
 * Validate a Decision's state fields. When `decided`, the selected option must
 * be one of the declared options, and the timestamp must be well-formed.
 */
export function validateDecisionState(artifact: ParsedMarkdown): ValidationError[] {
  const errors: ValidationError[] = [];
  const state = readDecisionState(artifact);

  if (state.status === 'decided') {
    // The selected option must be one of the declared options.
    const options = artifact.frontmatter.options;
    if (Array.isArray(options)) {
      const declared = options.map((opt) => (typeof opt === 'string' ? opt : opt.name)).filter(Boolean);
      if (!declared.includes(state.selectedOption!)) {
        errors.push({
          code: 'DECISION_OPTION_INVALID',
          phase: 'artifact_core',
          message: `selected_option "${state.selectedOption}" is not one of the declared options.`,
          path: artifact.path,
          detail: `declared: ${declared.join(', ')}`,
          repairHint: repairHintFor('DECISION_OPTION_INVALID'),
        });
      }
    }

    // The decided_at timestamp must be ISO 8601.
    try {
      const parsed = new Date(state.decidedAt!);
      if (isNaN(parsed.getTime())) {
        errors.push({
          code: 'DECISION_TIMESTAMP_INVALID',
          phase: 'artifact_core',
          message: `decided_at is not a valid ISO 8601 timestamp: "${state.decidedAt}"`,
          path: artifact.path,
          repairHint: repairHintFor('DECISION_TIMESTAMP_INVALID'),
        });
      }
    } catch {
      errors.push({
        code: 'DECISION_TIMESTAMP_INVALID',
        phase: 'artifact_core',
        message: `decided_at is not a valid ISO 8601 timestamp: "${state.decidedAt}"`,
        path: artifact.path,
        repairHint: repairHintFor('DECISION_TIMESTAMP_INVALID'),
      });
    }
  }

  return errors;
}

/**
 * Query whether a gated operation should proceed. A pending Decision blocks
 * until decided; a decided Decision unblocks with the approval state.
 */
export interface AuthorizationQuery {
  /** The Decision artifact being consulted. */
  readonly decision: ParsedMarkdown;
  /** True when the Decision authorizes the operation to proceed. */
  readonly authorized: boolean;
  /** When not authorized, the reason the operation is blocked. */
  readonly blockingReason?: string;
}

export function queryAuthorization(decision: ParsedMarkdown): AuthorizationQuery {
  const state = readDecisionState(decision);

  if (state.status === 'pending') {
    return {
      decision,
      authorized: false,
      blockingReason: 'The Decision is pending; awaiting human judgment.',
    };
  }

  // A decided Decision with a selected option authorizes the operation.
  // The caller interprets what the selected option means.
  return { decision, authorized: true };
}

/**
 * Check that an archived Decision is immutable. Archived Decisions remain
 * traceable but must not be modified — new decisions belong in new tasks.
 */
export function checkDecisionImmutability(
  artifact: ParsedMarkdown,
  archived: boolean,
): ValidationError[] {
  if (!archived) return [];

  // An archived Decision that is still pending is a structural violation: it
  // means the task was archived before the decision was made.
  const state = readDecisionState(artifact);
  if (state.status === 'pending') {
    return [
      {
        code: 'DECISION_ARCHIVED_PENDING',
        phase: 'artifact_core',
        message: 'An archived Decision must be decided; pending decisions cannot be archived.',
        path: artifact.path,
        repairHint: repairHintFor('DECISION_ARCHIVED_PENDING'),
      },
    ];
  }

  return [];
}
