# Refetching & invalidation

sigql has no normalized cache, so it has no automatic way to know that a mutation changed data some other query depends on. Instead, refetching is explicit and keyed by **GraphQL operation name**.

## Why operation names

Every `watch()` subscription and every `watchQueryResource()` registers itself, by name, with an internal `QueryRegistry` service. A mutation (or a manual call) can then say "refetch anything registered under this name," and every matching subscriber re-runs its query.

This means:

- Queries must be **named** (`query Authors { ... }`, not an anonymous `query { ... }` or a plain string) to participate. `getOperationName()` extracts the name from the parsed document; unnamed/string-based queries simply can't be targeted this way.
- The name is just a string match — it doesn't matter which component or service registered it, or whether the variables match. If two different components both `watchResource()` a query named `Books`, refetching `'Books'` reloads both.

## Triggering a refetch

From a mutation:

```ts
await sigql.mutate({
  mutation: ADD_BOOK_MUTATION,
  variables: { title, year, authorId },
  refetchQueries: ['Books'],
  awaitRefetchQueries: true, // optional — wait for the refetch(es) to finish
});
```

Or directly, from anywhere:

```ts
await sigql.refetch(['Books', 'Authors']);
```

## What actually happens

- `watch()` subscribers hold a live RxJS subscription to the registry's trigger for their name; a refetch calls `.next()` on it, which re-runs the query.
- `watchQueryResource()` subscribers instead depend on a signal-based "generation" counter for their name, which is incremented on refetch — the resource's `params()` includes that counter, so incrementing it causes the resource to reload.
- `refetchAndWait()` (used internally by `awaitRefetchQueries: true`, and by `sigql.refetch()`) triggers first, then awaits every registered fetcher for those names, so it can await the _same_ in-flight request `watch()` already kicked off rather than firing a redundant second one.
- Plain `queryResource()` (not `watchQueryResource()`) doesn't participate in this at all — it only reloads on variable changes or `pollInterval`. Use `watchQueryResource()` whenever a query's data can be invalidated by a mutation elsewhere.

## Local updates as an alternative

For a single, predictable mutation → query relationship, consider skipping the refetch round-trip entirely and updating the resource's value directly with `applyMutationResult()` — see [Mutations](mutations.md#updating-a-resource-locally-applymutationresult).
