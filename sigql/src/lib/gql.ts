import { parse, DocumentNode } from 'graphql';

export type { DocumentNode };

export function gql(strings: TemplateStringsArray, ...values: unknown[]): DocumentNode {
  const query = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
  return parse(query);
}
