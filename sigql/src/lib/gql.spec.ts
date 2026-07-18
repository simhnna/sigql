import { describe, it, expect } from 'vitest';
import { gql } from './gql';

describe('gql', () => {
  it('parses a query string into a DocumentNode', () => {
    const doc = gql`
      {
        hello
      }
    `;
    expect(doc).toBeDefined();
    expect(doc.definitions).toHaveLength(1);
    expect(doc.definitions[0].kind).toBe('OperationDefinition');
  });

  it('supports interpolations', () => {
    const fragment = 'id name';
    const doc = gql`query GetUser { user { ${fragment} } }`;
    expect(doc.definitions).toHaveLength(1);
  });

  it('throws on invalid GraphQL syntax', () => {
    expect(() => gql`not valid graphql !!!`).toThrow();
  });
});
