/**
 * Exit codes documented by the OpenContract CLI contract.
 *
 * 0 — valid
 * 1 — invalid content (repairable Artifact/ActionRun defect)
 * 2 — configuration, definition, trust, or parameter error
 * 3 — unexpected failure
 */
export const EXIT_CODES = {
  VALID: 0,
  INVALID_CONTENT: 1,
  CONFIGURATION: 2,
  UNEXPECTED: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Error classes map one-to-one onto exit codes so command wiring never has to
 * re-derive the process result from message text.
 */
export type ErrorClass = 'content' | 'configuration' | 'unexpected';

export const ERROR_CLASS_EXIT_CODES: Record<ErrorClass, ExitCode> = {
  content: EXIT_CODES.INVALID_CONTENT,
  configuration: EXIT_CODES.CONFIGURATION,
  unexpected: EXIT_CODES.UNEXPECTED,
};

export interface ErrorDefinition {
  readonly code: string;
  readonly errorClass: ErrorClass;
  readonly summary: string;
  readonly repairHint: string;
}

function def(
  code: string,
  errorClass: ErrorClass,
  summary: string,
  repairHint: string,
): ErrorDefinition {
  return { code, errorClass, summary, repairHint };
}

/**
 * Centralized catalog of every public error code with its class and repair
 * hint. Services reference entries from here rather than inventing strings so
 * that presentation, exit codes, and documentation stay consistent.
 */
export const ERROR_CATALOG: Record<string, ErrorDefinition> = Object.fromEntries(
  [
    // --- Workspace and configuration -------------------------------------
    def(
      'WORKSPACE_NOT_FOUND',
      'configuration',
      'No .opencontract/config.yaml was found in this directory or any ancestor.',
      'Run `opencontract init` in the project root to create a workspace.',
    ),
    def(
      'WORKSPACE_EXISTS',
      'configuration',
      'An OpenContract workspace already exists at this location.',
      'Run `opencontract update` to refresh the system tree instead of `init`.',
    ),
    def(
      'CONFIG_PARSE_ERROR',
      'configuration',
      'The workspace configuration file could not be parsed as YAML.',
      'Fix the YAML syntax in .opencontract/config.yaml.',
    ),
    def(
      'CONFIG_INVALID',
      'configuration',
      'The workspace configuration contains an invalid value.',
      'Correct the reported configuration key in .opencontract/config.yaml.',
    ),
    def(
      'PATH_ESCAPES_ROOT',
      'configuration',
      'A configured or referenced path resolves outside the workspace root.',
      'Use a path that stays inside the workspace root.',
    ),
    def(
      'PATH_NOT_RELATIVE',
      'configuration',
      'An absolute path was used where a workspace-relative path is required.',
      'Replace the absolute path with a slash-separated relative path.',
    ),
    def(
      'PATH_SYMLINK_ESCAPE',
      'configuration',
      'A path resolves through a symlink that leaves the workspace root.',
      'Remove the symlink or point it inside the workspace root.',
    ),
    def(
      'PATH_NOT_FOUND',
      'configuration',
      'The referenced path does not exist.',
      'Create the missing path or correct the reference.',
    ),
    def(
      'PATH_IS_DIRECTORY',
      'configuration',
      'A directory was supplied where a file is required.',
      'Point the reference at a Markdown file rather than a directory.',
    ),
    def(
      'PATH_NOT_FILE',
      'configuration',
      'The referenced path is not a regular file.',
      'Point the reference at a regular Markdown file.',
    ),
    def(
      'TARGET_NOT_FOUND',
      'configuration',
      'The validation target does not exist.',
      'Check the path passed on the command line.',
    ),

    // --- Definitions ------------------------------------------------------
    def(
      'ACTION_NOT_FOUND',
      'configuration',
      'No Action definition matches the requested name and exact version.',
      'Run `opencontract action list` to see available Actions and exact versions.',
    ),
    def(
      'CONTRACT_NOT_FOUND',
      'configuration',
      'No Contract definition matches the requested name and exact version.',
      'Run `opencontract contract list` to see available Contracts and exact versions.',
    ),
    def(
      'DEFINITION_SOURCE_CONFLICT',
      'configuration',
      'The same definition name and version exists in more than one source.',
      'Add an explicit entry under `overrides.actions` or `overrides.contracts` in .opencontract/config.yaml.',
    ),
    def(
      'DEFINITION_OVERRIDE_REQUIRED',
      'configuration',
      'Both a project and a system definition exist and no override selects one.',
      'Select the intended source with `overrides.actions` or `overrides.contracts`.',
    ),
    def(
      'DEFINITION_OVERRIDE_INVALID',
      'configuration',
      'A configured definition override names a source that does not provide the definition.',
      'Point the override at a source that actually contains the definition, or remove it.',
    ),
    def(
      'INVALID_VERSION_REFERENCE',
      'configuration',
      'Only exact vMAJOR.MINOR.PATCH version references are supported.',
      'Replace ranges, `latest`, or partial versions with an exact version such as v1.0.0.',
    ),
    def(
      'ACTION_METADATA_INVALID',
      'configuration',
      'An Action SKILL.md has invalid or inconsistent metadata.',
      'Fix the Skill frontmatter so name, description, version, and the opencontract block are valid.',
    ),
    def(
      'CONTRACT_METADATA_INVALID',
      'configuration',
      'A Contract package has invalid or inconsistent metadata.',
      'Fix contract.md so name, version, artifact type, template, and rules are valid.',
    ),
    def(
      'CONTRACT_TEMPLATE_MISSING',
      'configuration',
      'A Contract package declares a template that does not exist.',
      'Add the declared template file to the Contract package.',
    ),
    def(
      'CONTRACT_FIXTURE_INVALID',
      'content',
      'A Contract fixture did not produce its expected validation outcome.',
      'Update the fixture or the Contract rules so the documented outcome holds.',
    ),
    def(
      'MANIFEST_MISSING',
      'configuration',
      'The system manifest is missing.',
      'Run `opencontract update` to reinstall the system tree.',
    ),
    def(
      'MANIFEST_INVALID',
      'configuration',
      'The system manifest is malformed or inconsistent with the installed definitions.',
      'Run `opencontract update` to reinstall a consistent system tree.',
    ),

    // --- Markdown parsing and artifact core -------------------------------
    def(
      'ARTIFACT_READ_FAILED',
      'configuration',
      'The Artifact file could not be read.',
      'Check that the path exists and the current user can read it.',
    ),
    def(
      'FRONTMATTER_MISSING',
      'content',
      'The Markdown file has no YAML frontmatter block.',
      'Add a `---` delimited YAML frontmatter block with the artifact-core fields.',
    ),
    def(
      'FRONTMATTER_PARSE_ERROR',
      'content',
      'The YAML frontmatter could not be parsed.',
      'Fix the YAML syntax inside the frontmatter delimiters.',
    ),
    def(
      'FRONTMATTER_NOT_MAPPING',
      'content',
      'The YAML frontmatter is not a mapping of keys to values.',
      'Rewrite the frontmatter as `key: value` pairs.',
    ),
    def(
      'MARKDOWN_PARSE_ERROR',
      'content',
      'The Markdown body could not be parsed.',
      'Fix the Markdown structure reported at the given location.',
    ),
    def(
      'CORE_FIELD_MISSING',
      'content',
      'A required artifact-core metadata field is missing.',
      'Add the missing field to the Artifact frontmatter.',
    ),
    def(
      'CORE_FIELD_INVALID',
      'content',
      'An artifact-core metadata field has the wrong type.',
      'Correct the field type in the Artifact frontmatter.',
    ),
    def(
      'CORE_NAME_INVALID',
      'content',
      'A contract or action name is not lowercase kebab-case.',
      'Rewrite the name using lowercase letters, digits, and single hyphens.',
    ),
    def(
      'CORE_VERSION_INVALID',
      'content',
      'A version field is not an exact vX.Y.Z reference.',
      'Use an exact version such as v1.0.0.',
    ),
    def(
      'CORE_TIMESTAMP_INVALID',
      'content',
      '`created_at` is not a timezone-aware RFC 3339 timestamp.',
      'Use a timestamp such as 2026-01-31T12:00:00Z or 2026-01-31T12:00:00+01:00.',
    ),
    def(
      'CORE_INPUTS_INVALID',
      'content',
      'The `inputs` array contains an invalid entry.',
      'Use unique slash-separated relative paths to managed Markdown Artifacts.',
    ),
    def(
      'CORE_INPUTS_DUPLICATE',
      'content',
      'The `inputs` array contains duplicate references.',
      'Remove duplicate input paths.',
    ),
    def(
      'ARTIFACT_OUTSIDE_MANAGED_ROOT',
      'content',
      'The Artifact is not located inside a managed OpenContract root.',
      'Move the Artifact under the configured artifacts or specs root.',
    ),

    // --- Contract structure ----------------------------------------------
    def(
      'SCHEMA_VIOLATION',
      'content',
      'The frontmatter does not satisfy the Contract JSON Schema.',
      'Correct the frontmatter field reported by the schema error.',
    ),
    def(
      'SECTION_MISSING',
      'content',
      'A required Markdown section is missing.',
      'Add the required heading and its content.',
    ),
    def(
      'SECTION_MISORDERED',
      'content',
      'Markdown sections appear in an order the Contract does not allow.',
      'Reorder the sections to match the Contract order.',
    ),
    def(
      'SECTION_DUPLICATE',
      'content',
      'A section occurs more times than the Contract allows.',
      'Remove or merge the duplicate sections.',
    ),
    def(
      'SECTION_UNEXPECTED',
      'content',
      'A section is present that the Contract does not allow.',
      'Remove the extra section or declare it in the Contract.',
    ),
    def(
      'SECTION_EMPTY',
      'content',
      'A required section does not contain the minimum content.',
      'Add substantive content under the reported heading.',
    ),
    def(
      'SECTION_LEVEL_INVALID',
      'content',
      'A section heading uses a level the Contract does not allow.',
      'Change the heading depth to the declared level.',
    ),

    // --- References and dependency graph ----------------------------------
    def(
      'REFERENCE_NOT_FOUND',
      'content',
      'A declared input does not exist.',
      'Create the referenced Artifact or correct the input path.',
    ),
    def(
      'REFERENCE_UNSAFE',
      'content',
      'A declared input is absolute, traverses outside the managed root, or escapes through a symlink.',
      'Use a relative input path that stays inside the managed OpenContract root.',
    ),
    def(
      'REFERENCE_IS_DIRECTORY',
      'content',
      'A declared input points at a directory.',
      'Reference a Markdown Artifact file instead of a directory.',
    ),
    def(
      'REFERENCE_NOT_MANAGED',
      'content',
      'A declared input is not a managed Markdown Artifact.',
      'Reference a Markdown file that carries artifact-core frontmatter.',
    ),
    def(
      'REFERENCE_METADATA_INVALID',
      'content',
      'A referenced Artifact has invalid public metadata.',
      'Repair the referenced Artifact before referencing it.',
    ),
    def(
      'REFERENCE_CYCLE',
      'content',
      'The input graph contains a dependency cycle.',
      'Break the cycle by removing one of the reported input edges.',
    ),
    def(
      'MARKDOWN_LINK_BROKEN',
      'content',
      'A managed Markdown link does not resolve to an existing file.',
      'Repair the link target or remove the link.',
    ),

    // --- Semantic validator boundary --------------------------------------
    def(
      'VALIDATOR_UNTRUSTED',
      'configuration',
      'The Contract validator entrypoint is not under a configured trusted root.',
      'Add the validator directory to `trust.validatorRoots` in .opencontract/config.yaml, or accept the skipped phase.',
    ),
    def(
      'VALIDATOR_ENTRYPOINT_MISSING',
      'configuration',
      'The declared validator entrypoint does not exist.',
      'Reinstall the Contract package or correct the validator declaration.',
    ),
    def(
      'VALIDATOR_RUNTIME_MISSING',
      'configuration',
      'The configured Python runtime is not available.',
      'Install Python 3 or set `validator.pythonExecutable` in .opencontract/config.yaml.',
    ),
    def(
      'VALIDATOR_TIMEOUT',
      'configuration',
      'The semantic validator exceeded the configured timeout.',
      'Increase `validator.timeoutMs` or make the validator faster.',
    ),
    def(
      'VALIDATOR_EXIT_NONZERO',
      'configuration',
      'The semantic validator exited with a non-zero status.',
      'Inspect the captured validator stderr and fix the validator.',
    ),
    def(
      'VALIDATOR_PROTOCOL_INVALID',
      'configuration',
      'The semantic validator did not emit valid protocol JSON on stdout.',
      'Emit exactly one protocol JSON document on stdout and send logs to stderr.',
    ),
    def(
      'VALIDATOR_STDOUT_CONTAMINATED',
      'configuration',
      'The semantic validator wrote non-protocol output on stdout.',
      'Move diagnostic output to stderr so stdout carries only protocol JSON.',
    ),
    def(
      'VALIDATOR_OUTPUT_TOO_LARGE',
      'configuration',
      'The semantic validator produced more stdout than the configured limit allows.',
      'Reduce validator output or raise `validator.maxOutputBytes`.',
    ),
    def(
      'VALIDATOR_RESPONSE_INVALID',
      'configuration',
      'The semantic validator response did not match the expected protocol shape.',
      'Return `{ "protocol": "opencontract-validator", "version": "v1.0.0", "valid": bool, "errors": [] }`.',
    ),
    def(
      'SEMANTIC_VIOLATION',
      'content',
      'A semantic validator reported a Contract violation.',
      'Apply the repair hint reported by the validator.',
    ),

    // --- ActionRun --------------------------------------------------------
    def(
      'ACTION_RUN_NAME_INVALID',
      'content',
      'The ActionRun directory name does not match {YYYYMMDDTHHmmss}-{short-description}.',
      'Rename the directory to a timestamp plus a short kebab-case description.',
    ),
    def(
      'ACTION_RUN_TIMESTAMP_INVALID',
      'content',
      'The ActionRun directory timestamp is not a valid YYYYMMDDTHHmmss value.',
      'Use a real calendar timestamp such as 20260131T120000.',
    ),
    def(
      'ACTION_RUN_DESCRIPTION_INVALID',
      'content',
      'The ActionRun short description is not lowercase kebab-case.',
      'Use lowercase letters, digits, and single hyphens after the timestamp.',
    ),
    def(
      'ACTION_RUN_STRAY_MARKDOWN',
      'content',
      'An ordinary Markdown file without managed frontmatter is mixed into the ActionRun directory.',
      'Move unmanaged notes outside the ActionRun directory or add artifact-core frontmatter.',
    ),
    def(
      'ACTION_RUN_EMPTY',
      'content',
      'The ActionRun directory contains no managed Markdown outputs.',
      'Add the Action outputs, or remove the empty ActionRun directory.',
    ),
    def(
      'ACTION_IDENTITY_INCONSISTENT',
      'content',
      'Managed outputs in one ActionRun disagree on `action` or `action_version`.',
      'Give every output in the ActionRun the same action name and exact version.',
    ),
    def(
      'ACTION_OUTPUT_MISSING',
      'content',
      'A required output Contract is missing from the ActionRun.',
      'Produce the missing output Artifact for this Action.',
    ),
    def(
      'ACTION_OUTPUT_COUNT_LOW',
      'content',
      'An output Contract has fewer instances than its declared minimum count.',
      'Add the missing output instances.',
    ),
    def(
      'ACTION_OUTPUT_COUNT_HIGH',
      'content',
      'An output Contract has more instances than its declared maximum count.',
      'Remove the extra output instances.',
    ),
    def(
      'ACTION_INPUT_MISSING',
      'content',
      'A required input Contract is not present among the merged ActionRun inputs.',
      'Reference the required input Artifact from at least one output.',
    ),
    def(
      'ACTION_INPUT_COUNT_LOW',
      'content',
      'An input Contract has fewer merged references than its declared minimum count.',
      'Reference additional Artifacts of the required input Contract.',
    ),

    // --- SDD and lifecycle ------------------------------------------------
    def(
      'TASK_DIR_NAME_INVALID',
      'content',
      'The task directory name does not match {YYYYMMDDTHHmmss}-{short-description}.',
      'Rename the task directory to a timestamp plus a short kebab-case description.',
    ),
    def(
      'ARTIFACT_AT_ROOT',
      'content',
      'A managed Artifact is placed directly at the artifacts root.',
      'Move the Artifact into opencontract/artifacts/{task}/{action-run}/.',
    ),
    def(
      'ARTIFACT_PATH_INVALID',
      'content',
      'The managed Artifact path does not use the required two timestamped directory levels.',
      'Store the Artifact at opencontract/artifacts/{task}/{action-run}/{artifact}.md.',
    ),
    def(
      'ARCHIVE_PATH_MUTABLE',
      'content',
      'An archived task path was modified, but archived history is immutable.',
      'Restore the archived content and record new work in a new task directory.',
    ),
    def(
      'DECISION_PENDING',
      'content',
      'A required authorization Decision is still pending.',
      'Record a decided Decision with decider, decision time, and selected option before continuing.',
    ),
    def(
      'DECISION_INVALID',
      'content',
      'A Decision Artifact is missing state fields required by its status.',
      'Add decider, decided_at, and selected_option for a decided Decision.',
    ),
    def(
      'DECISION_OPTION_INVALID',
      'content',
      'The recorded `selected_option` is not one of the Decision\'s declared options.',
      'Set `selected_option` to one of the options the Decision lists.',
    ),
    def(
      'DECISION_TIMESTAMP_INVALID',
      'content',
      '`decided_at` is not a parseable timestamp.',
      'Use an RFC 3339 timestamp such as 2026-01-31T12:00:00Z.',
    ),
    def(
      'DECISION_ARCHIVED_PENDING',
      'content',
      'An archived Decision is still pending.',
      'Record the decision before archiving the task, or leave the task in place.',
    ),
    def(
      'ARCHIVE_REFERENCE_UNSAFE',
      'content',
      'A reference cannot be safely rewritten for the planned archive move.',
      'Resolve the reported reference manually and re-run the archive Action.',
    ),
    def(
      'ARCHIVE_REFERENCE_CONFLICT',
      'content',
      'An archive reference repair requires a human decision.',
      'Record a decided Decision selecting how to resolve the conflicting reference.',
    ),
    def(
      'ARCHIVE_REFERENCE_REPAIR_FAILED',
      'unexpected',
      'A reference rewrite could not be written to disk.',
      'Check file permissions; the workspace may be partially repaired.',
    ),

    // --- System management -------------------------------------------------
    def(
      'SYSTEM_MISSING',
      'configuration',
      'The system definition tree is missing.',
      'Run `opencontract update` to install the system tree.',
    ),
    def(
      'SYSTEM_INVALID',
      'configuration',
      'The installed system tree is incomplete or malformed.',
      'Run `opencontract update` to reinstall the system tree.',
    ),
    def(
      'UPDATE_STAGING_FAILED',
      'configuration',
      'The update could not stage the new system package.',
      'Check filesystem permissions and free space, then retry `opencontract update`.',
    ),
    def(
      'UPDATE_VALIDATION_FAILED',
      'configuration',
      'The staged system package failed validation and was not installed.',
      'Report the failing definition; the previous system tree is still in place.',
    ),
    def(
      'UPDATE_ROLLBACK_PERFORMED',
      'configuration',
      'The update failed and the previous system tree was restored.',
      'Inspect the reported cause and retry once it is resolved.',
    ),
    def(
      'ADAPTER_CONFLICT',
      'configuration',
      'A harness adapter path holds an unmarked user-authored file.',
      'Move or delete the user file if you want OpenContract to manage that path.',
    ),
    def(
      'ADAPTER_MISSING',
      'configuration',
      'A selected harness adapter is not installed.',
      'Run `opencontract update` to regenerate harness adapters.',
    ),
    def(
      'ADAPTER_STALE',
      'configuration',
      'A generated harness adapter does not match the installed system version.',
      'Run `opencontract update` to refresh generated adapters.',
    ),
    def(
      'CACHE_INVALID',
      'configuration',
      'A cache entry is malformed and cannot be used for exact-version fallback.',
      'Remove the reported cache entry and re-run `opencontract update`.',
    ),
    def(
      'REGISTRY_INVALID',
      'configuration',
      'A configured local registry path is missing or unreadable.',
      'Correct or remove the registry entry in .opencontract/config.yaml.',
    ),

    // --- CLI boundary -----------------------------------------------------
    def(
      'COMMAND_UNSUPPORTED',
      'configuration',
      'This command is intentionally not provided by OpenContract.',
      'OpenContract does not orchestrate Actions; choose and run Actions in the agent layer.',
    ),
    def(
      'PARAMETER_INVALID',
      'configuration',
      'A command parameter is missing or invalid.',
      'Check `opencontract <command> --help` for the expected parameters.',
    ),
    def(
      'UNEXPECTED_ERROR',
      'unexpected',
      'An unexpected failure occurred.',
      'Re-run with the failing path; if it persists, report the error with the stack trace.',
    ),
  ].map((entry) => [entry.code, entry]),
);

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function errorDefinition(code: string): ErrorDefinition {
  const found = ERROR_CATALOG[code];
  if (!found) {
    throw new Error(`Unknown OpenContract error code: ${code}`);
  }
  return found;
}

export function errorClassOf(code: string): ErrorClass {
  return errorDefinition(code).errorClass;
}

export function exitCodeForErrorCode(code: string): ExitCode {
  return ERROR_CLASS_EXIT_CODES[errorClassOf(code)];
}

export function repairHintFor(code: string): string {
  return errorDefinition(code).repairHint;
}

export interface OpenContractErrorOptions {
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;
  readonly repairHint?: string;
  readonly cause?: unknown;
}

/**
 * The single error type crossing service boundaries. Carrying the catalog code
 * keeps the exit-code decision mechanical at the CLI edge.
 */
export class OpenContractError extends Error {
  readonly code: string;
  readonly errorClass: ErrorClass;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;
  readonly repairHint: string;

  constructor(code: string, message?: string, options: OpenContractErrorOptions = {}) {
    const definition = errorDefinition(code);
    super(message ?? definition.summary, { cause: options.cause });
    this.name = 'OpenContractError';
    this.code = code;
    this.errorClass = definition.errorClass;
    this.path = options.path;
    this.line = options.line;
    this.column = options.column;
    this.detail = options.detail;
    this.repairHint = options.repairHint ?? definition.repairHint;
  }

  get exitCode(): ExitCode {
    return ERROR_CLASS_EXIT_CODES[this.errorClass];
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      errorClass: this.errorClass,
      message: this.message,
      path: this.path,
      line: this.line,
      column: this.column,
      detail: this.detail,
      repairHint: this.repairHint,
    };
  }
}

export function isOpenContractError(value: unknown): value is OpenContractError {
  return value instanceof OpenContractError;
}

/** Wraps an unknown thrown value as an `UNEXPECTED_ERROR`. */
export function toUnexpectedError(value: unknown, path?: string): OpenContractError {
  if (isOpenContractError(value)) {
    return value;
  }
  const message = value instanceof Error ? value.message : String(value);
  return new OpenContractError('UNEXPECTED_ERROR', message, { path, cause: value });
}
