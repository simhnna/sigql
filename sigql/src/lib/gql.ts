import { parse, print, DocumentNode } from 'graphql';

export type { DocumentNode };

const parseCache = new Map<string, DocumentNode>();

function isDocumentNode(value: unknown): value is DocumentNode {
  return typeof value === 'object' && value !== null && (value as DocumentNode).kind === 'Document';
}

/**
 * Parses a GraphQL template literal into a `DocumentNode`. Identical sources return the same
 * (cached) instance, so documents built inside functions still hit per-document caches downstream.
 *
 * Interpolations may be strings (e.g. shared field lists) or `DocumentNode`s (e.g. fragments,
 * which are printed back into the source). Anything else throws: interpolating runtime values
 * into the query string is a GraphQL injection vector — pass them as variables instead.
 */
export function gql(strings: TemplateStringsArray, ...values: unknown[]): DocumentNode {
  let source = '';
  strings.forEach((str, i) => {
    source += str;
    if (i >= values.length) return;
    const value = values[i];
    if (typeof value === 'string') {
      source += value;
    } else if (isDocumentNode(value)) {
      source += print(value);
    } else {
      throw new TypeError(
        `gql: interpolated value at position ${i} is neither a string nor a DocumentNode. ` +
          'Pass dynamic values as GraphQL variables instead of interpolating them into the document.',
      );
    }
  });

  let doc = parseCache.get(source);
  if (!doc) {
    doc = parse(source);
    parseCache.set(source, doc);
  }
  return doc;
}
