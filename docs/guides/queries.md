# Queries

sigql gives you two ways to run a query: as a plain `Promise`/`Observable` via `SigqlService`, or as an Angular `resource()` via `queryResource()`/`watchQueryResource()`. Most components should use the resource-based helpers; `SigqlService` is there for anything else (e.g. one-off fetches outside a component, or building your own abstractions).

## Defining a query document

Use the `gql` tag (a thin wrapper around `graphql`'s `parse`) or a plain string — both work anywhere a query/mutation/subscription document is expected:

```ts
import { gql } from 'sigql';

const AUTHORS_QUERY = gql`
  query Authors {
    authors {
      id
      name
    }
  }
`;
```

Naming the operation (`query Authors`) matters if you want this query to participate in refetching — see [Refetching & invalidation](refetching.md).

Interpolations in a `gql` template may be strings (shared field lists) or other `DocumentNode`s (fragments, printed back into the source):

```ts
const AUTHOR_FIELDS = gql`
  fragment AuthorFields on Author {
    id
    name
  }
`;

const AUTHORS_QUERY = gql`
  query Authors {
    authors {
      ...AuthorFields
    }
  }
  ${AUTHOR_FIELDS}
`;
```

Anything else throws: interpolating runtime values into the document is a GraphQL injection vector — pass dynamic values as GraphQL variables instead. Identical `gql` sources return the same cached `DocumentNode` instance, so defining documents inside functions doesn't defeat downstream per-document caches.

## Typed documents (graphql-codegen)

Every API that takes a document also accepts a `TypedDocumentNode<TResult, TVariables>` — the convention emitted by [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) and shared across GraphQL clients. With a typed document, result and variables types are inferred; no explicit type arguments needed:

```ts
import { AuthorDocument } from './generated'; // TypedDocumentNode<AuthorResult, AuthorVars>

protected authorResource = queryResource({
  query: AuthorDocument,
  variables: () => ({ id: this.authorId() }), // type-checked against AuthorVars
});
// authorResource.value() is inferred as AuthorResult | undefined
```

sigql's `TypedDocumentNode` type is structurally compatible with `@graphql-typed-document-node/core`, so generated documents work without any extra dependency. Codegen is entirely optional — plain `gql` documents with explicit type arguments (as in the examples below) work the same as ever.

## `queryResource()`

The common case: fetch once (and whenever variables change), expose the result as a signal.

```ts
import { Component, signal } from '@angular/core';
import { queryResource } from 'sigql';

@Component({
  /* ... */
})
export class AuthorsListComponent {
  protected authorId = signal('1');

  protected authorResource = queryResource<
    { author: { id: string; name: string } },
    { id: string }
  >({
    query: AUTHOR_QUERY,
    variables: () => ({ id: this.authorId() }),
  });
}
```

Template access is via the standard `resource()` signals: `authorResource.value()`, `.isLoading()`, `.error()`, `.reload()`.

Options (`QueryResourceOptions`):

- `query` — the document (`gql`-tagged, a `TypedDocumentNode`, or a string).
- `variables` — a reactive function returning the variables (a plain `() => V`, a `Signal<V>`, or `computed(() => V)` all work); the resource automatically reloads (and cancels the previous in-flight request) whenever the signals it reads change. Returning `undefined` suspends the resource — no request is made until variables become available.
- `select` — transform/extract the raw response into whatever shape you want exposed as `.value()`, instead of the raw query result.
- `pollInterval` — reload on an interval (in ms), in addition to variable changes.
- `operationName` — override the name extracted from the document; required for string documents (or multi-operation documents) that should participate in refetching.
- `injector` — create the resource outside an injection context (e.g. in an event handler).
- `service` — override the injected `SigqlService` (rarely needed).

### `select`

Without `select`, `.value()` gives you the raw response shape (`{ authors: [...] }`). Pass `select` to unwrap or transform it — the resource's type parameter `R` then reflects the _selected_ shape, not the raw one:

```ts
protected authors = queryResource<{ authors: Author[] }, never, Author[]>({
  query: AUTHORS_QUERY,
  select: (data) => data.authors,
});

// authors.value() is now `Author[] | undefined`, not `{ authors: Author[] } | undefined`
```

`select` re-runs on every successful load/reload, same as any other part of the loader.

In-flight requests are cancelled via `AbortSignal` when variables change again before the previous request resolves, so a burst of rapid variable changes won't race and show stale data.

## `watchQueryResource()`

Same shape and options as `queryResource()` — including `select` — but the resource _also_ reloads whenever another part of the app refetches this query's operation name (e.g. after a mutation with matching `refetchQueries`, or an explicit `sigql.refetch([...])` call). Use this whenever the query's data can be invalidated by mutations elsewhere in the app. See [Refetching & invalidation](refetching.md) for how the operation-name matching works.

```ts
protected authors = watchQueryResource<{ authors: Author[] }, never, Author[]>({
  query: AUTHORS_QUERY,
  select: (data) => data.authors,
});
```

## `SigqlService.query()` / `execute()`

For fetching outside of a resource (e.g. in a route resolver, a guard, or imperative code), inject `SigqlService` directly:

```ts
import { inject } from '@angular/core';
import { SigqlService, orThrow } from 'sigql';

const sigql = inject(SigqlService);
const result = await sigql.query<{ authors: Author[] }>({ query: AUTHORS_QUERY });
// result is a GraphQLResult<T> — a discriminated union on `ok`, it never throws.

// To get a throwing Promise<T> instead (e.g. to use with try/catch):
const data = await orThrow(sigql.query<{ authors: Author[] }>({ query: AUTHORS_QUERY }));
```

Pass `abortSignal` on the request to cancel it — the promise rejects with the abort reason if the signal fires (or has already fired) before the response arrives. This is how `queryResource()`/`watchQueryResource()` cancel stale in-flight requests on rapid variable changes; most callers won't need it directly.

## `SigqlService.watch()`

An `Observable`-based equivalent of `watchQueryResource()`, for code that isn't component-signal-based. Re-emits whenever the operation is refetched elsewhere, or on `pollInterval`. It emits `GraphQLResult<T>`s, and failed fetches are delivered as `ok: false` results rather than erroring the observable — so a transient network failure never kills a poll or an active watch.

```ts
sigql
  .watch<{ authors: Author[] }>({ query: AUTHORS_QUERY, pollInterval: 5000 })
  .subscribe((result) => {
    if (result.ok) {
      /* result.data.authors */
    }
  });
```
