import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarkdown } from '../src/markdown/parser.js';
import { OpenContractError } from '../src/domain/errors.js';

describe('Markdown parsing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-md-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function write(name: string, content: string): string {
    const path = join(tempDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  function codeOf(fn: () => unknown): string {
    try {
      fn();
    } catch (err) {
      if (err instanceof OpenContractError) return err.code;
      throw err;
    }
    return 'NO_ERROR';
  }

  it('parses frontmatter and body with offsets', () => {
    const path = write(
      'artifact.md',
      `---
contract: note
version: v1.0.0
---

## Findings

The cache key omitted the tenant id.
`,
    );

    const parsed = parseMarkdown(path);
    expect(parsed.frontmatter.contract).toBe('note');
    expect(parsed.frontmatter.version).toBe('v1.0.0');
    expect(parsed.frontmatterEndLine).toBe(4);
    expect(parsed.bodyStartLine).toBe(5);
    expect(parsed.raw.slice(parsed.bodyOffset)).toBe(parsed.body);
    expect(parsed.body.startsWith('\n## Findings')).toBe(true);
  });

  it('maps heading positions back to file lines', () => {
    const path = write(
      'artifact.md',
      `---
contract: tasks
---
## First

Prose under first.

### Nested

More prose.

## Second

Other prose.
`,
    );

    const parsed = parseMarkdown(path);
    expect(parsed.bodyStartLine).toBe(4);

    const [first, nested, second] = parsed.headings;
    expect(first.text).toBe('First');
    expect(first.depth).toBe(2);
    expect(first.line).toBe(4);
    expect(first.column).toBe(1);

    expect(nested.text).toBe('Nested');
    expect(nested.depth).toBe(3);
    expect(nested.line).toBe(8);

    expect(second.text).toBe('Second');
    expect(second.depth).toBe(2);
    expect(second.line).toBe(12);
  });

  it('counts only prose a heading owns, excluding nested sections', () => {
    const path = write(
      'artifact.md',
      `---
contract: tasks
---
## Owner

abc

### Child

defgh

## Empty

## AlsoEmpty

### OnlyASubheading
`,
    );

    const parsed = parseMarkdown(path);
    const byName = new Map(parsed.headings.map((h) => [h.text, h]));

    // "Owner" owns "abc" but not the child's "defgh".
    expect(byName.get('Owner')!.contentLength).toBe(3);
    expect(byName.get('Child')!.contentLength).toBe(5);
    // A heading with nothing under it has no content.
    expect(byName.get('Empty')!.contentLength).toBe(0);
    // A heading whose only content is an empty subsection is still empty.
    expect(byName.get('AlsoEmpty')!.contentLength).toBe(0);
    expect(byName.get('OnlyASubheading')!.contentLength).toBe(0);
  });

  it('reports a missing opening delimiter', () => {
    const path = write('artifact.md', '## No frontmatter\n\nProse.\n');
    expect(codeOf(() => parseMarkdown(path))).toBe('FRONTMATTER_MISSING');
  });

  it('reports an unclosed frontmatter block', () => {
    const path = write('artifact.md', '---\ncontract: note\n\n## Body\n');
    expect(codeOf(() => parseMarkdown(path))).toBe('FRONTMATTER_MISSING');
  });

  it('reports malformed YAML in frontmatter', () => {
    const path = write('artifact.md', '---\ncontract: [unclosed\n---\n\n## Body\n');
    expect(codeOf(() => parseMarkdown(path))).toBe('FRONTMATTER_PARSE_ERROR');
  });

  it('reports frontmatter that is not a mapping', () => {
    const path = write('artifact.md', '---\n- one\n- two\n---\n\n## Body\n');
    expect(codeOf(() => parseMarkdown(path))).toBe('FRONTMATTER_NOT_MAPPING');
  });

  it('reports an unreadable path as a configuration failure', () => {
    expect(codeOf(() => parseMarkdown(join(tempDir, 'missing.md')))).toBe('ARTIFACT_READ_FAILED');
  });

  it('handles an empty body', () => {
    const path = write('artifact.md', '---\ncontract: note\n---\n');
    const parsed = parseMarkdown(path);
    expect(parsed.headings).toEqual([]);
    expect(parsed.body).toBe('');
  });

  it('keeps timestamps as strings rather than Date objects', () => {
    const path = write(
      'artifact.md',
      '---\ncreated_at: 2026-01-31T12:00:00Z\n---\n\n## Body\n\nText.\n',
    );
    const parsed = parseMarkdown(path);
    // Downstream RFC 3339 checks operate on the source text, so the parser
    // must not coerce timestamps into Date instances.
    expect(typeof parsed.frontmatter.created_at).toBe('string');
    expect(parsed.frontmatter.created_at).toBe('2026-01-31T12:00:00Z');
  });

  it('tolerates CRLF line endings', () => {
    const path = write(
      'artifact.md',
      '---\r\ncontract: note\r\n---\r\n\r\n## Heading\r\n\r\nProse.\r\n',
    );
    const parsed = parseMarkdown(path);
    expect(parsed.frontmatter.contract).toBe('note');
    expect(parsed.headings[0].text).toBe('Heading');
  });
});
