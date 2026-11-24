import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, of, throwError } from 'rxjs';
import { SigqlService } from './sigql.service';
import { SIGQL_ENDPOINT, SIGQL_CONFIG } from './provider';
import { QueryRegistry } from './query-registry.service';
import {
  SIGQL_SUBSCRIPTION_TRANSPORT,
  SubscriptionRequest,
  SubscriptionTransport,
} from './subscription-transport';
import { GraphQLResult, SigqlError, TypedDocumentNode } from './types';
import { gql } from './gql';
import { Mutation, Query } from './sigql-classes';

const ENDPOINT = 'http://localhost:4000/graphql';

// Resolves once all currently pending microtasks (Promise .then chains) have run, so
// side effects driven by watch()'s internal `p.then(...)` have had a chance to fire.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(
  config?: { operationNameParam?: string },
  transport?: SubscriptionTransport,
  endpoint = ENDPOINT,
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: SIGQL_ENDPOINT, useValue: endpoint },
      ...(config ? [{ provide: SIGQL_CONFIG, useValue: config }] : []),
      ...(transport ? [{ provide: SIGQL_SUBSCRIPTION_TRANSPORT, useValue: transport }] : []),
    ],
  });
  return {
    service: TestBed.inject(SigqlService),
    http: TestBed.inject(HttpTestingController),
    registry: TestBed.inject(QueryRegistry),
  };
}

describe('SigqlService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('execute', () => {
    it('makes a POST request and returns response data', async () => {
      const { service, http } = setup();
      const promise = service.execute<{ hello: string }>({ query: '{ hello }' });

      const req = http.expectOne(ENDPOINT);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ query: '{ hello }' });
      req.flush({ data: { hello: 'world' } });

      await expect(promise).resolves.toEqual({ data: { hello: 'world' }, ok: true });
    });

    it('accepts application/graphql-response+json with a JSON fallback', async () => {
      const { service, http } = setup();
      const promise = service.execute({ query: '{ hello }' });

      const req = http.expectOne(ENDPOINT);
      expect(req.request.headers.get('Accept')).toBe(
        'application/graphql-response+json, application/json;q=0.9',
      );
      req.flush({ data: {} });

      await promise;
    });

    it('resolves with ok: false and errors when the response contains GraphQL errors', async () => {
      expect.assertions(3);
      const { service, http } = setup();
      const promise = service.execute({ query: '{ hello }' });

      http.expectOne(ENDPOINT).flush({ errors: [{ message: 'Not found' }] });

      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      if (!result.ok) {
        expect(result.graphqlErrors).toEqual([{ message: 'Not found' }]);
      }
    });

    it('resolves with ok: false and networkError set on an HTTP transport failure', async () => {
      expect.assertions(3);
      const { service, http } = setup();
      const promise = service.execute({ query: '{ hello }' });

      http
        .expectOne(ENDPOINT)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      if (!result.ok) {
        expect(result.networkError).toBeDefined();
      }
    });

    it('preserves HTTP error details in networkError on a non-2xx response', async () => {
      expect.assertions(3);
      const { service, http } = setup();
      const promise = service.execute({ query: '{ hello' });

      // graphql-yoga & friends return validation/parse errors with a 400 status and a
      // regular GraphQL errors body — this must not degrade into an opaque networkError.
      http
        .expectOne(ENDPOINT)
        .flush(
          { errors: [{ message: 'Syntax Error: Expected Name, found <EOF>.' }] },
          { status: 400, statusText: 'Bad Request' },
        );

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.networkError?.message).not.toBe('[object Object]');
        expect(result.networkError?.message).toContain('400');
      }
    });

    it('extracts GraphQL errors from a non-2xx response body', async () => {
      expect.assertions(2);
      const { service, http } = setup();
      const promise = service.execute({ query: '{ hello' });

      http
        .expectOne(ENDPOINT)
        .flush(
          { errors: [{ message: 'Syntax Error: Expected Name, found <EOF>.' }] },
          { status: 400, statusText: 'Bad Request' },
        );

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.graphqlErrors).toEqual([
          { message: 'Syntax Error: Expected Name, found <EOF>.' },
        ]);
      }
    });

    it('converts a DocumentNode to a string before sending', async () => {
      const { service, http } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      const promise = service.execute({ query: doc });

      const req = http.expectOne(ENDPOINT);
      expect(typeof req.request.body.query).toBe('string');
      expect(req.request.body.query).toContain('GetUser');
      req.flush({ data: {} });

      await promise;
    });

    it('appends operationNameParam to URL when config is set', async () => {
      const { service, http } = setup({ operationNameParam: 'op' });
      const promise = service.execute({ query: '{ hello }', operationName: 'MyQuery' });

      http.expectOne(`${ENDPOINT}?op=MyQuery`).flush({ data: {} });
      await promise;
    });

    it('does not append param when operationName is absent', async () => {
      const { service, http } = setup({ operationNameParam: 'op' });
      const promise = service.execute({ query: '{ hello }' });

      http.expectOne(ENDPOINT).flush({ data: {} });
      await promise;
    });

    it('URL-encodes the param name and operation name', async () => {
      const { service, http } = setup({ operationNameParam: 'my param' });
      const promise = service.execute({ query: '{ hello }', operationName: 'My Query' });

      http.expectOne(`${ENDPOINT}?my%20param=My%20Query`).flush({ data: {} });
      await promise;
    });

    it('appends with & when the endpoint already has a query string', async () => {
      const endpoint = `${ENDPOINT}?tenant=acme`;
      const { service, http } = setup({ operationNameParam: 'op' }, undefined, endpoint);
      const promise = service.execute({ query: '{ hello }', operationName: 'MyQuery' });

      http.expectOne(`${endpoint}&op=MyQuery`).flush({ data: {} });
      await promise;
    });

    it('cancels the underlying HTTP request and rejects when abortSignal fires', async () => {
      const { service, http } = setup();
      const controller = new AbortController();
      const promise = service.execute({ query: '{ hello }', abortSignal: controller.signal });

      const req = http.expectOne(ENDPOINT);
      controller.abort();

      expect(req.cancelled).toBe(true);
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects without sending a request when the signal is already aborted', async () => {
      const { service, http } = setup();
      const controller = new AbortController();
      controller.abort();

      const promise = service.execute({ query: '{ hello }', abortSignal: controller.signal });

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      http.expectNone(ENDPOINT);
    });

    it('does not abort once the response has already resolved', async () => {
      const { service, http } = setup();
      const controller = new AbortController();
      const promise = service.execute({ query: '{ hello }', abortSignal: controller.signal });

      const req = http.expectOne(ENDPOINT);
      req.flush({ data: { hello: 'world' } });
      await promise;

      expect(() => controller.abort()).not.toThrow();
    });
  });

  describe('query', () => {
    it('delegates to execute and returns data', async () => {
      const { service, http } = setup();
      const promise = service.query<{ posts: string[] }>({ query: '{ posts }' });

      http.expectOne(ENDPOINT).flush({ data: { posts: ['a', 'b'] } });

      await expect(promise).resolves.toEqual({ data: { posts: ['a', 'b'] }, ok: true });
    });

    it('sends the inferred operation name in the body and configured URL parameter', async () => {
      const { service, http } = setup({ operationNameParam: 'op' });
      const promise = service.query({
        query: gql`
          query Posts {
            posts
          }
        `,
      });

      const req = http.expectOne(`${ENDPOINT}?op=Posts`);
      expect(req.request.body.operationName).toBe('Posts');
      req.flush({ data: { posts: [] } });
      await promise;
    });

    it('only sends an operation name for a multi-operation document when explicitly supplied', async () => {
      const { service, http } = setup({ operationNameParam: 'op' });
      const query = gql`
        query First {
          hello
        }
        query Second {
          hello
        }
      `;

      const unspecified = service.query({ query });
      const req = http.expectOne(ENDPOINT);
      expect(req.request.body.operationName).toBeUndefined();
      req.flush({ errors: [{ message: 'Must provide operation name' }] });
      await expect(unspecified).resolves.toMatchObject({ ok: false });

      const specified = service.query({ query, operationName: 'Second' });
      const namedReq = http.expectOne(`${ENDPOINT}?op=Second`);
      expect(namedReq.request.body.operationName).toBe('Second');
      namedReq.flush({ data: { hello: 'world' } });
      await expect(specified).resolves.toMatchObject({ ok: true });
    });

    it('cancels the HTTP request from a Query subclass', async () => {
      class Posts extends Query<{ posts: string[] }> {
        override readonly document = '{ posts }';
      }

      const { http } = setup();
      const query = TestBed.runInInjectionContext(() => new Posts());
      const controller = new AbortController();
      const promise = query.fetch(undefined, { abortSignal: controller.signal });

      const request = http.expectOne(ENDPOINT);
      controller.abort();

      expect(request.cancelled).toBe(true);
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('watch', () => {
    it('fetches data on subscribe', async () => {
      const { service, http } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      let result: unknown;
      const sub = service
        .watch<{ user: { id: string } }>({ query: doc })
        .subscribe((v) => (result = v));

      http.expectOne(ENDPOINT).flush({ data: { user: { id: '1' } } });
      await tick();
      expect(result).toEqual({ data: { user: { id: '1' } }, ok: true });

      sub.unsubscribe();
    });

    it('emits a failed fetch as an ok: false result and keeps the stream alive', async () => {
      const { service, http, registry } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      const results: GraphQLResult<{ user: { id: string } }>[] = [];
      const sub = service
        .watch<{ user: { id: string } }>({ query: doc })
        .subscribe((v) => results.push(v));

      http
        .expectOne(ENDPOINT)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await tick();
      expect(results).toHaveLength(1);
      expect(results[0].ok).toBe(false);

      // The stream survives the failure: a later trigger re-fetches and emits fresh data.
      registry.refetch(['GetUser']);
      http.expectOne(ENDPOINT).flush({ data: { user: { id: '1' } } });
      await tick();

      expect(results).toHaveLength(2);
      expect(results[1]).toEqual({ data: { user: { id: '1' } }, ok: true });

      sub.unsubscribe();
    });

    it('re-fetches when the registry trigger fires', async () => {
      const { service, http, registry } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      const results: unknown[] = [];
      const sub = service
        .watch<{ user: { id: string } }>({ query: doc })
        .subscribe((v) => results.push(v));

      http.expectOne(ENDPOINT).flush({ data: { user: { id: '1' } } });
      await tick();
      expect(results).toHaveLength(1);

      registry.refetch(['GetUser']);
      http.expectOne(ENDPOINT).flush({ data: { user: { id: '2' } } });
      await tick();
      expect(results).toHaveLength(2);
      expect(results[1]).toEqual({ data: { user: { id: '2' } }, ok: true });

      sub.unsubscribe();
    });

    it('unregisters fetcher on unsubscribe', async () => {
      const { service, http, registry } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      const sub = service.watch({ query: doc }).subscribe();
      http.expectOne(ENDPOINT).flush({ data: {} });
      await tick();

      sub.unsubscribe();

      // After unsubscribe, refetchAndWait should have no fetchers for this query
      await expect(registry.refetchAndWait(['GetUser'])).resolves.toBeUndefined();
    });

    it('does not issue a duplicate request when awaiting a refetch of an active watcher', async () => {
      const { service, http, registry } = setup();
      const doc = gql`
        query GetUser {
          user {
            id
          }
        }
      `;
      const results: unknown[] = [];
      const sub = service
        .watch<{ user: { id: string } }>({ query: doc })
        .subscribe((v) => results.push(v));

      http.expectOne(ENDPOINT).flush({ data: { user: { id: '1' } } });
      await tick();
      expect(results).toHaveLength(1);

      const mutatePromise = service.mutate({
        mutation: 'mutation { doSomething }',
        refetchQueries: ['GetUser'],
        awaitRefetchQueries: true,
      });

      // Only the mutation itself should be outstanding at this point.
      const mutationReq = http.expectOne(ENDPOINT);
      mutationReq.flush({ data: { doSomething: true } });

      await tick();

      // Exactly one refetch request should now be outstanding — if refetchAndWait triggered
      // a duplicate fetch, http.expectOne would throw here for matching more than one request.
      const refetchReq = http.expectOne(ENDPOINT);
      refetchReq.flush({ data: { user: { id: '2' } } });

      await mutatePromise;
      await tick();

      expect(results).toHaveLength(2);
      expect(results[1]).toEqual({ data: { user: { id: '2' } }, ok: true });

      sub.unsubscribe();
    });

    it('re-fetches on the configured pollInterval', async () => {
      vi.useFakeTimers();
      try {
        const { service, http } = setup();
        const doc = gql`
          query GetUser {
            user {
              id
            }
          }
        `;
        const results: unknown[] = [];
        const sub = service
          .watch<{ user: { id: string } }>({ query: doc, pollInterval: 1000 })
          .subscribe((v) => results.push(v));

        http.expectOne(ENDPOINT).flush({ data: { user: { id: '1' } } });
        await vi.advanceTimersByTimeAsync(0);
        expect(results).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1000);
        http.expectOne(ENDPOINT).flush({ data: { user: { id: '2' } } });
        await vi.advanceTimersByTimeAsync(0);
        expect(results).toHaveLength(2);
        expect(results[1]).toEqual({ data: { user: { id: '2' } }, ok: true });

        sub.unsubscribe();
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops polling after unsubscribe', async () => {
      vi.useFakeTimers();
      try {
        const { service, http } = setup();
        const doc = gql`
          query GetUser {
            user {
              id
            }
          }
        `;
        const sub = service.watch({ query: doc, pollInterval: 1000 }).subscribe();

        http.expectOne(ENDPOINT).flush({ data: {} });
        await vi.advanceTimersByTimeAsync(0);

        sub.unsubscribe();
        await vi.advanceTimersByTimeAsync(5000);

        http.verify();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('mutate', () => {
    it('sends typed variables and an inferred operation name from a Mutation subclass', async () => {
      type Result = { renameUser: { id: string } };
      interface Vars {
        readonly id: string;
        readonly name: string;
      }

      class RenameUser extends Mutation<Result, Vars> {
        override readonly document = gql`
          mutation RenameUser($id: ID!, $name: String!) {
            renameUser(id: $id, name: $name) {
              id
            }
          }
        ` as TypedDocumentNode<Result, Vars>;
      }

      const { http } = setup({ operationNameParam: 'op' });
      const mutation = TestBed.runInInjectionContext(() => new RenameUser());
      const variables: Vars = { id: '42', name: 'Ada' };
      expectTypeOf<Parameters<typeof mutation.mutate>[0]>().toEqualTypeOf<Vars | undefined>();
      const result = mutation.mutate(variables);
      expectTypeOf(result).toEqualTypeOf<Promise<GraphQLResult<Result>>>();

      const request = http.expectOne(`${ENDPOINT}?op=RenameUser`);
      expect(request.request.body.variables).toBe(variables);
      expect(request.request.body.operationName).toBe('RenameUser');
      const data = { renameUser: { id: '42' } };
      request.flush({ data });
      await expect(result).resolves.toEqual({ data, ok: true });
    });

    it('uses the explicit operation name to select a mutation from a multi-operation document', async () => {
      const { service, http } = setup({ operationNameParam: 'op' });
      const promise = service.mutate({
        mutation: gql`
          mutation First {
            doFirst
          }
          mutation Second {
            doSecond
          }
        `,
        operationName: 'Second',
      });

      const request = http.expectOne(`${ENDPOINT}?op=Second`);
      expect(request.request.body.operationName).toBe('Second');
      request.flush({ data: { doSecond: true } });
      await expect(promise).resolves.toEqual({ data: { doSecond: true }, ok: true });
    });

    it('sends the mutation and returns data', async () => {
      const { service, http } = setup();
      const promise = service.mutate<{ createUser: { id: string } }>({
        mutation: 'mutation { createUser { id } }',
      });

      http.expectOne(ENDPOINT).flush({ data: { createUser: { id: '42' } } });

      await expect(promise).resolves.toEqual({ data: { createUser: { id: '42' } }, ok: true });
    });

    it('cancels the HTTP request from a Mutation subclass without triggering refetches', async () => {
      class DoSomething extends Mutation<{ doSomething: boolean }> {
        override readonly document = 'mutation { doSomething }';
      }

      const { http, registry } = setup();
      const refetch = vi.spyOn(registry, 'refetch');
      const mutation = TestBed.runInInjectionContext(() => new DoSomething());
      const controller = new AbortController();
      const promise = mutation.mutate(undefined, {
        abortSignal: controller.signal,
        refetchQueries: ['MyQuery'],
      });

      const request = http.expectOne(ENDPOINT);
      controller.abort();

      expect(request.cancelled).toBe(true);
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      expect(refetch).not.toHaveBeenCalled();
    });

    it('does not send a mutation when the signal is already aborted', async () => {
      const { service, http } = setup();
      const reason = new Error('Cancelled before sending');
      const promise = service.mutate({
        mutation: 'mutation { doSomething }',
        abortSignal: AbortSignal.abort(reason),
      });

      await expect(promise).rejects.toBe(reason);
      http.expectNone(ENDPOINT);
    });

    it('triggers refetchQueries without waiting by default', async () => {
      const { service, http, registry } = setup();
      const refetchSpy = vi.spyOn(registry, 'refetch');

      const promise = service.mutate({
        mutation: 'mutation { doSomething }',
        refetchQueries: ['MyQuery'],
      });

      http.expectOne(ENDPOINT).flush({ data: { doSomething: true } });
      await promise;

      expect(refetchSpy).toHaveBeenCalledWith(['MyQuery']);
    });

    it('awaits refetchQueries when awaitRefetchQueries is true', async () => {
      const { service, http, registry } = setup();
      let fetcherCalled = false;
      registry.registerFetcher('MyQuery', () => {
        fetcherCalled = true;
        return Promise.resolve('result');
      });

      const promise = service.mutate({
        mutation: 'mutation { doSomething }',
        refetchQueries: ['MyQuery'],
        awaitRefetchQueries: true,
      });

      http.expectOne(ENDPOINT).flush({ data: { doSomething: true } });

      await expect(promise).resolves.toEqual({ data: { doSomething: true }, ok: true });
      expect(fetcherCalled).toBe(true);
    });

    it('resolves with the mutation result even when an awaited refetch fails', async () => {
      const { service, http, registry } = setup();
      registry.registerFetcher('MyQuery', () => Promise.reject(new Error('refetch failed')));

      const promise = service.mutate({
        mutation: 'mutation { doSomething }',
        refetchQueries: ['MyQuery'],
        awaitRefetchQueries: true,
      });

      http.expectOne(ENDPOINT).flush({ data: { doSomething: true } });

      await expect(promise).resolves.toEqual({ data: { doSomething: true }, ok: true });
    });

    it('does not trigger refetchQueries when the mutation itself fails', async () => {
      const { service, http, registry } = setup();
      const refetchSpy = vi.spyOn(registry, 'refetch');
      const refetchAndWaitSpy = vi.spyOn(registry, 'refetchAndWait');

      const promise = service.mutate({
        mutation: 'mutation { doSomething }',
        refetchQueries: ['MyQuery'],
        awaitRefetchQueries: true,
      });

      http.expectOne(ENDPOINT).flush({ errors: [{ message: 'Nope' }] });

      const result = await promise;

      expect(result.ok).toBe(false);
      expect(refetchSpy).not.toHaveBeenCalled();
      expect(refetchAndWaitSpy).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('errors with a SigqlError when no transport is configured', async () => {
      const { service } = setup();

      let error: unknown;
      await new Promise<void>((resolve) => {
        service.subscribe({ subscription: '{ hello }' }).subscribe({
          error: (e) => {
            error = e;
            resolve();
          },
        });
      });

      expect(error).toBeInstanceOf(SigqlError);
      expect((error as SigqlError).message).toContain('provideGraphqlWs');
    });

    it('delegates to the configured transport with the stringified query/variables/operationName', async () => {
      interface Vars {
        readonly id: string;
      }
      const calls: SubscriptionRequest[] = [];
      const transport: SubscriptionTransport = {
        subscribe<T>(request: SubscriptionRequest): Observable<T> {
          calls.push(request);
          return of({ hello: 'world' }) as unknown as Observable<T>;
        },
      };
      const { service } = setup(undefined, transport);
      const doc = gql`
        subscription OnHello {
          hello
        }
      ` as TypedDocumentNode<{ hello: string }, Vars>;

      const variables: Vars = { id: '1' };
      const results: unknown[] = [];
      const sub = service
        .subscribe({ subscription: doc, variables })
        .subscribe((v) => results.push(v));

      expect(calls).toHaveLength(1);
      expect(calls[0].query).toContain('OnHello');
      expect(calls[0].variables).toBe(variables);
      expect(calls[0].operationName).toBe('OnHello');
      expect(results).toEqual([{ hello: 'world' }]);

      sub.unsubscribe();
    });

    it('wraps a plain transport error in a SigqlError', async () => {
      const transport: SubscriptionTransport = {
        subscribe: () => throwError(() => new Error('boom')),
      };
      const { service } = setup(undefined, transport);

      let error: unknown;
      await new Promise<void>((resolve) => {
        service.subscribe({ subscription: '{ hello }' }).subscribe({
          error: (e) => {
            error = e;
            resolve();
          },
        });
      });

      expect(error).toBeInstanceOf(SigqlError);
      expect((error as SigqlError).networkError).toBeInstanceOf(Error);
    });

    it('passes an already-SigqlError through unchanged', async () => {
      const original = new SigqlError([{ message: 'nope' }]);
      const transport: SubscriptionTransport = { subscribe: () => throwError(() => original) };
      const { service } = setup(undefined, transport);

      let error: unknown;
      await new Promise<void>((resolve) => {
        service.subscribe({ subscription: '{ hello }' }).subscribe({
          error: (e) => {
            error = e;
            resolve();
          },
        });
      });

      expect(error).toBe(original);
    });
  });
});
