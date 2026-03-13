# sigql

A lightweight, signal-first GraphQL client for Angular — built directly on `signal()`/`resource()`, with no normalized cache and no code generation required.

> **Early days.** sigql is `0.0.1` and under active development. Feedback and issues are very welcome (open one at [github.com/simhnna/sigql](https://github.com/simhnna/sigql)), but no guarantees are made yet about API stability or where the library ends up — expect breaking changes between versions.

## Install

```bash
npm install sigql graphql
```

## Quick start

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

## Full documentation

Mutations, subscriptions, refetching, the class-based API, and a detailed comparison with Apollo Angular are all in the docs on GitHub: **[github.com/simhnna/sigql](https://github.com/simhnna/sigql)**.
