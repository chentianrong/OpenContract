import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ContractDefinition,
  PhaseResult,
  PhaseStatus,
  ValidationError,
  ValidationPhase,
  ValidationResult,
  ValidationTarget,
  ValidationWarning,
} from '../domain/types.js';
import { errorClassOf, isOpenContractError, repairHintFor } from '../domain/errors.js';
import { parseMarkdown, type ParsedMarkdown } from '../markdown/parser.js';
import { validateArtifactCore } from './artifact-core.js';
import { validateContractRules } from './contract-rules.js';
import { checkReferences } from './references.js';
import {
  runSemanticValidator,
  type ValidatorRuntimeConfig,
} from './semantic-validator.js';
import type { DefinitionResolver } from '../definitions/resolver.js';

/**
 * The ordered validation pipeline.
 *
 * Phases run in a fixed order and each records its own status. A phase whose
 * prerequisite failed is marked `skipped` rather than run: without a parse there
 * is no frontmatter to check, and without a resolved Contract there are no rules
 * to apply. Reporting those as failures would invent defects the document does
 * not have.
 */

const PHASE_ORDER: ValidationPhase[] = [
  'parse',
  'artifact_core',
  'contract_structure',
  'semantic_validator',
  'references',
];

export interface PipelineOptions {
  readonly resolver: DefinitionResolver;
  readonly workspaceRoot: string;
  /** Root every reference must stay inside, normally the artifacts root. */
  readonly managedRoot: string;
  /** Managed roots for the artifact-core boundary check. */
  readonly managedRoots?: string[];
  readonly trustedValidatorRoots: string[];
  readonly validatorRuntime: ValidatorRuntimeConfig;
  /** Follow transitive inputs and detect cycles. */
  readonly recursive?: boolean;
}

function phaseError(
  code: string,
  phase: ValidationPhase,
  message: string,
  path: string,
  detail?: string,
  line?: number,
  column?: number,
): ValidationError {
  return { code, phase, message, path, line, column, detail, repairHint: repairHintFor(code) };
}

/** Accumulates phase statuses so the result always lists phases in a fixed order. */
class PhaseRecorder {
  private readonly statuses = new Map<ValidationPhase, PhaseStatus>();

  constructor(private readonly order: ValidationPhase[] = PHASE_ORDER) {
    for (const phase of this.order) {
      this.statuses.set(phase, 'skipped');
    }
  }

  record(phase: ValidationPhase, status: PhaseStatus): void {
    this.statuses.set(phase, status);
  }

  /** Marks a phase passed or failed based on whether it produced errors. */
  recordFromErrors(phase: ValidationPhase, errors: ValidationError[]): void {
    this.record(phase, errors.length > 0 ? 'failed' : 'passed');
  }

  results(): PhaseResult[] {
    return this.order.map((phase) => ({ phase, status: this.statuses.get(phase) ?? 'skipped' }));
  }
}

function buildResult(
  target: ValidationTarget,
  phases: PhaseResult[],
  errors: ValidationError[],
  warnings: ValidationWarning[],
): ValidationResult {
  return {
    protocol: 'opencontract-validation',
    version: 'v1.0.0',
    target,
    // `valid` describes the document. A configuration-class error (unresolvable
    // Contract, untrusted validator, validator protocol fault) means the
    // Artifact could not be fully examined, not that it is defective — the CLI
    // reports those with exit code 2 instead of 1.
    valid: !errors.some((e) => errorClassOf(e.code) === 'content'),
    phases,
    errors,
    warnings,
  };
}

/** True when any error describes the environment rather than the document. */
export function hasConfigurationError(errors: ValidationError[]): boolean {
  return errors.some((e) => errorClassOf(e.code) === 'configuration');
}

/**
 * Validate a single managed Markdown Artifact through every applicable phase.
 */
export async function validateArtifact(
  filePath: string,
  options: PipelineOptions,
): Promise<ValidationResult> {
  const recorder = new PhaseRecorder();
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // --- parse -------------------------------------------------------------
  let parsed: ParsedMarkdown;
  try {
    parsed = parseMarkdown(filePath);
    recorder.record('parse', 'passed');
  } catch (err) {
    const parseError = isOpenContractError(err)
      ? phaseError(err.code, 'parse', err.message, filePath, err.detail, err.line, err.column)
      : phaseError('MARKDOWN_PARSE_ERROR', 'parse', String(err), filePath);
    recorder.record('parse', 'failed');
    // Without a parse tree no later phase has input to work on.
    return buildResult(
      { path: filePath, type: 'file' },
      recorder.results(),
      [parseError],
      warnings,
    );
  }

  const contractName = parsed.frontmatter.contract;
  const contractVersion = parsed.frontmatter.version;
  const target: ValidationTarget = {
    path: filePath,
    type: 'file',
    contract: typeof contractName === 'string' ? contractName : undefined,
    contractVersion: typeof contractVersion === 'string' ? contractVersion : undefined,
    action: typeof parsed.frontmatter.action === 'string' ? parsed.frontmatter.action : undefined,
    actionVersion:
      typeof parsed.frontmatter.action_version === 'string'
        ? parsed.frontmatter.action_version
        : undefined,
  };

  // --- artifact_core -----------------------------------------------------
  const coreErrors = validateArtifactCore(parsed, { managedRoots: options.managedRoots });
  recorder.recordFromErrors('artifact_core', coreErrors);
  errors.push(...coreErrors);

  // --- contract resolution ----------------------------------------------
  // The Contract is what the remaining phases are checked against, so a
  // resolution failure leaves them skipped rather than failed.
  let contract: ContractDefinition | undefined;
  if (typeof contractName === 'string' && typeof contractVersion === 'string') {
    try {
      contract = options.resolver.resolveContract(contractName, contractVersion);
    } catch (err) {
      errors.push(
        isOpenContractError(err)
          ? phaseError(
              err.code,
              'contract_structure',
              err.message,
              filePath,
              err.detail ?? `${contractName}@${contractVersion}`,
            )
          : phaseError('CONTRACT_NOT_FOUND', 'contract_structure', String(err), filePath),
      );
      recorder.record('contract_structure', 'failed');
    }
  }

  // --- contract_structure ------------------------------------------------
  if (contract) {
    const ruleErrors = validateContractRules(parsed, contract);
    recorder.recordFromErrors('contract_structure', ruleErrors);
    errors.push(...ruleErrors);
  }

  // --- semantic_validator ------------------------------------------------
  if (contract) {
    const outcome = await runSemanticValidator(
      {
        artifactPath: filePath,
        contract,
        workspaceRoot: options.workspaceRoot,
        taskRoot: options.managedRoot,
      },
      options.trustedValidatorRoots,
      options.validatorRuntime,
    );
    recorder.record('semantic_validator', outcome.status);
    errors.push(...outcome.errors);
    warnings.push(...outcome.warnings);
  }

  // --- references --------------------------------------------------------
  // References are checked independently of the Contract: a broken input is a
  // defect whether or not the Contract resolved.
  const referenceResult = checkReferences(filePath, {
    managedRoot: options.managedRoot,
    recursive: options.recursive,
  });
  recorder.recordFromErrors('references', referenceResult.errors);
  errors.push(...referenceResult.errors);

  return buildResult(target, recorder.results(), errors, warnings);
}

/**
 * Validate every managed Markdown file under a directory. The aggregate keeps
 * independent per-file results so a machine consumer can act on one file's
 * findings without re-running the others.
 */
export interface DirectoryValidationResult {
  readonly protocol: 'opencontract-validation';
  readonly version: 'v1.0.0';
  readonly target: ValidationTarget;
  readonly valid: boolean;
  readonly fileCount: number;
  readonly validCount: number;
  readonly results: ValidationResult[];
}

function collectMarkdownFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  // Deterministic order so directory output is comparable between runs.
  return found.sort();
}

export async function validateDirectory(
  directoryPath: string,
  options: PipelineOptions,
): Promise<DirectoryValidationResult> {
  const files = collectMarkdownFiles(directoryPath);
  const results: ValidationResult[] = [];

  for (const file of files) {
    results.push(await validateArtifact(file, options));
  }

  const validCount = results.filter((r) => r.valid).length;

  return {
    protocol: 'opencontract-validation',
    version: 'v1.0.0',
    target: { path: directoryPath, type: 'directory' },
    // A directory is valid when no file carries a content defect; per-file
    // configuration errors are still visible in the individual results.
    valid: validCount === results.length,
    fileCount: results.length,
    validCount,
    results,
  };
}

/** Dispatches to file or directory validation based on what the path is. */
export async function validateTarget(
  targetPath: string,
  options: PipelineOptions,
): Promise<ValidationResult | DirectoryValidationResult> {
  return statSync(targetPath).isDirectory()
    ? validateDirectory(targetPath, options)
    : validateArtifact(targetPath, options);
}
