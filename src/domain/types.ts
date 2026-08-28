/**
 * Shared domain types for workspace roots, definitions, Artifact metadata,
 * Contracts, Actions, validation phases, errors, warnings, and exit codes.
 */

import type { OpenContractError } from './errors.js';

// ============================================================================
// Workspace and configuration
// ============================================================================

export interface WorkspaceRoot {
  /** Absolute path to the workspace root (parent of .opencontract/) */
  readonly root: string;
  /** Absolute path to .opencontract/config.yaml */
  readonly configPath: string;
  /** The workspace configuration, parsed and validated */
  readonly config: WorkspaceConfig;
}

export interface WorkspaceConfig {
  /** Relative path to the system definitions tree (default: .opencontract/system) */
  readonly system?: string;
  /** Relative path to the cache directory (default: .opencontract/cache) */
  readonly cache?: string;
  /** Relative path to project-owned Action extensions (default: .opencontract/actions) */
  readonly projectActions?: string;
  /** Relative path to project-owned Contract extensions (default: .opencontract/contracts) */
  readonly projectContracts?: string;
  /** Relative path to canonical Specs (default: opencontract/specs) */
  readonly specs?: string;
  /** Relative path to managed Artifacts (default: opencontract/artifacts) */
  readonly artifacts?: string;
  /** Relative path to archived Artifacts (default: opencontract/artifacts/archive) */
  readonly archive?: string;
  /** Local registry directories (absolute or workspace-relative) */
  readonly registries?: string[];
  /** Trusted directories under which semantic validators may run */
  readonly trust?: {
    readonly validatorRoots?: string[];
  };
  /** Validator subprocess configuration */
  readonly validator?: {
    readonly pythonExecutable?: string;
    readonly timeoutMs?: number;
    readonly maxOutputBytes?: number;
  };
  /** Override ambiguous definition sources */
  readonly overrides?: {
    readonly actions?: Record<string, 'project' | 'system' | 'cache' | 'registry'>;
    readonly contracts?: Record<string, 'project' | 'system' | 'cache' | 'registry'>;
  };
  /** Selected harness adapters (e.g., ["codex", "claude", "cursor"]) */
  readonly harnesses?: string[];
}

export interface ResolvedPaths {
  readonly root: string;
  readonly configPath: string;
  readonly system: string;
  readonly cache: string;
  readonly projectActions: string;
  readonly projectContracts: string;
  readonly specs: string;
  readonly artifacts: string;
  readonly archive: string;
  readonly registries: string[];
  readonly trustedValidatorRoots: string[];
}

// ============================================================================
// Definitions
// ============================================================================

export type DefinitionSource = 'project' | 'system' | 'cache' | 'registry';

export interface ActionDefinition {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly source: DefinitionSource;
  /** Absolute path to the Skill directory */
  readonly packagePath: string;
  /** Absolute path to SKILL.md */
  readonly skillPath: string;
  readonly inputs: ActionArtifactDeclaration[];
  readonly outputs: ActionArtifactDeclaration[];
}

export interface ActionArtifactDeclaration {
  readonly contract: string;
  readonly version: string;
  readonly required: boolean;
  readonly minCount?: number;
  readonly maxCount?: number;
}

export interface ContractDefinition {
  readonly name: string;
  readonly version: string;
  readonly artifactType: string;
  readonly artifactCoreVersion: string;
  readonly description: string;
  readonly source: DefinitionSource;
  /** Absolute path to the Contract package directory */
  readonly packagePath: string;
  /** Absolute path to contract.md */
  readonly contractPath: string;
  /** Absolute path to the default template.md */
  readonly templatePath: string;
  /** Template variants, if any */
  readonly variants: TemplateVariant[];
  /** Semantic validator declaration, if any */
  readonly validator?: ValidatorDeclaration;
  /** Declarative structure rules */
  readonly rules: ContractRules;
}

export interface TemplateVariant {
  readonly name: string;
  readonly path: string;
}

export interface ValidatorDeclaration {
  readonly runtime: 'python';
  /** Absolute path to the validator entrypoint script */
  readonly entrypoint: string;
}

export interface ContractRules {
  /** JSON Schema Draft 2020-12 for frontmatter validation */
  readonly frontmatterSchema?: object;
  /** Markdown heading structure rules */
  readonly sections?: SectionRule[];
  /**
   * When false, headings at a declared level that the Contract does not name
   * are rejected. Defaults to true so Contracts stay permissive unless they
   * explicitly close the set.
   */
  readonly allowExtraSections?: boolean;
}

export interface SectionRule {
  readonly name: string;
  readonly level: number;
  readonly required: boolean;
  readonly minOccurrences?: number;
  readonly maxOccurrences?: number;
  readonly minimumContent?: number;
  readonly allowExtra?: boolean;
}

// ============================================================================
// Artifact metadata
// ============================================================================

export interface ArtifactMetadata {
  readonly contract: string;
  readonly version: string;
  readonly action: string;
  readonly action_version: string;
  readonly created_at: string;
  readonly inputs: string[];
  [key: string]: unknown;
}

export interface ParsedArtifact {
  /** Absolute path to the Artifact file */
  readonly path: string;
  /** Parsed YAML frontmatter as a plain object */
  readonly frontmatter: Record<string, unknown>;
  /** The core metadata, if valid */
  readonly metadata?: ArtifactMetadata;
  /** Markdown body text */
  readonly body: string;
  /** Byte offset where the body begins */
  readonly bodyOffset: number;
  /** Markdown AST for heading analysis */
  readonly ast?: MarkdownAST;
}

export interface MarkdownAST {
  readonly type: 'root';
  readonly children: MarkdownNode[];
}

export interface MarkdownNode {
  readonly type: string;
  readonly depth?: number;
  readonly children?: MarkdownNode[];
  readonly value?: string;
  readonly position?: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
}

// ============================================================================
// Validation
// ============================================================================

export type ValidationPhase =
  | 'parse'
  | 'artifact_core'
  | 'contract_structure'
  | 'semantic_validator'
  | 'references'
  | 'action_contract';

export type PhaseStatus = 'passed' | 'failed' | 'skipped';

export interface ValidationResult {
  readonly protocol: 'opencontract-validation';
  readonly version: 'v1.0.0';
  readonly target: ValidationTarget;
  readonly valid: boolean;
  readonly phases: PhaseResult[];
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

export interface ValidationTarget {
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly contract?: string;
  readonly contractVersion?: string;
  readonly action?: string;
  readonly actionVersion?: string;
}

export interface PhaseResult {
  readonly phase: ValidationPhase;
  readonly status: PhaseStatus;
  readonly duration?: number;
}

export interface ValidationError {
  readonly code: string;
  readonly phase: ValidationPhase;
  readonly message: string;
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;
  readonly repairHint: string;
}

export interface ValidationWarning {
  readonly code: string;
  readonly phase: ValidationPhase;
  readonly message: string;
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;
}

// ============================================================================
// ActionRun
// ============================================================================

export interface ActionRunMetadata {
  readonly directory: string;
  readonly timestamp: string;
  readonly description: string;
  readonly action: string;
  readonly actionVersion: string;
  readonly outputs: ParsedArtifact[];
  readonly mergedInputs: string[];
}

// ============================================================================
// System management
// ============================================================================

export interface SystemManifest {
  readonly version: string;
  readonly installedAt: string;
  readonly actions: ManifestEntry[];
  readonly contracts: ManifestEntry[];
}

export interface ManifestEntry {
  readonly name: string;
  readonly version: string;
  readonly packagePath: string;
}

export interface UpdateResult {
  readonly success: boolean;
  readonly previousVersion?: string;
  readonly newVersion: string;
  readonly rollbackPerformed: boolean;
  readonly errors: OpenContractError[];
}

export interface DoctorResult {
  readonly healthy: boolean;
  readonly checks: DoctorCheck[];
}

export interface DoctorCheck {
  readonly component: string;
  readonly healthy: boolean;
  readonly message: string;
  readonly repairHint?: string;
}

// ============================================================================
// SDD and lifecycle
// ============================================================================

export interface TaskMetadata {
  readonly directory: string;
  readonly timestamp: string;
  readonly description: string;
}

export interface DecisionMetadata extends ArtifactMetadata {
  readonly status: 'pending' | 'decided';
  readonly decider?: string;
  readonly decided_at?: string;
  readonly selected_option?: string;
}

export interface ArchiveReferenceRepair {
  readonly oldPath: string;
  readonly newPath: string;
  readonly affectedArtifacts: string[];
  readonly safe: boolean;
  readonly conflicts: string[];
}
