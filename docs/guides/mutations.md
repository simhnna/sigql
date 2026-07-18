# Mutations

## `SigqlService.mutate()`

There's no `mutationResource()` — mutations are actions, not reactive state, so you call `mutate()` directly (usually from an event handler) and get back a `GraphQLResult<T>`:

```ts
import { inject } from '@angular/core';
import { SigqlService, errorMessage } from 'sigql';

const sigql = inject(SigqlService);

const result = await sigql.mutate<
  { addBook: Book },
  { title: string; year: number; authorId: string }
>({
  mutation: ADD_BOOK_MUTATION,
  variables: { title, year, authorId },
});

if (!result.ok) {
  console.error(errorMessage(result));
  return;
}

console.log(result.data.addBook);
```

## Refetching related queries

Since sigql has no normalized cache, nothing updates other queries' data automatically after a mutation. Instead, tell `mutate()` which operation names to refetch by name:

```ts
await sigql.mutate({
  mutation: ADD_BOOK_MUTATION,
  variables: { title, year, authorId },
  refetchQueries: ['Books'], // matches `query Books { ... }` elsewhere in the app
  awaitRefetchQueries: true, // wait for the refetch(es) to complete before mutate() resolves
});
```

- `refetchQueries` triggers any `watch()`/`watchQueryResource()` consumers currently subscribed under those operation names.
- Without `awaitRefetchQueries`, refetches are fired and not awaited (`mutate()` resolves as soon as the mutation itself completes).
- With `awaitRefetchQueries: true`, `mutate()` waits for those refetches to finish too — both `watch()` requests and `watchQueryResource()` reloads — useful when you need fresh data to be in place before doing something next (e.g. navigating away).
- `mutate()` never rejects: a failed refetch doesn't turn a successful mutation into an exception. The refetch failure is delivered to the watching consumers; `mutate()` still resolves with the mutation's own result.

This only works for named operations (`query Books { ... }`, not an anonymous/unnamed query) — see [Refetching & invalidation](refetching.md) for the full mechanics.

## Updating a resource locally: `applyMutationResult()`

Refetching means an extra round trip. If you already know how a mutation's result should change a resource's current value, update it locally instead with `applyMutationResult()`:

```ts
import { applyMutationResult } from 'sigql';

protected booksResource = queryResource<Book[]>({ query: BOOKS_QUERY, select: (d) => d.books });

async addBook(title: string, year: number, authorId: string) {
  const result = await applyMutationResult(
    this.booksResource,
    sigql.mutate<{ addBook: Book }>({ mutation: ADD_BOOK_MUTATION, variables: { title, year, authorId } }),
    (data, current) => [...(current ?? []), data.addBook],
  );

  if (!result.ok) {
    // handle error, e.g. errorMessage(result)
  }
}
```

`applyMutationResult(resource, result, map)`:

- Accepts a `GraphQLResult` or a `Promise` of one (so you can pass a `sigql.mutate()` call directly, as above).
- Only calls `resource.set(map(data, resource.value()))` when the mutation succeeded (`ok: true`) — on failure the resource is left untouched.
- Always resolves with the original `GraphQLResult`, so you can still branch on `result.ok` for error handling after the call.

This is a manual, per-mutation equivalent of what a normalized cache does automatically — see [sigql vs Apollo Angular](../comparison-with-apollo.md) for that trade-off.
