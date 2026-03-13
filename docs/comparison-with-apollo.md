# sigql vs Apollo Angular

Apollo Angular is the mature, widely-used GraphQL client for Angular. sigql is not trying to replace it for every use case — it's a much smaller, intentionally simpler alternative for apps that don't need everything Apollo's cache provides. This page is meant to help you decide which fits your app, not to argue Apollo is worse.

## Cache model

**Apollo** ships a normalized, in-memory entity cache (`InMemoryCache`). Every object with an `id`/`__typename` is stored once and shared across every query that references it; updating one entity (via a mutation response, `cache.modify`, optimistic responses, etc.) automatically updates every query result that includes it, with no manual refetching.

**sigql** has no cache at all. Every `queryResource()`/`watchQueryResource()` call holds its own independent result as an Angular signal. Keeping data in sync across queries is explicit:

- Name your queries and pass `refetchQueries` on a mutation (see [Refetching & invalidation](guides/refetching.md)), or
- Manually patch a resource's value with `applyMutationResult()` (see [Mutations](guides/mutations.md)).

This is simpler to reason about for small-to-medium apps with a handful of queries, but it means _you_ are responsible for knowing which queries need to be refreshed after a mutation — Apollo's cache would otherwise catch this for you automatically, including in places you might not think to update manually.

## State/reactivity primitives

**Apollo Angular** is built around RxJS `Observable`s (`watchQuery`, `Apollo.query`, etc.), with more recent versions adding signal-based wrappers on top.

**sigql** is built natively on Angular's `signal()`/`resource()` APIs from the ground up — `queryResource()`/`watchQueryResource()`/`subscriptionResource()` return real `ResourceRef`s with the standard `.value()`/`.isLoading()`/`.error()`/`.reload()` signals, no adapter layer required. `SigqlService` also exposes a plain `Observable`/`Promise` API for non-component use.

## Dependencies and size

**Apollo** requires `@apollo/client` (a substantial dependency, since it includes the cache, link chain, and its own reactivity layer) plus the Apollo Angular bindings.

**sigql**'s only required dependencies are `graphql` (for parsing/printing) and `rxjs` (already a transitive Angular dependency). `graphql-ws` is an optional peer dependency, needed only if you use subscriptions via `sigql/graphql-ws`.

## Subscriptions

**Apollo** wires subscriptions in via a `split`/`ApolloLink` chain (typically `graphql-ws` or `subscriptions-transport-ws` under a `WebSocketLink`).

**sigql** exposes a single `SubscriptionTransport` interface behind an injection token (`SIGQL_SUBSCRIPTION_TRANSPORT`). `sigql/graphql-ws` is the only bundled implementation, but writing your own for a different protocol is a small amount of code — see [Subscriptions](guides/subscriptions.md#writing-your-own-transport).

## Maturity and ecosystem

**Apollo** is battle-tested in production across a huge number of apps, has devtools, extensive documentation, and a large community.

**sigql** is early-stage (see the disclaimer in the [README](../README.md)): small API surface, no devtools, no established production track record yet, and the API may still change.

## Rough guidance

Reach for **sigql** if:

- You want Angular's own signals/`resource()` as the only reactivity model, with no separate cache to reason about.
- Your app's queries are mostly independent, or you're comfortable being explicit about which queries need to refetch after a mutation.
- You want a minimal dependency footprint and don't need a normalized cache, optimistic UI helpers, or cache devtools.

Reach for **Apollo Angular** if:

- Your data model has many interlinked entities referenced across many queries, and you want updates to one to propagate everywhere automatically.
- You rely on optimistic mutations, fine-grained cache eviction/read/write APIs, or Apollo's devtools.
- You want a client with a long production track record and a large ecosystem/community.
