import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { OpenContractError, repairHintFor } from '../domain/errors.js';
import type { ValidationError } from '../domain/types.js';
import { parseMarkdown } from '../markdown/parser.js';
import { findManagedLinks, readDeclaredInputs } from '../validation/references.js';
import type { ManagedRoots } from './paths.js';

/**
 * Archive reference discovery and repair.
 *
 * Managed `inputs` and Markdown links are relative, so moving a task directory
 * into the archive invalidates every reference that crosses the moved boundary.
 * This service computes those references, decides whether each can be rewritten
 * safely, and performs the rewrite.
 *
 * It is deliberately not a CLI command. Archiving is an agent decision: when a
 * reference cannot be repaired safely, the service reports it and stops rather
 * than guessing.
 */

/** One reference that the planned move would affect. */
export interface AffectedReference {
  /** Absolute path of the file holding the reference. */
  readonly holder: string;
  /** Whether the reference is a frontmatter input or a body Markdown link. */
  readonly kind: 'input' | 'link';
  /** The reference exactly as written. */
  readonly declared: string;
  /** Absolute path the reference currently resolves to. */
  readonly currentTarget: string;
  /** The rewritten reference, when one can be computed. */
  readonly rewritten?: string;
  /** Why the reference cannot be rewritten safely, when it cannot. */
  readonly unsafeReason?: string;
}

export interface ArchivePlan {
  readonly source: string;
  readonly destination: string;
  /** References that need rewriting, in discovery order. */
  readonly affected: AffectedReference[];
  /** True when every affected reference has a safe rewrite. */
  readonly safe: boolean;
  readonly errors: ValidationError[];
}

function error(code: string, message: string, path: string, detail?: string): ValidationError {
  return { code, phase: 'references', message, path, detail, repairHint: repairHintFor(code) };
}

function isUnder(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/** Recursively list Markdown files under a directory, in sorted order. */
function listMarkdown(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found.sort();
}

/** Where a path ends up after the move, or itself when the move does not affect it. */
function relocate(path: string, source: string, destination: string): string {
  return isUnder(source, path) ? join(destination, relative(source, path)) : path;
}

/**
 * Compute the reference rewrites a move would require.
 *
 * Both directions matter: references held inside the moving task, and references
 * held elsewhere that point into it.
 */
export function planArchive(
  taskDirectory: string,
  archiveRoot: string,
  roots: ManagedRoots,
): ArchivePlan {
  const source = resolve(taskDirectory);
  const destination = join(resolve(archiveRoot), relative(resolve(roots.artifacts), source));
  const errors: ValidationError[] = [];
  const affected: AffectedReference[] = [];

  if (!existsSync(source)) {
    return {
      source,
      destination,
      affected,
      safe: false,
      errors: [error('PATH_NOT_FOUND', 'The task directory does not exist.', source)],
    };
  }

  if (existsSync(destination)) {
    // Archived history is immutable, so an occupied destination is not a merge
    // opportunity — it is a conflict for a human to resolve.
    errors.push(
      error(
        'ARCHIVE_REFERENCE_CONFLICT',
        'The archive destination already exists.',
        destination,
        'archived history is immutable and must not be overwritten',
      ),
    );
  }

  // Every managed Markdown file that could hold an affected reference: those
  // inside the moving task, and every other managed file in the workspace.
  const insideTask = listMarkdown(source);
  const elsewhere = listMarkdown(resolve(roots.artifacts))
    .filter((path) => !isUnder(source, path))
    .concat(listMarkdown(resolve(roots.specs ?? '')));

  for (const holder of [...insideTask, ...elsewhere]) {
    const holderAfter = relocate(holder, source, destination);

    let declaredInputs: string[];
    try {
      declaredInputs = readDeclaredInputs(parseMarkdown(holder).frontmatter);
    } catch {
      // An unparseable file cannot be repaired mechanically.
      errors.push(
        error(
          'ARCHIVE_REFERENCE_UNSAFE',
          'A managed file could not be parsed, so its references cannot be repaired.',
          holder,
        ),
      );
      continue;
    }

    const references: Array<{ kind: 'input' | 'link'; declared: string; target: string }> = [
      ...declaredInputs.map((declared) => ({
        kind: 'input' as const,
        declared,
        target: resolve(dirname(holder), declared),
      })),
      ...findManagedLinks(holder, resolve(roots.artifacts)).map((link) => ({
        kind: 'link' as const,
        declared: link.target,
        target: link.absolute,
      })),
    ];

    for (const reference of references) {
      const targetAfter = relocate(reference.target, source, destination);
      // A reference only needs rewriting when the move changes the relative
      // path between holder and target.
      const currentRelative = relative(dirname(holder), reference.target).split(sep).join('/');
      const afterRelative = relative(dirname(holderAfter), targetAfter).split(sep).join('/');
      if (currentRelative === afterRelative) {
        continue;
      }

      const anchor = reference.declared.includes('#')
        ? reference.declared.slice(reference.declared.indexOf('#'))
        : '';
      const rewritten = relative(dirname(holderAfter), targetAfter).split(sep).join('/') + anchor;

      if (!existsSync(reference.target)) {
        affected.push({
          holder,
          kind: reference.kind,
          declared: reference.declared,
          currentTarget: reference.target,
          unsafeReason: 'the current target does not exist',
        });
        continue;
      }

      // After the move the rewritten reference must still land inside a managed
      // root; a rewrite that escapes is not a safe repair.
      const resolvedAfter = resolve(dirname(holderAfter), rewritten.split('#')[0]);
      const staysManaged =
        isUnder(resolve(roots.artifacts), resolvedAfter) ||
        isUnder(resolve(archiveRoot), resolvedAfter);

      affected.push({
        holder,
        kind: reference.kind,
        declared: reference.declared,
        currentTarget: reference.target,
        ...(staysManaged
          ? { rewritten }
          : { unsafeReason: 'the rewritten reference would leave the managed root' }),
      });
    }
  }

  const unsafe = affected.filter((reference) => reference.rewritten === undefined);
  for (const reference of unsafe) {
    errors.push(
      error(
        'ARCHIVE_REFERENCE_UNSAFE',
        `Reference "${reference.declared}" cannot be rewritten safely.`,
        reference.holder,
        reference.unsafeReason,
      ),
    );
  }

  return { source, destination, affected, safe: errors.length === 0, errors };
}

export interface RepairOutcome {
  readonly success: boolean;
  readonly filesRewritten: string[];
  readonly errors: ValidationError[];
}

/**
 * Execute the rewrites a plan computed. This mutates files on disk; call it only
 * after the user has approved the plan.
 *
 * Frontmatter `inputs` are rewritten as a JSON array. Body Markdown links are
 * rewritten in place. The repair halts on the first file that cannot be parsed
 * or written, so partial failures leave a partially-repaired workspace.
 */
export function repairReferences(plan: ArchivePlan): RepairOutcome {
  const errors: ValidationError[] = [];
  const filesRewritten: string[] = [];

  if (!plan.safe) {
    return {
      success: false,
      filesRewritten: [],
      errors: [
        error(
          'ARCHIVE_REFERENCE_UNSAFE',
          'The plan contains unsafe rewrites and was not executed.',
          plan.source,
        ),
      ],
    };
  }

  // Group affected references by holder so each file is rewritten once.
  const byHolder = new Map<string, AffectedReference[]>();
  for (const reference of plan.affected) {
    if (!byHolder.has(reference.holder)) byHolder.set(reference.holder, []);
    byHolder.get(reference.holder)!.push(reference);
  }

  for (const [holder, references] of byHolder) {
    try {
      const raw = readFileSync(holder, 'utf-8');
      const parsed = parseMarkdown(holder);

      // Rewrite frontmatter inputs.
      const inputRefs = references.filter((ref) => ref.kind === 'input');
      if (inputRefs.length > 0) {
        const currentInputs = readDeclaredInputs(parsed.frontmatter);
        const rewrittenInputs = currentInputs.map((current) => {
          const match = inputRefs.find((ref) => ref.declared === current);
          return match?.rewritten ?? current;
        });

        // Replace only the `inputs:` line so every other field keeps the
        // exact formatting the author wrote.
        const lines = raw.split('\n');
        // parsed.frontmatterEndLine is 1-based and points at the closing `---`.
        const closingIndex = parsed.frontmatterEndLine - 1;
        const inputsIndex = lines.findIndex(
          (line, index) => index < closingIndex && /^inputs:/.test(line),
        );
        if (inputsIndex === -1) {
          throw new OpenContractError(
            'ARCHIVE_REFERENCE_REPAIR_FAILED',
            'The frontmatter has no `inputs:` line to rewrite.',
            { path: holder },
          );
        }
        lines[inputsIndex] = `inputs: ${JSON.stringify(rewrittenInputs)}`;
        writeFileSync(holder, lines.join('\n'), 'utf-8');
      }

      // Rewrite body Markdown links.
      const linkRefs = references.filter((ref) => ref.kind === 'link');
      if (linkRefs.length > 0) {
        let body = readFileSync(holder, 'utf-8');
        for (const ref of linkRefs) {
          // Replace the first occurrence of the declared link. Anchors are preserved.
          const pattern = `](${ref.declared})`;
          const replacement = `](${ref.rewritten})`;
          body = body.replace(pattern, replacement);
        }
        writeFileSync(holder, body, 'utf-8');
      }

      filesRewritten.push(holder);
    } catch (cause) {
      errors.push(
        error(
          'ARCHIVE_REFERENCE_REPAIR_FAILED',
          `Failed to repair references in ${holder}.`,
          holder,
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
      return { success: false, filesRewritten, errors };
    }
  }

  return { success: true, filesRewritten, errors: [] };
}
