import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  DocumentInput,
  GraphQLRequest,
  GraphQLMutationRequest,
  GraphQLSubscriptionRequest,
  GraphQLResponse,
  GraphQLResult,
  SigqlError,
  orThrow,
} from './types';
import { print } from 'graphql';
import { DocumentNode } from './gql';
import { SIGQL_CONFIG, SIGQL_ENDPOINT } from './provider';
import { QueryRegistry } from './query-registry.service';
import { SIGQL_SUBSCRIPTION_TRANSPORT } from './subscription-transport';
import { getOperationName } from './utils';

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
      return `${this.endpoint}?${encodeURIComponent(param)}=${encodeURIComponent(operationName)}`;
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

  private post$<T>(request: GraphQLRequest): Observable<GraphQLResult<T>> {
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
      catchError(
        (err): Observable<GraphQLResult<T>> =>
          of({
            data: null,
            networkError: err instanceof Error ? err : new Error(String(err)),
            ok: false,
          }),
      ),
    );
  }

  /** When `request.abortSignal` is given, aborts the underlying HTTP request if it fires before the response arrives. Used by resource()-based queries so stale in-flight requests are cancelled on rapid variable changes. */
  execute<T>(request: GraphQLRequest): Promise<GraphQLResult<T>> {
    return new Promise<GraphQLResult<T>>((resolve, reject) => {
      const sub = this.post$<T>(request).subscribe({ next: resolve, error: reject });
      request.abortSignal?.addEventListener('abort', () => sub.unsubscribe(), { once: true });
    });
  }

  query<T, V extends Record<string, unknown> = Record<string, unknown>>(
    request: GraphQLRequest<V>,
  ): Promise<GraphQLResult<T>> {
    return this.execute<T>(request);
  }

  watch<T, V extends Record<string, unknown> = Record<string, unknown>>(
    request: GraphQLRequest<V> & { pollInterval?: number },
  ): Observable<T> {
    const name = request.operationName ?? getOperationName(request.query);

    return new Observable<T>((subscriber) => {
      let latest: Promise<T> | undefined;

      const run = () => {
        const p = orThrow(this.query<T, V>(request));
        latest = p;
        p.then(
          (value) => {
            if (latest === p) subscriber.next(value);
          },
          (err) => {
            if (latest === p) subscriber.error(err);
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

  subscribe<T, V extends Record<string, unknown> = Record<string, unknown>>({
    subscription,
    variables,
    operationName,
  }: GraphQLSubscriptionRequest<V>): Observable<T> {
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

  async mutate<T, V extends Record<string, unknown> = Record<string, unknown>>({
    mutation,
    variables,
    operationName,
    refetchQueries,
    awaitRefetchQueries,
  }: GraphQLMutationRequest<V>): Promise<GraphQLResult<T>> {
    const result = await this.execute<T>({ query: mutation, variables, operationName });
    if (result.ok && refetchQueries?.length) {
      if (awaitRefetchQueries) {
        await this.registry.refetchAndWait(refetchQueries);
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
