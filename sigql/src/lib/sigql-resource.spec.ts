import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
  WritableResource,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { applyMutationResult, queryResource, subscriptionResource } from './sigql-resource';
import { SigqlService } from './sigql.service';
import { GraphQLResult } from './types';

function fakeResource<T>(initial: T): WritableResource<T> {
  const value = signal(initial);
  return { value, set: (v: T) => value.set(v) } as unknown as WritableResource<T>;
}

function fakeService(subscribeImpl: (request: unknown) => Observable<unknown>): SigqlService {
  return { subscribe: vi.fn(subscribeImpl) } as unknown as SigqlService;
}

function fakeQueryService(queryImpl: (request: unknown) => Promise<unknown>): SigqlService {
  return { query: vi.fn(queryImpl) } as unknown as SigqlService;
}

// rxResource settles emissions via a microtask, not synchronously within TestBed.tick().
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('queryResource', () => {
  it('surfaces a failed GraphQLResult as resource().error(), not as .value()', async () => {
    const service = fakeQueryService(() =>
      Promise.resolve({ data: null, errors: [{ message: 'Nope' }], ok: false }),
    );

    const ref = TestBed.runInInjectionContext(() =>
      queryResource<{ hello: string }>({ query: '{ hello }', service }),
    );

    TestBed.tick();
    await flush();

    expect(ref.hasValue()).toBe(false);
    expect(ref.error()).toBeDefined();
  });

  it('reloads on the configured pollInterval', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const service = fakeQueryService(() => {
        calls++;
        return Promise.resolve({ data: { hello: 'world' }, ok: true });
      });

      const ref = TestBed.runInInjectionContext(() =>
        queryResource<{ hello: string }>({ query: '{ hello }', service, pollInterval: 1000 }),
      );

      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);
      expect(ref.value()).toEqual({ hello: 'world' });

      await vi.advanceTimersByTimeAsync(1000);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('transforms the response through select before exposing it as .value()', async () => {
    const service = fakeQueryService(() =>
      Promise.resolve({ data: { books: [{ id: '1' }, { id: '2' }] }, ok: true }),
    );

    const ref = TestBed.runInInjectionContext(() =>
      queryResource({
        query: '{ books { id } }',
        service,
        select: (data: { books: { id: string }[] }) => data.books,
      }),
    );

    TestBed.tick();
    await flush();

    expect(ref.value()).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('reloads when a plain (non-Signal) variables function reads a changed signal', async () => {
    const id = signal('1');
    const calls: unknown[] = [];
    const service = fakeQueryService((request) => {
      calls.push((request as { variables: unknown }).variables);
      return Promise.resolve({ data: { hello: 'world' }, ok: true });
    });

    const ref = TestBed.runInInjectionContext(() =>
      queryResource<{ hello: string }, { id: string }>({
        query: '{ hello }',
        service,
        variables: () => ({ id: id() }),
      }),
    );

    TestBed.tick();
    await flush();
    expect(calls).toEqual([{ id: '1' }]);

    id.set('2');
    TestBed.tick();
    await flush();

    expect(calls).toEqual([{ id: '1' }, { id: '2' }]);
    expect(ref.value()).toEqual({ hello: 'world' });
  });

  it('stops polling once the injector is destroyed', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const service = fakeQueryService(() => {
        calls++;
        return Promise.resolve({ data: { hello: 'world' }, ok: true });
      });
      const injector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], injector);

      runInInjectionContext(childInjector, () =>
        queryResource<{ hello: string }>({ query: '{ hello }', service, pollInterval: 1000 }),
      );

      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);

      childInjector.destroy();
      await vi.advanceTimersByTimeAsync(5000);

      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('subscriptionResource', () => {
  it('surfaces emissions from the transport as .value()', async () => {
    const subject = new Subject<{ hello: string }>();
    const service = fakeService(() => subject);

    const ref = TestBed.runInInjectionContext(() =>
      subscriptionResource<{ hello: string }>({ subscription: '{ hello }', service }),
    );

    TestBed.tick();
    subject.next({ hello: 'world' });
    await flush();

    expect(ref.value()).toEqual({ hello: 'world' });
  });

  it('transforms emissions through select before exposing them as .value()', async () => {
    const subject = new Subject<{ hello: string }>();
    const service = fakeService(() => subject);

    const ref = TestBed.runInInjectionContext(() =>
      subscriptionResource<{ hello: string }, never, string>({
        subscription: '{ hello }',
        service,
        select: (data) => data.hello,
      }),
    );

    TestBed.tick();
    subject.next({ hello: 'world' });
    await flush();

    expect(ref.value()).toBe('world');
  });

  it('tears down the previous subscription and starts a new one when variables change', () => {
    const teardownSpy = vi.fn();
    const subscribeSpy = vi.fn((_request: unknown) => new Observable(() => teardownSpy));
    const variables = signal({ id: '1' });
    const service = fakeService(subscribeSpy);

    TestBed.runInInjectionContext(() =>
      subscriptionResource({ subscription: '{ hello }', variables, service }),
    );

    TestBed.tick();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy.mock.calls[0][0]).toMatchObject({ variables: { id: '1' } });

    variables.set({ id: '2' });
    TestBed.tick();

    expect(teardownSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(subscribeSpy.mock.calls[1][0]).toMatchObject({ variables: { id: '2' } });
  });

  it('reacts the same way to a plain (non-Signal) variables function', () => {
    const teardownSpy = vi.fn();
    const subscribeSpy = vi.fn((_request: unknown) => new Observable(() => teardownSpy));
    const id = signal('1');
    const service = fakeService(subscribeSpy);

    TestBed.runInInjectionContext(() =>
      subscriptionResource({ subscription: '{ hello }', variables: () => ({ id: id() }), service }),
    );

    TestBed.tick();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy.mock.calls[0][0]).toMatchObject({ variables: { id: '1' } });

    id.set('2');
    TestBed.tick();

    expect(teardownSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(subscribeSpy.mock.calls[1][0]).toMatchObject({ variables: { id: '2' } });
  });
});

describe('applyMutationResult', () => {
  it('applies map(data, current) and sets the resource when the result is ok', async () => {
    const resource = fakeResource<string[]>(['a']);
    const result: GraphQLResult<{ added: string }> = { data: { added: 'b' }, ok: true };

    const returned = await applyMutationResult(resource, result, (data, current) => [
      ...current,
      data.added,
    ]);

    expect(resource.value()).toEqual(['a', 'b']);
    expect(returned).toBe(result);
  });

  it('accepts a promise of a result', async () => {
    const resource = fakeResource<string[]>(['a']);
    const result: GraphQLResult<{ added: string }> = { data: { added: 'b' }, ok: true };

    await applyMutationResult(resource, Promise.resolve(result), (data, current) => [
      ...current,
      data.added,
    ]);

    expect(resource.value()).toEqual(['a', 'b']);
  });

  it('leaves the resource untouched and resolves with the result when it is not ok', async () => {
    const resource = fakeResource<string[]>(['a']);
    const result: GraphQLResult<{ added: string }> = {
      data: null,
      graphqlErrors: [{ message: 'Nope' }],
      ok: false,
    };
    const map = vi.fn();

    const returned = await applyMutationResult(resource, result, map);

    expect(resource.value()).toEqual(['a']);
    expect(map).not.toHaveBeenCalled();
    expect(returned).toBe(result);
  });
});
