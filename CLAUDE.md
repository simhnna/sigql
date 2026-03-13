# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`sigql` is a lightweight GraphQL client for Angular built around signals and the `resource()` API (no RxJS-heavy operator soup, no normalized cache like Apollo). This repo is a pnpm workspace containing:

- `sigql/` — the publishable library (Angular CLI project `sigql`), entry point `sigql/src/public-api.ts`.
- `sigql/graphql-ws/` — a secondary entry point (`sigql/graphql-ws`) providing an optional `graphql-ws` subscription transport, kept separate so `graphql-ws` stays an optional peer dependency of the core library.
- `demo/` — an Angular CLI application (Angular CLI project `demo`) exercising the library against a real GraphQL server, plus `demo/server/index.js`, a small `graphql-yoga` + `graphql-ws` server (in-memory authors/books data) used for manual/e2e-style testing.

## Commands

Install deps: `pnpm install`

- `pnpm start` — serve the demo app (`ng serve demo`) at `http://localhost:4200`.
- `pnpm run server` — run the demo GraphQL server (`demo/server/index.js`) at `http://localhost:4000/graphql`.
- `pnpm run dev` — run lib watch build + demo server + demo serve concurrently (the usual way to develop end-to-end).
- `pnpm run build:lib` — build the `sigql` library via `ng-packagr` (`ng build sigql`) into `dist/sigql`. The demo app and the library's own spec files import from `sigql`/`sigql/graphql-ws`, which resolve to `dist/sigql` (see `tsconfig.json` paths) — **rebuild the lib after changing its source** if you need the demo or path-based consumers to see the change.
- `pnpm run build:demo` — build the demo app (`ng build demo`).
- `pnpm run build` — build lib then demo.
- `pnpm test` — run the library's unit tests (`ng test sigql`), via Angular's Vitest-based unit-test builder. This also picks up `sigql/graphql-ws/src/**/*.spec.ts` (see the `test.options.include` override in `angular.json`).

Running a single test file or test name (append after `pnpm test --`, or call `npx ng test sigql` directly):

- `npx ng test sigql --include sigql/src/lib/gql.spec.ts`
- `npx ng test sigql --filter "some test name regex"`
- `npx ng test sigql --watch` for watch mode (watch is on by default in a TTY).

There is no separate lint script in `package.json`; formatting is via Prettier (`.prettierrc`: single quotes, 100 print width, `angular` parser for `.html`).

CI (`.github/workflows/`) runs, in order: `pnpm install --frozen-lockfile`, `pnpm run build:lib`, `pnpm run build:demo`, `pnpm run test`. A separate `Publish` workflow builds+tests+publishes `dist/sigql` to npm on `v*.*.*` tags, gated on the tag matching `dist/sigql/package.json`'s version.

## Architecture

### Request layer

`SigqlService` (`sigql/src/lib/sigql.service.ts`) is the single place that talks HTTP/WS. It injects `SIGQL_ENDPOINT`/`SIGQL_CONFIG` (from `provideSigql()` in `provider.ts`) and an optional `SIGQL_SUBSCRIPTION_TRANSPORT`. Everything else in the library is built on its four primitives:

- `query()` / `execute()` — one-shot request, returns a `GraphQLResult<T>` (a discriminated union on `ok`, never throws).
- `watch()` — a hot `Observable<T>` that re-runs on demand: it resolves the operation name from the `DocumentNode` (or an explicit `operationName`), registers itself with `QueryRegistry`, and re-fetches whenever that name is triggered elsewhere (e.g. by a mutation's `refetchQueries`) or on `pollInterval`.
- `subscribe()` — delegates to the injected `SubscriptionTransport` (throws a `SigqlError` if none is configured).
- `mutate()` — runs the mutation, then triggers `refetchQueries` (fire-and-forget, or awaited if `awaitRefetchQueries` is set).

`GraphQLResult<T>` (`types.ts`) is the core error-handling contract: success/error are distinguished by the `ok` field rather than exceptions. Use `orThrow()` to convert a result into a throwing `Promise<T>` (this is what the `resource()`-based helpers do internally, since Angular resources expect throwing loaders).

### Refetch/invalidation: `QueryRegistry`

`QueryRegistry` (`query-registry.service.ts`) is the pub/sub hub that connects mutations to the queries they should invalidate, keyed by **GraphQL operation name** (extracted via `getOperationName()` in `utils.ts` — anonymous/string queries can't participate). It tracks three things per name: an RxJS `Subject` (drives `watch()`), a signal-based generation counter (drives `watchQueryResource()`), and a set of registered fetcher functions (so `refetchAndWait()` can await in-flight refetches instead of racing a duplicate request). Consumers register/unregister on subscribe/destroy; an unregistered name is fully cleaned up.

### Signals layer: `sigql-resource.ts`

Built on top of `SigqlService` + `QueryRegistry`, exposing Angular `resource()`-shaped APIs:

- `queryResource()` — a resource keyed by a `Signal` of variables; reloads when variables change, on `pollInterval`, and cancels stale in-flight requests via `AbortSignal` (set as the `abortSignal` field on the `GraphQLRequest` passed to `SigqlService.query()`).
- `watchQueryResource()` — like `queryResource()`, but additionally reloads when `QueryRegistry`'s generation counter for its operation name increments (i.e. it's the resource-based counterpart to `watch()`). It registers a no-op fetcher purely so `refetchAndWait()` knows a resource consumer exists for that name.
- `subscriptionResource()` — wraps `SigqlService.subscribe()` via `rxResource`.
- `applyMutationResult()` — optimistic/local-update helper: only calls `resource.set(...)` when a mutation result is `ok`, otherwise passes the result through unchanged.

### Class-based sugar: `sigql-classes.ts`

`Query`, `Mutation`, `Subscription` are abstract injectable base classes wrapping the functions above (subclass and implement `document`) for teams that prefer per-operation service classes over calling `queryResource()`/`SigqlService` directly. Both styles are equivalent — the class methods just delegate to `SigqlService`/`sigql-resource.ts`.

### `gql` tag and printing

`gql.ts` re-implements the `gql` template tag directly on top of `graphql`'s `parse` (no `graphql-tag` dependency). `SigqlService` caches `print(document)` output in a `WeakMap` keyed by the parsed `DocumentNode` so repeated calls with the same document don't re-stringify.

### Subscriptions are pluggable

`SIGQL_SUBSCRIPTION_TRANSPORT` (`subscription-transport.ts`) is an injection token for a minimal `{ subscribe(request): Observable<T> }` interface. The `sigql/graphql-ws` secondary entry point (`provide-graphql-ws.ts`, `graphql-ws-transport.ts`) is the only built-in implementation, adapting the `graphql-ws` package's `Client` to this interface. This is why `graphql-ws` is an optional peer dependency of `sigql` rather than a hard one — apps that don't need subscriptions never need to install it.

### Demo app conventions

Components under `demo/src/app/` (e.g. `authors/`, `books/`) call `queryResource()`/`Query` classes directly with inline `gql`-tagged (or plain string) queries colocated in the component file, and drive templates off the resource's `isLoading()`/`error()`/`value()` signals — this is the reference usage pattern for the library.
