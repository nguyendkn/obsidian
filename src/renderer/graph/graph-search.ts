/**
 * Graph search, matching Obsidian's `SearchQuery` as used by the graph engine:
 * terms are ANDed, `-` negates, quotes keep spaces, and the graph passes a
 * different field set per node kind — filename for attachments, filename +
 * content for notes, the tag string for tags. Plain terms never match the
 * folder part of a path; that needs the `path:` operator.
 */
export interface SearchFields {
  /** Last path segment, extension included. */
  filename?: string;
  /** Full vault path. */
  path?: string;
  /** Markdown text; absent for attachments. */
  content?: string;
  /** `#tag` string; only for tag nodes. */
  tag?: string;
  /** Tags of the file; `tag:` terms match any of them. */
  tags?: string[];
}

export interface SearchQuery {
  test(fields: SearchFields): boolean;
  /** True when the query has a `tag:` term, so callers know to supply `tags`. */
  hasTagTerm: boolean;
}

type Field = '' | 'file' | 'path' | 'tag' | 'content';

interface Term {
  negate: boolean;
  field: Field;
  value: string;
}

const OPERATORS: Record<string, Field> = {
  file: 'file',
  filename: 'file',
  path: 'path',
  tag: 'tag',
  content: 'content',
};

/** Splits on whitespace outside quotes, dropping the quote characters. */
function scanTerms(input: string): string[] {
  const terms: string[] = [];
  let current = '';
  let quote = '';
  const flush = (): void => {
    if (current) terms.push(current);
    current = '';
  };
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) flush();
    else current += char;
  }
  flush();
  return terms;
}

function parseTerm(token: string): Term {
  const negate = token.startsWith('-') && token.length > 1;
  const body = negate ? token.slice(1) : token;
  const colon = body.indexOf(':');
  const name = colon > 0 ? body.slice(0, colon).toLowerCase() : '';
  const field = OPERATORS[name] ?? '';
  const value = field ? body.slice(colon + 1) : body;
  return { negate, field, value: value.toLowerCase() };
}

function matchesTag(tag: string, value: string): boolean {
  const needle = value.replace(/^#/, '');
  const haystack = tag.replace(/^#/, '').toLowerCase();
  // `tag:#a` also matches nested tags such as `#a/b`.
  return haystack === needle || haystack.startsWith(`${needle}/`);
}

function matchesTerm(term: Term, fields: SearchFields): boolean {
  if (!term.value) return true;
  const filename = fields.filename?.toLowerCase() ?? '';
  const path = fields.path?.toLowerCase() ?? '';
  const content = fields.content?.toLowerCase() ?? '';
  switch (term.field) {
    case 'tag':
      if (fields.tags) return fields.tags.some((tag) => matchesTag(tag, term.value));
      return matchesTag(fields.tag ?? '', term.value);
    case 'file':
      return filename.includes(term.value);
    case 'path':
      return path.includes(term.value);
    case 'content':
      return content.includes(term.value);
    default:
      return filename.includes(term.value) || content.includes(term.value);
  }
}

/** Parses a graph search string; returns `null` for an empty query. */
export function parseSearchQuery(input: string): SearchQuery | null {
  const terms = scanTerms(input).map(parseTerm);
  if (!terms.length) return null;
  return {
    test: (fields) => terms.every((term) => (term.negate ? !matchesTerm(term, fields) : matchesTerm(term, fields))),
    hasTagTerm: terms.some((term) => term.field === 'tag'),
  };
}
