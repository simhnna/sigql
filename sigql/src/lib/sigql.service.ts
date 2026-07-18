import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  DocumentInput,
  GraphQLError,
  GraphQLRequest,
  GraphQLMutationRequest,
  GraphQLSubscriptionRequest,
  GraphQLResponse,
  GraphQLResult,
  SigqlError,
} from './types';
import { print } from 'graphql';
import { DocumentNode } from './gql';
import { SIGQL_CONFIG, SIGQL_ENDPOINT } from './provider';
import { QueryRegistry } from './query-registry.service';
import { SIGQL_SUBSCRIPTION_TRANSPORT } from './subscription-transport';
import { getOperationName } from './utils';

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

@Injectable({ providedIn: 'root' })
export class SigqlService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = inject(SIGQL_ENDPOINT);
  private readonly config = inject(SIGQL_CONFIG, { optional: true });
  private readonly registry = inject(QueryRegistry);
  private readonly transport = inject(SIGQL_SUBSCRIPTION_TRANSPORT, { optional: true });
  private readonly printCache = new WeakMap<DocumentNode, string>();

  private urlFor(operationName?: string): string {
    const param = this.config?.operationNameParam;
    if (param && operationName) {
      const separator = this.endpoint.includes('?') ? '&' : '?';
      return `${this.endpoint}${separator}${encodeURIComponent(param)}=${encodeURIComponent(operationName)}`;
    }
    return this.endpoint;
  }

  private stringify(query: DocumentInput): string {
    if (typeof query === 'string') return query;
    let printed = this.printCache.get(query);
    if (printed === undefined) {
      printed = print(query);
      this.printCache.set(query, printed);
    }
    return printed;
  }

  private post$<T, V extends Record<string, unknown>>(
    request: GraphQLRequest<T, V>,
  ): Observable<GraphQLResult<T>> {
    const query = this.stringify(request.query);
    const body = { query, variables: request.variables, operationName: request.operationName };
    return this.http.post<GraphQLResponse<T>>(this.urlFor(request.operationName), body).pipe(
      map((response): GraphQLResult<T> => {
        const errors = response.errors?.length ? response.errors : undefined;
        if (errors) {
          return { data: (response.data ?? null) as T | null, graphqlErrors: errors, ok: false };
        }
        return { data: response.data as T, ok: true };
      }),
      catchError((err): Observable<GraphQLResult<T>> => {
        // Servers commonly return GraphQL errors with a non-2xx status (e.g. 400 for
        // validation errors) — surface those instead of burying them in the HTTP error.
        if (err instanceof HttpErrorResponse) {
          const errorBody = err.error as Partial<GraphQLResponse<T>> | null | undefined;
          const graphqlErrors =
            errorBody && typeof errorBody === 'object' && Array.isArray(errorBody.errors)
              ? (errorBody.errors.filter(
                  (e) => e && typeof e.message === 'string',
                ) as GraphQLError[])
              : [];
          return of({
            data: null,
            graphqlErrors: graphqlErrors.length ? graphqlErrors : undefined,
            networkError: new Error(err.message, { cause: err }),
            ok: false,
          });
        }
        return of({
          data: null,
          networkError: err instanceof Error ? err : new Error(String(err)),
          ok: false,
        });
      }),
    );
  }

  /**
   * When `request.abortSignal` is given, aborts the underlying HTTP request if it fires before
   * the response arrives (rejecting the promise with the signal's reason). Used by
   * resource()-based queries so stale in-flight requests are cancelled on rapid variable changes.
   */
  execute<T = unknown, V extends Record<string, unknown> = Record<string, unknown>>(
    request: GraphQLRequest<T, V>,
  ): Promise<GraphQLResult<T>> {
    const signal = request.abortSignal;
    if (signal?.aborted) {
      return Promise.reject(abortError(signal));
    }
    return new Promise<GraphQLResult<T>>((resolve, reject) => {
      const onAbort = () => {
        sub.unsubscribe();
        reject(abortError(signal!));
      };
      const settle = <A extends unknown[]>(fn: (...args: A) => void) => {
        return (...args: A) => {
          signal?.removeEventListener('abort', onAbort);
          fn(...args);
        };
      };
      const sub = this.post$<T, V>(request).subscribe({
        next: settle(resolve),
        error: settle(reject),
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  query<T = unknown, V extends Record<string, unknown> = Record<string, unknown>>(
    request: GraphQLRequest<T, V>,
  ): Promise<GraphQLResult<T>> {
    return this.execute<T, V>(request);
  }

  /**
   * A hot observable of `GraphQLResult`s that re-fetches whenever the query's operation name is
   * triggered (e.g. by a mutation's `refetchQueries`) or on `pollInterval`. Failed fetches are
   * emitted as `ok: false` results — the stream stays alive, so polling survives network blips.
   */
  watch<T = unknown, V extends Record<string, unknown> = Record<string, unknown>>(
    request: GraphQLRequest<T, V> & { pollInterval?: number },
  ): Observable<GraphQLResult<T>> {
    const name = request.operationName ?? getOperationName(request.query);

    return new Observable<GraphQLResult<T>>((subscriber) => {
      let latest: Promise<GraphQLResult<T>> | undefined;

      const run = () => {
        const p = this.query<T, V>(request);
        latest = p;
        p.then(
          (result) => {
            if (latest === p) subscriber.next(result);
          },
          () => {
            // Only rejects when the caller aborted via request.abortSignal — nothing to emit.
          },
        );
      };

      let unregister: (() => void) | undefined;
      let triggerSub: { unsubscribe(): void } | undefined;
      if (name) {
        const fetcher = () => latest!;
        this.registry.registerFetcher(name, fetcher);
        unregister = () => this.registry.unregisterFetcher(name, fetcher);
        triggerSub = this.registry.getTrigger(name).subscribe(run);
      }

      run();

      const intervalId = request.pollInterval ? setInterval(run, request.pollInterval) : undefined;

      return () => {
        if (intervalId !== undefined) clearInterval(intervalId);
        triggerSub?.unsubscribe();
        unregister?.();
      };
    });
  }

  subscribe<T = unknown, V extends Record<string, unknown> = Record<string, unknown>>({
    subscription,
    variables,
    operationName,
  }: GraphQLSubscriptionRequest<T, V>): Observable<T> {
    if (!this.transport) {
      return throwError(
        () =>
          new SigqlError(
            [],
            new Error(
              'No subscription transport configured. Provide one via provideGraphqlWs() from "sigql/graphql-ws", or your own SubscriptionTransport bound to SIGQL_SUBSCRIPTION_TRANSPORT.',
            ),
          ),
      );
    }
    const query = this.stringify(subscription);
    const name = operationName ?? getOperationName(subscription);
    return this.transport
      .subscribe<T>({ query, variables, operationName: name })
      .pipe(
        catchError((err) =>
          throwError(() =>
            err instanceof SigqlError
              ? err
              : new SigqlError([], err instanceof Error ? err : new Error(String(err))),
          ),
        ),
      );
  }

  async mutate<T = unknown, V extends Record<string, unknown> = Record<string, unknown>>({
    mutation,
    variables,
    operationName,
    refetchQueries,
    awaitRefetchQueries,
  }: GraphQLMutationRequest<T, V>): Promise<GraphQLResult<T>> {
    const result = await this.execute<T, V>({ query: mutation, variables, operationName });
    if (result.ok && refetchQueries?.length) {
      if (awaitRefetchQueries) {
        // A failed refetch must not reject a successful mutation: the mutation result is the
        // contract here, and the refetch failure is already delivered to the watching consumers.
        try {
          await this.registry.refetchAndWait(refetchQueries);
        } catch {
          // handled by the consumers of the refetched queries
        }
      } else {
        this.registry.refetch(refetchQueries);
      }
    }
    return result;
  }

  async refetch(names: string[]): Promise<void> {
    await this.registry.refetchAndWait(names);
  }
}
