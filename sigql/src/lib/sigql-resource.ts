import { DestroyRef, inject, resource, ResourceRef, WritableResource } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SigqlService } from './sigql.service';
import { QueryRegistry } from './query-registry.service';
import { DocumentInput, GraphQLResult, orThrow } from './types';
import { getOperationName } from './utils';

export interface QueryResourceOptions<V extends Record<string, unknown>, T = unknown, R = T> {
  query: DocumentInput;
  variables?: () => V;
  service?: SigqlService;
  /** When set, reloads the resource on this interval (in ms) in addition to registry-driven refetches. */
  pollInterval?: number;
  /** Transforms/extracts the raw response into the shape exposed as the resource's value. */
  select?: (data: T) => R;
}

export function queryResource<T, V extends Record<string, unknown> = never, R = T>(
  options: QueryResourceOptions<V, T, R>,
): ResourceRef<R | undefined> {
  const { query, service: serviceOption, variables, pollInterval, select } = options;
  const service = serviceOption ?? inject(SigqlService);

  const ref = resource<R, V | undefined>({
    params: variables,
    loader: async ({ params, abortSignal }) => {
      const data = await orThrow(service.query<T>({ query, variables: params, abortSignal }));
      return select ? select(data) : (data as unknown as R);
    },
  });

  if (pollInterval) {
    const intervalId = setInterval(() => ref.reload(), pollInterval);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalId));
  }

  return ref;
}

export function watchQueryResource<T, V extends Record<string, unknown> = never, R = T>(
  options: QueryResourceOptions<V, T, R>,
): ResourceRef<R | undefined> {
  const { query, service: serviceOption, variables, select } = options;
  const service = serviceOption ?? inject(SigqlService);
  const registry = inject(QueryRegistry);
  const destroyRef = inject(DestroyRef);
  const name = getOperationName(query);

  const ref = resource<R, { variables: V | undefined; generation: number }>({
    params: () => ({
      variables: variables?.(),
      generation: name ? registry.getGeneration(name)() : 0,
    }),
    loader: async ({ params, abortSignal }) => {
      const data = await orThrow(
        service.query<T>({ query, variables: params.variables, abortSignal }),
      );
      return select ? select(data) : (data as unknown as R);
    },
  });

  if (name) {
    // Registered purely so refetchAndWait() knows this name has resource-based consumers; the
    // actual reload is driven reactively by the `generation` counter above, not by this fetcher.
    const fetcher = () => Promise.resolve();
    registry.registerFetcher(name, fetcher);
    destroyRef.onDestroy(() => registry.unregisterFetcher(name, fetcher));
  }

  return ref;
}

export interface SubscriptionResourceOptions<
  V extends Record<string, unknown>,
  T = unknown,
  R = T,
> {
  subscription: DocumentInput;
  variables?: () => V;
  service?: SigqlService;
  /** Transforms/extracts each emission into the shape exposed as the resource's value. */
  select?: (data: T) => R;
}

export function subscriptionResource<T, V extends Record<string, unknown> = never, R = T>(
  options: SubscriptionResourceOptions<V, T, R>,
): ResourceRef<R | undefined> {
  const { subscription, service: serviceOption, variables, select } = options;
  const service = serviceOption ?? inject(SigqlService);

  return rxResource<R, V | undefined>({
    params: variables,
    stream: ({ params }) => {
      const stream$ = service.subscribe<T, V>({ subscription, variables: params });
      return (select ? stream$.pipe(map(select)) : stream$) as Observable<R>;
    },
  });
}

/**
 * Applies a mutation's result to a resource, calling `resource.set(...)` only when the result is
 * `ok`. Accepts a `GraphQLResult` directly or a promise of one (e.g. an in-flight `sigql.mutate()`
 * call), and always resolves with the original result so callers can still branch on failure.
 */
export async function applyMutationResult<T, M>(
  resource: WritableResource<T>,
  result: GraphQLResult<M> | Promise<GraphQLResult<M>>,
  map: (data: M, current: T) => T,
): Promise<GraphQLResult<M>> {
  const r = await result;
  if (r.ok) resource.set(map(r.data, resource.value()));
  return r;
}
