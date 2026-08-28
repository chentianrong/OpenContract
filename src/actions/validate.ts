import { resolve } from 'node:path';
import type {
  ActionDefinition,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from '../domain/types.js';
import { errorClassOf, repairHintFor } from '../domain/errors.js';
import { parseMarkdown } from '../markdown/parser.js';
import { validateArtifact, type PipelineOptions } from '../validation/pipeline.js';
import { parseActionRunLayout, type ActionRunLayout } from './action-run.js';

/**
 * Action Contract validation.
 *
 * An ActionRun's outputs must agree with the Action definition: uniform
 * `action`/`action_version`, merged inputs, required outputs with the right
 * names and versions, minimum counts, and per-output Artifact validation.
 */

function error(
  code: string,
  message: string,
  path: string,
  detail?: string,
): ValidationError {
  return {
    code,
    phase: 'action_contract',
    message,
    path,
    detail,
    repairHint: repairHintFor(code),
  };
}

export interface ActionRunValidationResult {
  readonly directory: string;
  readonly action: string;
  readonly actionVersion: string;
  readonly valid: boolean;
  /** Per-output validation results. */
  readonly outputs: ValidationResult[];
  /** Union of the `inputs` declared by every output, sorted. */
  readonly mergedInputs: string[];
  /** Action-level contract violations plus per-output findings. */
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

/**
 * Check that every output declares the same `action` and `action_version`, and
 * that both match the Action definition.
 */
function checkUniformMetadata(
  layout: ActionRunLayout,
  action: ActionDefinition,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenAction = new Set<string>();
  const seenVersion = new Set<string>();

  for (const output of layout.outputs) {
    const declaredAction = output.frontmatter.action;
    const declaredVersion = output.frontmatter.action_version;

    if (typeof declaredAction === 'string') {
      seenAction.add(declaredAction);
    }
    if (typeof declaredVersion === 'string') {
      seenVersion.add(declaredVersion);
    }
  }

  if (seenAction.size > 1) {
    errors.push(
      error(
        'ACTION_IDENTITY_INCONSISTENT',
        'Outputs declare different `action` values.',
        layout.directory,
        `found: ${[...seenAction].join(', ')}`,
      ),
    );
  }

  if (seenVersion.size > 1) {
    errors.push(
      error(
        'ACTION_IDENTITY_INCONSISTENT',
        'Outputs declare different `action_version` values.',
        layout.directory,
        `found: ${[...seenVersion].join(', ')}`,
      ),
    );
  }

  const declared = [...seenAction][0];
  const declaredVersion = [...seenVersion][0];

  if (declared && declared !== action.name) {
    errors.push(
      error(
        'ACTION_IDENTITY_INCONSISTENT',
        `Outputs declare action "${declared}", but this is a "${action.name}" run.`,
        layout.directory,
      ),
    );
  }

  if (declaredVersion && declaredVersion !== action.version) {
    errors.push(
      error(
        'ACTION_IDENTITY_INCONSISTENT',
        `Outputs declare action_version "${declaredVersion}", expected "${action.version}".`,
        layout.directory,
      ),
    );
  }

  return errors;
}

/**
 * Merge the `inputs` arrays from every output. The union becomes the run's
 * input set, which artifact-run references will validate.
 */
function mergeInputs(layout: ActionRunLayout): string[] {
  const seen = new Set<string>();
  for (const output of layout.outputs) {
    const inputs = output.frontmatter.inputs;
    if (Array.isArray(inputs)) {
      for (const entry of inputs) {
        if (typeof entry === 'string') {
          seen.add(entry);
        }
      }
    }
  }
  return [...seen].sort();
}

/**
 * Check that required outputs are present with the correct contract and version,
 * and that minimum-count constraints are met.
 */
function checkRequiredOutputs(
  layout: ActionRunLayout,
  action: ActionDefinition,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const outputsByName = new Map<string, typeof layout.outputs>();

  for (const output of layout.outputs) {
    const contract = output.frontmatter.contract;
    if (typeof contract === 'string') {
      if (!outputsByName.has(contract)) {
        outputsByName.set(contract, []);
      }
      outputsByName.get(contract)!.push(output);
    }
  }

  for (const spec of action.outputs) {
    const found = outputsByName.get(spec.contract) ?? [];

    if (spec.required && found.length === 0) {
      errors.push(
        error(
          'ACTION_OUTPUT_MISSING',
          `Required output "${spec.contract}" is missing.`,
          layout.directory,
          spec.version ? `expected version ${spec.version}` : undefined,
        ),
      );
      continue;
    }

    if (spec.minCount !== undefined && found.length < spec.minCount) {
      errors.push(
        error(
          'ACTION_OUTPUT_COUNT_LOW',
          `Output "${spec.contract}" requires at least ${spec.minCount}, found ${found.length}.`,
          layout.directory,
        ),
      );
    }

    if (spec.maxCount !== undefined && found.length > spec.maxCount) {
      errors.push(
        error(
          'ACTION_OUTPUT_COUNT_HIGH',
          `Output "${spec.contract}" allows at most ${spec.maxCount}, found ${found.length}.`,
          layout.directory,
        ),
      );
    }

    if (spec.version) {
      for (const output of found) {
        const declaredVersion = output.frontmatter.version;
        if (declaredVersion !== spec.version) {
          errors.push(
            error(
              'ACTION_IDENTITY_INCONSISTENT',
              `Output "${spec.contract}" declares version "${declaredVersion}", expected "${spec.version}".`,
              output.path,
            ),
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Check the merged inputs against the Action's declared input contracts. The
 * Contract of each input is read from the referenced Artifact rather than
 * inferred from its path, so a renamed file still counts correctly.
 */
function checkRequiredInputs(
  layout: ActionRunLayout,
  action: ActionDefinition,
  mergedInputs: string[],
): ValidationError[] {
  const required = action.inputs.filter((spec) => spec.required || spec.minCount);
  if (required.length === 0) {
    return [];
  }

  // Count how many merged inputs resolve to each Contract name.
  const countByContract = new Map<string, number>();
  for (const declared of mergedInputs) {
    const absolute = resolve(layout.directory, declared);
    let contract: unknown;
    try {
      contract = parseMarkdown(absolute).frontmatter.contract;
    } catch {
      // An unreadable or unmanaged input is reported by the references phase of
      // whichever output declared it; it simply does not count here.
      continue;
    }
    if (typeof contract === 'string') {
      countByContract.set(contract, (countByContract.get(contract) ?? 0) + 1);
    }
  }

  const errors: ValidationError[] = [];
  for (const spec of required) {
    const count = countByContract.get(spec.contract) ?? 0;

    if (spec.required && count === 0) {
      errors.push(
        error(
          'ACTION_INPUT_MISSING',
          `Required input "${spec.contract}" is not referenced by any output.`,
          layout.directory,
          `expected version ${spec.version}`,
        ),
      );
      continue;
    }

    const minimum = spec.minCount ?? 0;
    if (count < minimum) {
      errors.push(
        error(
          'ACTION_INPUT_COUNT_LOW',
          `Input "${spec.contract}" requires at least ${minimum} reference(s), found ${count}.`,
          layout.directory,
        ),
      );
    }
  }

  return errors;
}

/**
 * Validate an ActionRun directory against an Action definition. Every output is
 * validated through the full Artifact pipeline, and Action-level contract rules
 * are checked independently.
 */
export async function validateActionRun(
  directory: string,
  action: ActionDefinition,
  pipelineOptions: PipelineOptions,
): Promise<ActionRunValidationResult> {
  const layout = parseActionRunLayout(directory);
  const errors: ValidationError[] = [...layout.errors];
  const warnings: ValidationWarning[] = [];

  const mergedInputs = mergeInputs(layout);

  // Layout defects (name format, stray Markdown) are reported but do not block
  // Action contract checks or per-output validation.
  if (layout.outputs.length === 0 && layout.errors.length === 0) {
    errors.push(
      error(
        'ACTION_RUN_EMPTY',
        'The ActionRun directory contains no managed Markdown outputs.',
        directory,
      ),
    );
  }

  errors.push(...checkUniformMetadata(layout, action));
  errors.push(...checkRequiredOutputs(layout, action));
  errors.push(...checkRequiredInputs(layout, action, mergedInputs));

  const outputResults: ValidationResult[] = [];
  for (const output of layout.outputs) {
    const result = await validateArtifact(output.path, pipelineOptions);
    outputResults.push(result);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return {
    directory,
    action: action.name,
    actionVersion: action.version,
    // As with single-Artifact validation, `valid` describes the evidence:
    // a configuration fault means the run could not be fully examined.
    valid: !errors.some((e) => errorClassOf(e.code) === 'content'),
    outputs: outputResults,
    mergedInputs,
    errors,
    warnings,
  };
}
