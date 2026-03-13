# Getting started

## Install

```bash
pnpm add sigql graphql
```

`graphql` is a required peer dependency (used for parsing/printing documents). `rxjs` and `@angular/common`/`@angular/core` are also peer dependencies but you'll already have them in any Angular app.

## Configure the client

Register an endpoint with `provideSigql()` in your app config:

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideSigql } from 'sigql';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(), provideSigql('http://localhost:4000/graphql')],
};
```

`provideSigql` takes an optional second argument, `SigqlConfig`:

```ts
provideSigql('http://localhost:4000/graphql', {
  // Appends the operation name as a query parameter, e.g. ?op=Authors.
  // Useful for server-side request logging/tracing.
  operationNameParam: 'op',
});
```

Requests are made through Angular's `HttpClient`, so `provideHttpClient()` (with whichever backend you prefer, e.g. `withXhr()` or `withFetch()`) must also be provided.

## Subscriptions (optional)

sigql has no built-in transport for GraphQL subscriptions — `subscribe()` throws until one is configured. The `sigql/graphql-ws` secondary entry point provides a `graphql-ws`-backed transport:

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

`provideGraphqlWs` accepts the same options as `graphql-ws`'s `createClient` (minus `url`, which is required directly). If you use a different subscription protocol, implement `SubscriptionTransport` yourself and provide it via `SIGQL_SUBSCRIPTION_TRANSPORT` — see [Subscriptions](guides/subscriptions.md).

## Try it against the bundled demo

This repo ships a working example app (`demo/`) backed by an in-memory `graphql-yoga` server (`demo/server/index.js`) that supports queries, mutations, and a subscription. From the repo root:

```bash
pnpm install
pnpm run dev
```

This runs the library in watch mode, starts the demo GraphQL server on `http://localhost:4000/graphql`, and serves the demo app on `http://localhost:4200`. Look at `demo/src/app/` for real, working usage of every API described in these docs.

## Next steps

- [Queries](guides/queries.md)
- [Mutations](guides/mutations.md)
- [Subscriptions](guides/subscriptions.md)
- [Refetching & invalidation](guides/refetching.md)
- [Class-based API](guides/class-based-api.md)
