# sigql

A lightweight, signal-first GraphQL client for Angular.

> **Early days.** sigql is `0.0.1` and under active development. Feedback and issues are very welcome (open one at [github.com/simhnna/sigql](https://github.com/simhnna/sigql)), but no guarantees are made yet about API stability or where the library ends up — expect breaking changes between versions.

## Why sigql

sigql is built directly on Angular's own reactivity primitives — `signal()` and `resource()` — instead of layering a separate state-management system on top of Angular. There is no normalized entity cache, no cache-policy configuration, and no code generation step required to get typed results.

That's a deliberate trade-off, not an oversight: sigql is for apps that want simple, predictable query/mutation/subscription plumbing and don't need (or want to pay for) a full client-side cache layer with automatic cross-query entity updates. If your app has complex, deeply interlinked entities that many queries need to stay in sync on automatically, a normalized cache like Apollo's is doing real work for you — see [sigql vs Apollo Angular](#sigql-vs-apollo-angular) below.

## Quick start

```bash
pnpm add sigql graphql
```

```ts
// app.config.ts
import { provideHttpClient } from '@angular/common/http';
import { provideSigql } from 'sigql';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(), provideSigql('http://localhost:4000/graphql')],
};
```

```ts
// authors-list.component.ts
import { Component } from '@angular/core';
import { gql, queryResource } from 'sigql';

const AUTHORS_QUERY = gql`
  query Authors {
    authors {
      id
      name
    }
  }
`;

@Component({
  selector: 'app-authors-list',
  template: `
    @if (authors.isLoading()) {
      Loading...
    } @else {
      @for (author of authors.value()?.authors; track author.id) {
        <p>{{ author.name }}</p>
      }
    }
  `,
})
export class AuthorsListComponent {
  protected authors = queryResource<{ authors: { id: string; name: string }[] }>({
    query: AUTHORS_QUERY,
  });
}
```

That covers reading data. Mutations, subscriptions, refetching, and an alternative class-based API are all in [`docs/`](docs/getting-started.md).

## sigql vs Apollo Angular

|                    | sigql                                                         | Apollo Angular                                                  |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Cache              | None — reactivity comes from Angular signals/`resource()`     | Normalized, cross-query entity cache with configurable policies |
| State updates      | Explicit: `refetchQueries` or manual `resource.set()`         | Largely automatic via cache normalization                       |
| Dependencies       | `graphql`, `rxjs`; `graphql-ws` only if you use subscriptions | `@apollo/client` plus Apollo Angular                            |
| Maturity/ecosystem | New, small API surface, no devtools yet                       | Mature, widely adopted, has devtools                            |

Full writeup, including when each is the better fit: [`docs/comparison-with-apollo.md`](docs/comparison-with-apollo.md).

## Documentation

- [Getting started](docs/getting-started.md) — installation, `provideSigql`, subscription transport setup
- [Queries](docs/guides/queries.md) — `query()`, `watch()`, `queryResource()`, `watchQueryResource()`
- [Mutations](docs/guides/mutations.md) — `mutate()`, refetching, `applyMutationResult()`
- [Subscriptions](docs/guides/subscriptions.md) — `subscribe()`, `subscriptionResource()`, pluggable transports
- [Refetching & invalidation](docs/guides/refetching.md) — how operation-name-based refetching works
- [Class-based API](docs/guides/class-based-api.md) — `Query`/`Mutation`/`Subscription` base classes
- [sigql vs Apollo Angular](docs/comparison-with-apollo.md)

## Development

This repo is a pnpm workspace with the `sigql` library (`sigql/`, plus its `sigql/graphql-ws` secondary entry point) and a `demo` Angular app (`demo/`) that exercises it against a real GraphQL server.

```bash
pnpm install
pnpm run dev     # watch-builds the library, runs the demo GraphQL server, serves the demo app
pnpm test        # runs the library's unit tests
```

See [`CLAUDE.md`](CLAUDE.md) for a full architecture overview and the rest of the available scripts.

## License

[MIT](LICENSE)
