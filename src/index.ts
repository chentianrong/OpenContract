/**
 * Library entry point.
 *
 * Everything a Node consumer needs to discover a workspace, inspect definitions,
 * and validate Artifacts or ActionRuns — without invoking the CLI. Results are
 * plain data; formatting lives in `src/presentation` and is not exported here,
 * so a consumer can render them however it likes.
 */

// --- Workspace -------------------------------------------------------------
export {
  discoverWorkspace,
  requireWorkspace,
  resolvePaths,
  validateReferencePath,
} from './workspace/discovery.js';
export { initWorkspace, isWorkspaceInitialized } from './workspace/init.js';

// --- Definitions -----------------------------------------------------------
export { DefinitionResolver } from './definitions/resolver.js';
export {
  parseActionDefinition,
  parseContractDefinition,
  enumerateActions,
  enumerateContracts,
} from './definitions/parser.js';
export { DefinitionQueryService } from './definitions/service.js';
export { testContractFixtures } from './definitions/fixtures.js';
export type { ContractTestResult, FixtureOutcome } from './definitions/fixtures.js';

// --- Markdown --------------------------------------------------------------
export { parseMarkdown } from './markdown/parser.js';
export type { ParsedMarkdown, HeadingInfo } from './markdown/parser.js';

// --- Validation ------------------------------------------------------------
export { validateArtifact, validateDirectory, validateTarget } from './validation/pipeline.js';
export type { PipelineOptions, DirectoryValidationResult } from './validation/pipeline.js';
export { validateArtifactCore } from './validation/artifact-core.js';
export { validateContractRules } from './validation/contract-rules.js';
export {
  checkReferences,
  resolveInput,
  readDeclaredInputs,
  findManagedLinks,
  checkManagedLinks,
} from './validation/references.js';
export {
  runSemanticValidator,
  checkValidatorTrust,
  VALIDATOR_REQUEST_PROTOCOL,
  VALIDATOR_RESPONSE_PROTOCOL,
  VALIDATOR_PROTOCOL_VERSION,
} from './validation/semantic-validator.js';
export type { ValidatorRuntimeConfig, ValidatorOutcome } from './validation/semantic-validator.js';

// --- Actions ---------------------------------------------------------------
export { parseActionRunName, parseActionRunLayout } from './actions/action-run.js';
export type { ActionRunLayout } from './actions/action-run.js';
export { validateActionRun } from './actions/validate.js';
export type { ActionRunValidationResult } from './actions/validate.js';

// --- System management -----------------------------------------------------
export { runDoctor } from './system/health.js';
export { updateSystem } from './system/update.js';
export type { UpdateOutcome } from './system/update.js';
export {
  SUPPORTED_HARNESSES,
  GENERATED_MARKER,
  adapterFor,
  isGenerated,
  renderAdapter,
  writeAdapter,
} from './system/harnesses.js';
export type { HarnessAdapter, AdapterWriteOutcome } from './system/harnesses.js';

// --- Lifecycle -------------------------------------------------------------
export {
  isTimestampedName,
  parseManagedArtifactPath,
  checkManagedPlacement,
  taskRootFor,
  isArchived,
  checkArchiveImmutability,
  readTaskLayout,
} from './lifecycle/paths.js';
export type { ManagedArtifactPath, ManagedRoots, TaskLayout } from './lifecycle/paths.js';
export {
  readDecisionState,
  validateDecisionState,
  queryAuthorization,
  checkDecisionImmutability,
} from './lifecycle/decision.js';
export type { DecisionState, DecisionStatus, AuthorizationQuery } from './lifecycle/decision.js';
export { planArchive, repairReferences } from './lifecycle/archive.js';
export type { ArchivePlan, AffectedReference, RepairOutcome } from './lifecycle/archive.js';

// --- Errors and shared types ----------------------------------------------
export {
  OpenContractError,
  EXIT_CODES,
  ERROR_CATALOG,
  errorDefinition,
  errorClassOf,
  exitCodeForErrorCode,
  repairHintFor,
  isOpenContractError,
  toUnexpectedError,
} from './domain/errors.js';
export type { ErrorClass, ErrorCode, ExitCode, ErrorDefinition } from './domain/errors.js';
export type {
  ActionArtifactDeclaration,
  ActionDefinition,
  ArtifactMetadata,
  ContractDefinition,
  ContractRules,
  DefinitionSource,
  DoctorCheck,
  DoctorResult,
  PhaseResult,
  PhaseStatus,
  ResolvedPaths,
  SectionRule,
  SystemManifest,
  ValidationError,
  ValidationPhase,
  ValidationResult,
  ValidationTarget,
  ValidationWarning,
  ValidatorDeclaration,
  WorkspaceConfig,
  WorkspaceRoot,
} from './domain/types.js';

// --- Bundled resources ----------------------------------------------------
export { bundledSystemRoot, bundledHarnessRoot, resourcePath } from './resources.js';
