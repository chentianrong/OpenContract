import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { toString as nodeToString } from 'mdast-util-to-string';
import { OpenContractError } from '../domain/errors.js';

/**
 * Markdown parsing is split from rule evaluation: this module yields
 * frontmatter, body offsets, and heading information with file-absolute
 * positions so every later phase can report a real line and column.
 */

/** A heading discovered in the Markdown body. */
export interface HeadingInfo {
  readonly text: string;
  readonly depth: number;
  /** 1-based line in the original file, not in the body slice. */
  readonly line: number;
  /** 1-based column in the original file. */
  readonly column: number;
  /**
   * Non-whitespace character count of the prose owned by this heading, up to
   * the next heading at the same or shallower depth. Nested heading text is
   * excluded so a section holding only empty subsections still reads as empty.
   */
  readonly contentLength: number;
}

export interface ParsedMarkdown {
  readonly path: string;
  readonly raw: string;
  readonly frontmatter: Record<string, unknown>;
  /** 1-based line of the closing frontmatter delimiter. */
  readonly frontmatterEndLine: number;
  readonly body: string;
  /** Character offset in the original text where the body begins. */
  readonly bodyOffset: number;
  /** 1-based line in the original file where the body begins. */
  readonly bodyStartLine: number;
  readonly headings: HeadingInfo[];
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

interface FrontmatterSplit {
  readonly yamlText: string;
  readonly body: string;
  readonly bodyOffset: number;
  readonly bodyStartLine: number;
  readonly frontmatterEndLine: number;
}

/**
 * Split a leading `---` delimited frontmatter block from the body, tracking
 * offsets so diagnostics can point back into the original file.
 */
function splitFrontmatter(raw: string, path: string): FrontmatterSplit {
  // A frontmatter block must open on the very first line.
  const opening = /^---[ \t]*\r?\n/.exec(raw);
  if (!opening) {
    throw new OpenContractError(
      'FRONTMATTER_MISSING',
      'The file does not open with a --- frontmatter delimiter.',
      { path, line: 1, column: 1 },
    );
  }

  const contentStart = opening[0].length;
  const closing = /^---[ \t]*(?:\r?\n|$)/m;
  const rest = raw.slice(contentStart);
  const closingMatch = closing.exec(rest);
  if (!closingMatch || closingMatch.index === undefined) {
    throw new OpenContractError(
      'FRONTMATTER_MISSING',
      'The frontmatter block is not closed by a --- delimiter.',
      { path, line: 1, column: 1 },
    );
  }

  const yamlText = rest.slice(0, closingMatch.index);
  const bodyOffset = contentStart + closingMatch.index + closingMatch[0].length;
  // Line 1 is the opening delimiter; the YAML occupies the lines after it.
  const frontmatterEndLine = 1 + countNewlines(opening[0] + yamlText);
  const bodyStartLine = frontmatterEndLine + 1;

  return {
    yamlText,
    body: raw.slice(bodyOffset),
    bodyOffset,
    bodyStartLine,
    frontmatterEndLine,
  };
}

/**
 * Extract heading positions and their owned content length from the Markdown
 * AST. A heading owns all prose until the next heading at the same or shallower
 * depth; nested headings do not contribute to the parent's content length.
 */
function extractHeadings(body: string, bodyStartLine: number): HeadingInfo[] {
  const tree = unified().use(remarkParse).parse(body);
  const headings: Array<{
    text: string;
    depth: number;
    line: number;
    column: number;
    /** Offset of the heading marker itself, used to exclude nested headings. */
    headingLineStart: number;
    /** Offset where this heading's owned prose begins. */
    startOffset: number;
    endOffset: number;
  }> = [];

  // Collect all heading positions with their owned range
  for (let i = 0; i < tree.children.length; i += 1) {
    const node = tree.children[i];
    if (node.type === 'heading' && node.position) {
      const headingLineStart = node.position.start.offset ?? 0;
      // A heading's owned prose range extends from the end of its own line to
      // the start of the next same-or-shallower heading, or to EOF.
      const startOffset = node.position.end.offset ?? 0;
      let endOffset = body.length;

      for (let j = i + 1; j < tree.children.length; j += 1) {
        const next = tree.children[j];
        if (next.type === 'heading' && next.depth <= node.depth && next.position) {
          endOffset = next.position.start.offset ?? body.length;
          break;
        }
      }

      headings.push({
        text: nodeToString(node),
        depth: node.depth,
        line: bodyStartLine + node.position.start.line - 1,
        column: node.position.start.column,
        headingLineStart,
        startOffset,
        endOffset,
      });
    }
  }

  // Compute content length: count prose not owned by any nested heading
  const result: HeadingInfo[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const slice = body.slice(current.startOffset, current.endOffset);

    // Identify nested headings and exclude their owned text
    const excludedRanges: Array<[number, number]> = [];
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j].depth <= current.depth) break;
      // Exclude from the nested heading's line start (the ## marker) to the
      // end of its owned section, so the parent owns none of it.
      const nestedStart = headings[j].headingLineStart - current.startOffset;
      const nestedEnd = headings[j].endOffset - current.startOffset;
      excludedRanges.push([nestedStart, nestedEnd]);
    }

    // Nested ranges overlap when headings skip levels, so merge them before
    // counting or the same span would be excluded twice.
    excludedRanges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const range of excludedRanges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) {
        last[1] = Math.max(last[1], range[1]);
      } else {
        merged.push([range[0], range[1]]);
      }
    }

    // Count prose outside excluded ranges
    let contentLength = 0;
    let pos = 0;
    for (const [excludeStart, excludeEnd] of merged) {
      if (pos < excludeStart) {
        contentLength += slice.slice(pos, excludeStart).replace(/\s/g, '').length;
      }
      pos = Math.max(pos, excludeEnd);
    }
    if (pos < slice.length) {
      contentLength += slice.slice(pos).replace(/\s/g, '').length;
    }

    result.push({
      text: current.text,
      depth: current.depth,
      line: current.line,
      column: current.column,
      contentLength,
    });
  }

  return result;
}

/**
 * Parse a Markdown file with YAML frontmatter, extracting metadata, body, and
 * heading structure with file-absolute positions.
 */
export function parseMarkdown(path: string): ParsedMarkdown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (cause) {
    throw new OpenContractError('ARTIFACT_READ_FAILED', `Cannot read file: ${path}`, {
      path,
      cause,
    });
  }

  const { yamlText, body, bodyOffset, bodyStartLine, frontmatterEndLine } = splitFrontmatter(
    raw,
    path,
  );

  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(yamlText);
  } catch (cause) {
    throw new OpenContractError(
      'FRONTMATTER_PARSE_ERROR',
      'The frontmatter block is not valid YAML.',
      { path, line: 2, cause },
    );
  }

  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    throw new OpenContractError(
      'FRONTMATTER_NOT_MAPPING',
      'The frontmatter must be a YAML mapping.',
      { path, line: 2 },
    );
  }

  const headings = extractHeadings(body, bodyStartLine);

  return {
    path,
    raw,
    frontmatter: frontmatter as Record<string, unknown>,
    frontmatterEndLine,
    body,
    bodyOffset,
    bodyStartLine,
    headings,
  };
}
