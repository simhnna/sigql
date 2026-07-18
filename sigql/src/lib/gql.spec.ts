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

  it('interpolates DocumentNode fragments by printing them back into the source', () => {
    const fragment = gql`
      fragment UserFields on User {
        id
        name
      }
    `;
    const doc = gql`
      query GetUser {
        user {
          ...UserFields
        }
      }
      ${fragment}
    `;
    expect(doc.definitions).toHaveLength(2);
    expect(doc.definitions.map((d) => d.kind)).toEqual([
      'OperationDefinition',
      'FragmentDefinition',
    ]);
  });

  it('throws on non-string, non-DocumentNode interpolations', () => {
    expect(() => gql`query GetUser { user(id: ${42}) { id } }`).toThrow(/GraphQL variables/);
  });

  it('returns the same DocumentNode instance for identical sources', () => {
    const make = () => gql`
      query GetUser {
        user {
          id
        }
      }
    `;
    expect(make()).toBe(make());
  });
});
