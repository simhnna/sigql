import { describe, it, expect, vi, afterEach } from 'vitest';
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
import { SigqlError } from './types';
import { gql } from './gql';

const ENDPOINT = 'http://localhost:4000/graphql';

// Resolves once all currently pending microtasks (Promise .then chains) have run, so
// side effects driven by watch()'s internal `p.then(...)` have had a chance to fire.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(config?: { operationNameParam?: string }, transport?: SubscriptionTransport) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: SIGQL_ENDPOINT, useValue: ENDPOINT },
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

    it('cancels the underlying HTTP request when abortSignal fires', async () => {
      const { service, http } = setup();
      const controller = new AbortController();
      service.execute({ query: '{ hello }', abortSignal: controller.signal });

      const req = http.expectOne(ENDPOINT);
      controller.abort();

      expect(req.cancelled).toBe(true);
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
      expect(result).toEqual({ user: { id: '1' } });

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
      expect(results[1]).toEqual({ user: { id: '2' } });

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
      expect(results[1]).toEqual({ user: { id: '2' } });

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
        expect(results[1]).toEqual({ user: { id: '2' } });

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
    it('sends the mutation and returns data', async () => {
      const { service, http } = setup();
      const promise = service.mutate<{ createUser: { id: string } }>({
        mutation: 'mutation { createUser { id } }',
      });

      http.expectOne(ENDPOINT).flush({ data: { createUser: { id: '42' } } });

      await expect(promise).resolves.toEqual({ data: { createUser: { id: '42' } }, ok: true });
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
      `;

      const results: unknown[] = [];
      const sub = service
        .subscribe({ subscription: doc, variables: { id: '1' } })
        .subscribe((v) => results.push(v));

      expect(calls).toHaveLength(1);
      expect(calls[0].query).toContain('OnHello');
      expect(calls[0].variables).toEqual({ id: '1' });
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
