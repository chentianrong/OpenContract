import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import type { ValidationError } from '../domain/types.js';
import { repairHintFor } from '../domain/errors.js';
import { parseMarkdown } from '../markdown/parser.js';

/**
 * Reference resolution and graph traversal.
 *
 * Two things make this more than a path join: inputs must stay inside the
 * managed root even through symlinks, and recursive traversal has to terminate
 * on cycles. Visited nodes are keyed by realpath so two paths that resolve to
 * the same file are one node.
 */

export interface ResolvedInput {
  /** The relative path exactly as declared in frontmatter. */
  readonly declared: string;
  /** Absolute path after joining with the referring Artifact's directory. */
  readonly absolute: string;
  /** Realpath when the target exists; absent when it does not. */
  readonly real?: string;
}

export interface ReferenceCheckOptions {
  /** Absolute root that every reference must stay inside. */
  readonly managedRoot: string;
  /** Traverse transitive inputs rather than only direct ones. */
  readonly recursive?: boolean;
}

export interface ReferenceCheckResult {
  readonly errors: ValidationError[];
  /**
   * Realpaths of every Artifact reached during traversal, in the order visited.
   * Deterministic: inputs are followed in declaration order, depth-first.
   */
  readonly visited: string[];
}

function error(
  code: string,
  message: string,
  path: string,
  detail?: string,
  line?: number,
): ValidationError {
  return {
    code,
    phase: 'references',
    message,
    path,
    line,
    detail,
    repairHint: repairHintFor(code),
  };
}

function isUnder(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/** Reads the `inputs` array of an Artifact, ignoring entries that are not strings. */
export function readDeclaredInputs(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.inputs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Resolve one declared input against the Artifact that declares it. Path safety
 * is enforced here rather than at the call site so every traversal shares the
 * same rules.
 */
export function resolveInput(
  fromArtifact: string,
  declared: string,
  managedRoot: string,
): { resolved?: ResolvedInput; error?: ValidationError } {
  if (isAbsolute(declared) || /^[A-Za-z]:[\\/]/.test(declared)) {
    return {
      error: error(
        'REFERENCE_UNSAFE',
        'Inputs must be relative paths, not absolute ones.',
        fromArtifact,
        declared,
      ),
    };
  }

  const absolute = resolve(dirname(fromArtifact), declared);

  if (!isUnder(managedRoot, absolute)) {
    return {
      error: error(
        'REFERENCE_UNSAFE',
        'Input resolves outside the managed OpenContract root.',
        fromArtifact,
        `${declared} -> ${absolute}`,
      ),
    };
  }

  if (!existsSync(absolute)) {
    return {
      error: error('REFERENCE_NOT_FOUND', 'Input does not exist.', fromArtifact, declared),
    };
  }

  const real = realpathSync(absolute);
  if (!isUnder(managedRoot, real)) {
    return {
      error: error(
        'REFERENCE_UNSAFE',
        'Input resolves through a symlink that leaves the managed root.',
        fromArtifact,
        `${declared} -> ${real}`,
      ),
    };
  }

  if (statSync(real).isDirectory()) {
    return {
      error: error('REFERENCE_IS_DIRECTORY', 'Input points at a directory.', fromArtifact, declared),
    };
  }

  return { resolved: { declared, absolute, real } };
}

/**
 * Validate references starting from one Artifact. Direct inputs are always
 * checked for existence, safety, and parseable public metadata. With
 * `recursive`, transitive inputs are traversed too and cycles are reported.
 */
export function checkReferences(
  startPath: string,
  options: ReferenceCheckOptions,
): ReferenceCheckResult {
  const { managedRoot, recursive = false } = options;
  const errors: ValidationError[] = [];
  const visited: string[] = [];
  const visitedSet = new Set<string>();
  // Realpaths on the current traversal branch, in order, for cycle reporting.
  const branch: string[] = [];
  const onBranch = new Set<string>();

  function visit(artifactPath: string): void {
    let real: string;
    try {
      real = realpathSync(artifactPath);
    } catch {
      // Existence was already checked by resolveInput for inputs; a start path
      // that cannot be resolved is reported by the caller's parse phase.
      return;
    }

    if (onBranch.has(real)) {
      const cycleStart = branch.indexOf(real);
      const cycle = [...branch.slice(cycleStart), real];
      errors.push(
        error(
          'REFERENCE_CYCLE',
          'The input graph contains a dependency cycle.',
          artifactPath,
          cycle.map((p, i) => `${i + 1}. ${p}`).join(' -> '),
        ),
      );
      return;
    }

    if (visitedSet.has(real)) {
      return;
    }

    visitedSet.add(real);
    visited.push(real);
    branch.push(real);
    onBranch.add(real);

    let declaredInputs: string[];
    try {
      declaredInputs = readDeclaredInputs(parseMarkdown(artifactPath).frontmatter);
    } catch (cause) {
      errors.push(
        error(
          'REFERENCE_NOT_MANAGED',
          'Referenced file is not a parseable managed Artifact.',
          artifactPath,
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
      branch.pop();
      onBranch.delete(real);
      return;
    }

    // Broken managed links are reported for every visited Artifact: an archive
    // move that breaks a link is a reference defect, not a body-content one.
    errors.push(...checkManagedLinks(artifactPath, managedRoot));

    for (const declared of declaredInputs) {
      const { resolved, error: resolutionError } = resolveInput(
        artifactPath,
        declared,
        managedRoot,
      );
      if (resolutionError) {
        errors.push(resolutionError);
        continue;
      }
      if (!resolved) continue;

      if (recursive) {
        visit(resolved.absolute);
      } else {
        // Default depth: confirm the direct target is a managed Artifact with
        // valid public metadata, without following its own inputs.
        errors.push(...checkDirectTarget(artifactPath, resolved));
      }
    }

    branch.pop();
    onBranch.delete(real);
  }

  visit(startPath);

  return { errors, visited };
}

/** Public metadata every referenced Artifact must expose to be linkable. */
const PUBLIC_METADATA = ['contract', 'version', 'action', 'action_version', 'created_at'] as const;

function checkDirectTarget(fromArtifact: string, input: ResolvedInput): ValidationError[] {
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseMarkdown(input.absolute).frontmatter;
  } catch (cause) {
    return [
      error(
        'REFERENCE_NOT_MANAGED',
        `Input "${input.declared}" is not a parseable managed Artifact.`,
        fromArtifact,
        cause instanceof Error ? cause.message : String(cause),
      ),
    ];
  }

  const missing = PUBLIC_METADATA.filter((field) => typeof frontmatter[field] !== 'string');
  if (missing.length > 0) {
    return [
      error(
        'REFERENCE_METADATA_INVALID',
        `Input "${input.declared}" is missing valid public metadata.`,
        fromArtifact,
        `missing or non-string: ${missing.join(', ')}`,
      ),
    ];
  }

  return [];
}

/** A Markdown link in an Artifact body that points at another managed file. */
export interface ManagedLink {
  /** The link target exactly as written. */
  readonly target: string;
  /** Absolute path the target resolves to. */
  readonly absolute: string;
  /** 1-based line in the referring file. */
  readonly line: number;
}

/**
 * Find Markdown links whose target is a relative path to a `.md` file inside
 * the managed root. Archive moves must rewrite these alongside `inputs`, so
 * discovery lives here rather than in the archive service.
 *
 * External URLs, in-page anchors, and non-Markdown targets are not managed
 * references and are skipped.
 */
export function findManagedLinks(artifactPath: string, managedRoot: string): ManagedLink[] {
  let body: string;
  let bodyStartLine: number;
  try {
    const parsed = parseMarkdown(artifactPath);
    body = parsed.body;
    bodyStartLine = parsed.bodyStartLine;
  } catch {
    return [];
  }

  const links: ManagedLink[] = [];
  const inlineLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const lines = body.split('\n');

  for (const [index, text] of lines.entries()) {
    inlineLink.lastIndex = 0;
    let matched: RegExpExecArray | null;
    while ((matched = inlineLink.exec(text)) !== null) {
      const target = matched[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
        continue; // absolute URL or in-page anchor
      }
      const withoutAnchor = target.split('#')[0];
      if (!withoutAnchor.endsWith('.md')) continue;
      if (isAbsolute(withoutAnchor)) continue;

      const absolute = resolve(dirname(artifactPath), withoutAnchor);
      if (!isUnder(managedRoot, absolute)) continue;

      links.push({ target, absolute, line: bodyStartLine + index });
    }
  }

  return links;
}

/** Reports managed Markdown links whose target does not exist. */
export function checkManagedLinks(artifactPath: string, managedRoot: string): ValidationError[] {
  return findManagedLinks(artifactPath, managedRoot)
    .filter((link) => !existsSync(link.absolute))
    .map((link) =>
      error(
        'MARKDOWN_LINK_BROKEN',
        `Markdown link "${link.target}" does not resolve to an existing file.`,
        artifactPath,
        link.absolute,
        link.line,
      ),
    );
}

