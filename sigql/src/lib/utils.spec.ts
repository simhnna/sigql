import { describe, it, expect } from 'vitest';
import { getOperationName } from './utils';
import { gql } from './gql';

describe('getOperationName', () => {
  it('returns undefined for a string query', () => {
    expect(getOperationName('{ hello }')).toBeUndefined();
  });

  it('returns the operation name from a named DocumentNode', () => {
    const doc = gql`query GetUser { user { id } }`;
    expect(getOperationName(doc)).toBe('GetUser');
  });

  it('returns undefined for an anonymous DocumentNode', () => {
    const doc = gql`{ user { id } }`;
    expect(getOperationName(doc)).toBeUndefined();
  });

  it('returns the first operation name from a DocumentNode with multiple operations', () => {
    const doc = gql`query GetUser { user { id } } query GetPosts { posts { id } }`;
    expect(getOperationName(doc)).toBe('GetUser');
  });
});
