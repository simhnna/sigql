# Subscriptions

sigql doesn't hard-code a subscription protocol. `subscribe()` (and `subscriptionResource()`) delegate to whatever `SubscriptionTransport` is provided under the `SIGQL_SUBSCRIPTION_TRANSPORT` injection token — if none is configured, calling `subscribe()` throws a `SigqlError` telling you so.

## Using the built-in `graphql-ws` transport

The `sigql/graphql-ws` secondary entry point implements `SubscriptionTransport` on top of the `graphql-ws` client:

```bash
pnpm add graphql-ws
```

```ts
import { provideGraphqlWs } from 'sigql/graphql-ws';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...provideSigql(...),
    provideGraphqlWs({ url: 'ws://localhost:4000/graphql' }),
  ],
};
```

`provideGraphqlWs(options)` accepts the same options as `graphql-ws`'s `createClient` (everything except `url`, which is required and passed separately in this signature).

`graphql-ws` is an optional peer dependency of `sigql` — if your app has no subscriptions, you never need to install it.

## `subscriptionResource()`

```ts
import { subscriptionResource, gql } from 'sigql';

const BOOK_ADDED_SUBSCRIPTION = gql`
  subscription BookAdded {
    bookAdded {
      id
      title
    }
  }
`;

protected bookAdded = subscriptionResource<{ bookAdded: { id: string; title: string } }>({
  subscription: BOOK_ADDED_SUBSCRIPTION,
});
```

`bookAdded.value()` holds the latest emitted message as a signal. Options mirror `queryResource()`: `variables` (a reactive `() => V` — a plain function, `Signal<V>`, or `computed(...)`; returning `undefined` suspends the subscription), `select` (transform each emission), plus optional `operationName`, `injector`, and `service` overrides.

As with `queryResource()`, `select` reshapes what `.value()` exposes instead of the raw emission:

```ts
protected bookAdded = subscriptionResource<{ bookAdded: Book }, never, Book>({
  subscription: BOOK_ADDED_SUBSCRIPTION,
  select: (data) => data.bookAdded,
});

// bookAdded.value() is now `Book | undefined`, not `{ bookAdded: Book } | undefined`
```

A common pattern is to react to a subscription resource's value and reload a query resource in response (see `demo/src/app/books/books-list.component.ts` for a full working example using an `effect()`).

## `SigqlService.subscribe()`

The lower-level `Observable<T>` API that `subscriptionResource()` is built on:

```ts
sigql
  .subscribe<{ bookAdded: Book }>({ subscription: BOOK_ADDED_SUBSCRIPTION })
  .subscribe((data) => {
    /* ... */
  });
```

## Writing your own transport

Implement the `SubscriptionTransport` interface and provide it under `SIGQL_SUBSCRIPTION_TRANSPORT`:

```ts
import { Provider } from '@angular/core';
import { Observable } from 'rxjs';
import { SubscriptionTransport, SubscriptionRequest, SIGQL_SUBSCRIPTION_TRANSPORT } from 'sigql';

class MyTransport implements SubscriptionTransport {
  subscribe<T>(request: SubscriptionRequest): Observable<T> {
    // request.query is already a printed string, request.variables/operationName as given.
    // ...
  }
}

export const provideMyTransport = (): Provider[] => [
  { provide: SIGQL_SUBSCRIPTION_TRANSPORT, useValue: new MyTransport() },
];
```
