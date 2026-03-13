# sigql vs. Apollo Client

sigql intentionally skips Apollo's normalized cache — that's out of scope here. This document tracks the _other_ differences: things Apollo Client does that sigql doesn't (yet), so gaps can be closed deliberately rather than by accident.

## Transport

|                   | Apollo Client                                                    | sigql                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol          | HTTP (Apollo Link chain), pluggable                              | HTTP POST only, via Angular `HttpClient`                                                                                                                                                                                    |
| Subscriptions     | `graphql-ws`/`subscriptions-transport-ws` links                  | Supported via a pluggable `SubscriptionTransport` (`SigqlService.subscribe()`, `Subscription` class, `subscriptionResource()`); a built-in `graphql-ws` implementation ships as the optional `sigql/graphql-ws` entry point |
| Auth/headers      | `setContext`/link middleware                                     | Angular `HttpClient` interceptors (equivalent capability, different mechanism — nothing to add here)                                                                                                                        |
| Retry             | `RetryLink` (exponential backoff)                                | None — a failed request just rejects                                                                                                                                                                                        |
| Batching          | `BatchHttpLink` merges multiple operations into one HTTP request | None — one request per `query`/`mutate` call                                                                                                                                                                                |
| Persisted queries | Automatic Persisted Queries (APQ)                                | None — full query text sent every time                                                                                                                                                                                      |
| File uploads      | `apollo-upload-client` (multipart spec)                          | None — `variables` is JSON-only                                                                                                                                                                                             |

**Former biggest practical gap, now closed:** subscriptions are supported via `SigqlService.subscribe()`/`Subscription`/`subscriptionResource()`, backed by a pluggable `SubscriptionTransport` (built-in `graphql-ws` support in `sigql/graphql-ws`, optional dependency). `watch()`/`watchQueryResource()` remain a separate, distinct mechanism — they re-poll when a mutation explicitly names them in `refetchQueries`, they don't get pushed updates.

## Query execution & reactivity

|                      | Apollo Client                                                                             | sigql                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch policy         | `cache-first` / `cache-and-network` / `network-only` / `no-cache` / `standby`             | Always a fresh network request (no cache to serve from)                                                                                                                                                                                                                                                       |
| Conditional fetching | `skip: boolean` option                                                                    | No dedicated option, but Angular's `resource()` treats a `params` signal returning `undefined` as "idle, don't load" — `queryResource`/`watchQueryResource` inherit this if the `variables` signal itself is typed/computed to return `undefined`, it's just not documented or surfaced as an explicit `skip` |
| Polling              | `pollInterval`                                                                            | None — no built-in interval refetch                                                                                                                                                                                                                                                                           |
| Deduplication        | Identical in-flight queries (same document + variables) share one network request         | None — two components querying the same thing at once fire two requests                                                                                                                                                                                                                                       |
| Refetch targeting    | `refetchQueries: [{ query, variables }]`, a function, or `'active'` (all mounted queries) | `refetchQueries: string[]` — operation-name only, no variables-aware targeting, no "refetch everything active"                                                                                                                                                                                                |
| Loading state detail | `networkStatus` distinguishes initial load / refetch / poll / setVariables                | `ResourceRef.status()`/`isLoading()` — coarser, no distinction between "first load" and "refetching"                                                                                                                                                                                                          |

## Mutations

|                        | Apollo Client                                                                     | sigql                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Optimistic UI          | `optimisticResponse` renders a predicted result immediately, rolled back on error | None — UI waits for the real response                                                                     |
| Direct result handling | `update(cache, result)` writes the mutation result into the cache surgically      | N/A without a cache — the only lever is `refetchQueries`                                                  |
| Refetch specificity    | Can target a query + exact variables                                              | Can only target by operation name — refetches _all_ active instances of that name regardless of variables |

## Error handling

|              | Apollo Client                                                                                              | sigql                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error shape  | `ApolloError` separates `networkError` (transport failure) from `graphQLErrors` (errors in a 200 response) | `query`/`mutate`/`execute` never throw — they resolve to a `GraphQLResult<T> { data, errors?, networkError?, ok }`, unifying both origins into one shape. `SigqlError` (same `.errors`/`.networkError` split as before, plus `.data`) is only thrown by the opt-in `orThrow()` helper, and internally by `watch()`/`subscribe()`, which keep their throwing Observable contract |
| Partial data | `errorPolicy: 'all'` returns both `data` and `errors` together                                             | Always returns both — `data`/`errors`/`networkError`/`ok` on every `GraphQLResult`, never discarded; `orThrow()` preserves partial `data` on the thrown `SigqlError` too                                                                                                                                                                                                        |

## Local/client-only state

Apollo has `@client` fields, local resolvers, and reactive variables for mixing client-only state into the same query documents. sigql has no equivalent — all state that isn't server data is just plain Angular signals/services, which is arguably fine given there's no cache to integrate with, but worth naming as a deliberate non-goal rather than an oversight.

## Advanced GraphQL features

- No `@defer`/`@stream` incremental delivery support.
- No automatic persisted queries.
- Directives like `@skip`/`@include` work fine (server resolves them, sigql just ships the query text) — only Apollo-specific client directives (`@client`, `@connection`) have no analog, and don't need one without a cache.

## Tooling & DX

- No devtools browser extension.
- No `MockedProvider`-style testing helper — tests currently have to mock `HttpClient` or `SigqlService` directly.
- No SSR-specific data-fetching/hydration integration (Angular Universal hydration is a separate mechanism and hasn't been wired to sigql's requests).

## Closing the gap — suggested priority

Roughly ordered by (value ÷ effort), given the no-cache constraint:

1. ~~**Split network vs. GraphQL errors**~~ — done: `post$` now normalizes both into `SigqlError` (`.errors` vs `.networkError`).
2. ~~**`errorPolicy: 'all'`**~~ — done: `query`/`mutate`/`execute` now always return `GraphQLResult<T>` (never throw); `orThrow()` is the opt-in throw-on-failure helper layered on top.
3. **Request deduplication** — cache in-flight `Promise`s by `(query, variables)` for the lifetime of the request in `SigqlService`; no persistence needed, so it doesn't reopen the "no cache" decision.
4. **Retry** — either document that this belongs in an `HttpInterceptor` (likely the better fit, since Angular already has the primitive) or ship a small opt-in helper.
5. **Polling** — `pollInterval` on `watch()`/`queryResource` is a small addition (an interval-driven trigger alongside the existing registry trigger).
6. **Variables-aware refetch targeting** — extend `refetchQueries` to accept `{ operationName, variables }` in addition to bare strings, and have `QueryRegistry` match on both.
7. ~~**Subscriptions**~~ — done: pluggable `SubscriptionTransport` + built-in `graphql-ws` support via the optional `sigql/graphql-ws` entry point.
8. **Optimistic responses** — meaningful UX win but harder to retrofit cleanly onto `mutate()`/`Mutation` without a cache to stage the optimistic value in; would need its own small in-memory mechanism.
