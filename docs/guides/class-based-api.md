# Class-based API

Everything in sigql is available as plain functions (`queryResource()`, `SigqlService.mutate()`, etc.). If you'd rather organize each operation as its own injectable service/class — closer to how some Apollo Angular codebases structure generated query/mutation services — sigql also provides abstract base classes: `Query`, `Mutation`, and `Subscription`.

Both styles are equivalent; the class methods are thin wrappers delegating to `SigqlService` and the `sigql-resource` functions. Pick whichever fits your codebase's conventions — you can also mix both styles in the same app.

## `Query`

```ts
import { Injectable } from '@angular/core';
import { Query, gql } from 'sigql';

interface AuthorsResult {
  authors: { id: string; name: string }[];
}

@Injectable({ providedIn: 'root' })
export class AuthorsQuery extends Query<AuthorsResult> {
  readonly document = gql`
    query Authors {
      authors {
        id
        name
      }
    }
  `;
}
```

```ts
const authorsQuery = inject(AuthorsQuery);

authorsQuery.fetch(); // Promise<GraphQLResult<AuthorsResult>>
authorsQuery.watch(); // Observable<AuthorsResult>
authorsQuery.resource(); // ResourceRef<AuthorsResult | undefined>, like queryResource()
authorsQuery.watchResource(); // ResourceRef<AuthorsResult | undefined>, like watchQueryResource()
```

`resource()`/`watchResource()` accept the same `(variables?: () => V, select?: (data: T) => R)` parameters as their function-based counterparts.

## `Mutation`

```ts
@Injectable({ providedIn: 'root' })
export class AddBookMutation extends Mutation<
  { addBook: Book },
  { title: string; year: number; authorId: string }
> {
  readonly document = ADD_BOOK_MUTATION;
}
```

```ts
const addBook = inject(AddBookMutation);
await addBook.mutate({ title, year, authorId }, { refetchQueries: ['Books'] });
```

## `Subscription`

```ts
@Injectable({ providedIn: 'root' })
export class BookAddedSubscription extends Subscription<{ bookAdded: Book }> {
  readonly document = BOOK_ADDED_SUBSCRIPTION;
}
```

```ts
const bookAdded = inject(BookAddedSubscription);
bookAdded.subscribe(); // Observable<{ bookAdded: Book }>
bookAdded.resource(); // ResourceRef<{ bookAdded: Book } | undefined>, like subscriptionResource()
```
