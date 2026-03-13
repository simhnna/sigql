import { describe, it, expect } from 'vitest';
import { SigqlError, orThrow, GraphQLResult } from './types';

describe('SigqlError', () => {
  it('is an instance of Error', () => {
    const error = new SigqlError([{ message: 'Something went wrong' }]);
    expect(error).toBeInstanceOf(Error);
  });

  it('has name SigqlError', () => {
    const error = new SigqlError([{ message: 'oops' }]);
    expect(error.name).toBe('SigqlError');
  });

  it('sets message from a single error', () => {
    const error = new SigqlError([{ message: 'Not found' }]);
    expect(error.message).toBe('Not found');
  });

  it('joins multiple error messages with newlines', () => {
    const error = new SigqlError([{ message: 'First error' }, { message: 'Second error' }]);
    expect(error.message).toBe('First error\nSecond error');
  });

  it('exposes the original errors array', () => {
    const errors = [{ message: 'A' }, { message: 'B', path: ['user', 0] }];
    const error = new SigqlError(errors);
    expect(error.graphqlErrors).toBe(errors);
  });

  it('exposes partial data via the third constructor argument', () => {
    const error = new SigqlError([{ message: 'Not found' }], undefined, { partial: true });
    expect(error.data).toEqual({ partial: true });
  });
});

describe('orThrow', () => {
  it('resolves with data when the result is ok', async () => {
    const result: GraphQLResult<{ hello: string }> = { data: { hello: 'world' }, ok: true };
    await expect(orThrow(Promise.resolve(result))).resolves.toEqual({ hello: 'world' });
  });

  it('throws a SigqlError carrying errors and partial data when not ok', async () => {
    const result: GraphQLResult<{ hello: string }> = {
      data: null,
      graphqlErrors: [{ message: 'Not found' }],
      ok: false,
    };

    let error: unknown;
    await orThrow(Promise.resolve(result)).catch((e) => (error = e));

    expect(error).toBeInstanceOf(SigqlError);
    expect((error as SigqlError).graphqlErrors).toEqual([{ message: 'Not found' }]);
    expect((error as SigqlError).data).toBeUndefined();
  });

  it('throws a SigqlError with networkError set when the result has a network failure', async () => {
    const networkError = new Error('boom');
    const result: GraphQLResult<{ hello: string }> = { data: null, networkError, ok: false };

    let error: unknown;
    await orThrow(Promise.resolve(result)).catch((e) => (error = e));

    expect(error).toBeInstanceOf(SigqlError);
    expect((error as SigqlError).networkError).toBe(networkError);
  });
});
