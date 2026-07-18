import {
  DestroyRef,
  inject,
  Injector,
  resource,
  ResourceRef,
  WritableResource,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SigqlService } from './sigql.service';
import { QueryRegistry } from './query-registry.service';
import { DocumentInput, GraphQLResult, orThrow } from './types';
import { getOperationName } from './utils';

export interface QueryResourceOptions<
  T = unknown,
  V extends Record<string, unknown> = never,
  R = T,
> {
  query: DocumentInput<T, V>;
  /** Returning `undefined` suspends the resource (no request) until variables become available. */
  variables?: () => V | undefined;
  service?: SigqlService;
  /** Allows creation outside an injection context (e.g. in event handlers). */
  injector?: Injector;
  /**
   * Overrides the operation name extracted from the document — required for string documents or
   * multi-operation documents that should participate in refetching.
   */
  operationName?: string;
  /** When set, reloads the resource on this interval (in ms) in addition to registry-driven refetches. */
  pollInterval?: number;
  /** Transforms/extracts the raw response into the shape exposed as the resource's value. */
  select?: (data: T) => R;
}

function resolveService(options: { service?: SigqlService; injector?: Injector }): SigqlService {
  return (
    options.service ??
    (options.injector ? options.injector.get(SigqlService) : inject(SigqlService))
  );
}

function resolveDestroyRef(injector: Injector | undefined): DestroyRef {
  return injector ? injector.get(DestroyRef) : inject(DestroyRef);
}

export function queryResource<T = unknown, V extends Record<string, unknown> = never, R = T>(
  options: QueryResourceOptions<T, V, R>,
): ResourceRef<R | undefined> {
  const { query, variables, pollInterval, select, injector } = options;
  const service = resolveService(options);
  const operationName = options.operationName ?? getOperationName(query);

  const ref = resource<R, V | undefined>({
    params: variables,
    injector,
    loader: async ({ params, abortSignal }) => {
      const data = await orThrow(
        service.query<T, V>({ query, variables: params, operationName, abortSignal }),
      );
      return select ? select(data) : (data as unknown as R);
    },
  });

  if (pollInterval) {
    const intervalId = setInterval(() => ref.reload(), pollInterval);
    resolveDestroyRef(injector).onDestroy(() => clearInterval(intervalId));
  }

  return ref;
}

export function watchQueryResource<T = unknown, V extends Record<string, unknown> = never, R = T>(
  options: QueryResourceOptions<T, V, R>,
): ResourceRef<R | undefined> {
  const { query, variables, pollInterval, select, injector } = options;
  const service = resolveService(options);
  const registry = injector ? injector.get(QueryRegistry) : inject(QueryRegistry);
  const destroyRef = resolveDestroyRef(injector);
  const name = options.operationName ?? getOperationName(query);

  // refetchAndWait() support: reloading is driven reactively by the generation counter below, so
  // there is no request promise to hand the registry at trigger time. Instead the fetcher returns
  // a deferred that the loader settles once a load for that generation (or newer) completes —
  // on success, failure, or destroy — so awaited refetches resolve when the data is actually in.
  let pending: { generation: number; promise: Promise<void>; resolve: () => void } | undefined;

  const ref = resource<R, { variables: V | undefined; generation: number } | undefined>({
    injector,
    params: () => {
      const vars = variables?.();
      if (variables && vars === undefined) return undefined;
      return { variables: vars, generation: name ? registry.getGeneration(name)() : 0 };
    },
    loader: async ({ params, abortSignal }) => {
      try {
        const data = await orThrow(
          service.query<T, V>({
            query,
            variables: params.variables,
            operationName: name,
            abortSignal,
          }),
        );
        return select ? select(data) : (data as unknown as R);
      } finally {
        // An aborted load was superseded — leave settling to the load that replaced it.
        if (!abortSignal.aborted && pending && params.generation >= pending.generation) {
          pending.resolve();
          pending = undefined;
        }
      }
    },
  });

  if (name) {
    const fetcher = () => {
      // A suspended resource (variables() returned undefined) won't load; nothing to wait for.
      if (ref.status() === 'idle') return Promise.resolve();
      const generation = registry.getGeneration(name)();
      if (pending) {
        pending.generation = Math.max(pending.generation, generation);
      } else {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => (resolve = r));
        pending = { generation, promise, resolve };
      }
      return pending.promise;
    };
    registry.registerFetcher(name, fetcher);
    destroyRef.onDestroy(() => {
      registry.unregisterFetcher(name, fetcher);
      pending?.resolve();
      pending = undefined;
    });
  }

  if (pollInterval) {
    const intervalId = setInterval(() => ref.reload(), pollInterval);
    destroyRef.onDestroy(() => clearInterval(intervalId));
  }

  return ref;
}

export interface SubscriptionResourceOptions<
  T = unknown,
  V extends Record<string, unknown> = never,
  R = T,
> {
  subscription: DocumentInput<T, V>;
  /** Returning `undefined` suspends the resource (no subscription) until variables become available. */
  variables?: () => V | undefined;
  service?: SigqlService;
  /** Allows creation outside an injection context (e.g. in event handlers). */
  injector?: Injector;
  operationName?: string;
  /** Transforms/extracts each emission into the shape exposed as the resource's value. */
  select?: (data: T) => R;
}

export function subscriptionResource<T = unknown, V extends Record<string, unknown> = never, R = T>(
  options: SubscriptionResourceOptions<T, V, R>,
): ResourceRef<R | undefined> {
  const { subscription, variables, select, injector, operationName } = options;
  const service = resolveService(options);

  return rxResource<R, V | undefined>({
    params: variables,
    injector,
    stream: ({ params }) => {
      const stream$ = service.subscribe<T, V>({ subscription, variables: params, operationName });
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
