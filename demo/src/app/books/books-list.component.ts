import { Component, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  applyMutationResult,
  errorMessage,
  gql,
  queryResource,
  subscriptionResource,
  SigqlService,
} from 'sigql';

interface Book {
  id: string;
  title: string;
  year: number;
  author: { id: string; name: string };
}

interface BooksQuery {
  books: Book[];
}

const BOOKS_QUERY = /* GraphQL */ gql`
  query Books {
    books {
      id
      title
      year
      author {
        id
        name
      }
    }
  }
`;

const BOOK_ADDED_SUBSCRIPTION = /* GraphQL */ gql`
  subscription BookAdded {
    bookAdded {
      id
      title
    }
  }
`;

const ADD_BOOK_MUTATION = /* GraphQL */ `
  mutation AddBook($title: String!, $year: Int!, $authorId: ID!) {
    addBook(title: $title, year: $year, authorId: $authorId) {
      id
      title
      year
      author {
        id
        name
      }
    }
  }
`;

@Component({
  selector: 'app-books-list',
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <h1>Books</h1>

    @if (bookAddedResource.value(); as added) {
      <p class="live">📡 New book added live: {{ added.bookAdded.title }}</p>
    }

    @if (booksResource.isLoading()) {
      <p class="loading">Loading books...</p>
    } @else if (booksResource.error()) {
      <p class="error">Error: {{ booksResource.error() }}</p>
    } @else {
      <ul class="list">
        @for (book of booksResource.value(); track book.id) {
          <li>
            <a [routerLink]="['/books', book.id]">{{ book.title }}</a>
            <span class="meta">{{ book.year }} · {{ book.author.name }}</span>
          </li>
        }
      </ul>
      <button (click)="booksResource.reload()">Refresh</button>
    }

    <hr />

    <h2>Add a Book</h2>
    <form [formGroup]="addForm" (ngSubmit)="submitBook()">
      <label>
        Title
        <input formControlName="title" type="text" placeholder="Book title" />
      </label>
      <label>
        Year
        <input formControlName="year" type="number" placeholder="Year" />
      </label>
      <label>
        Author ID
        <input formControlName="authorId" type="text" placeholder="Author ID (1, 2, or 3)" />
      </label>
      <button type="submit" [disabled]="adding() || addForm.invalid">
        {{ adding() ? 'Adding...' : 'Add Book' }}
      </button>
      @if (addError()) {
        <p class="error">{{ addError() }}</p>
      }
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .loading {
      color: #888;
      font-style: italic;
    }
    .error {
      color: #e94560;
    }
    ul.list {
      list-style: none;
      padding: 0;
    }
    ul.list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px solid #eee;
    }
    ul.list a {
      font-size: 1rem;
      color: #1a1a2e;
      text-decoration: none;
    }
    ul.list a:hover {
      text-decoration: underline;
    }
    .meta {
      color: #888;
      font-size: 0.875rem;
    }
    .live {
      color: #1a1a2e;
      background: #eef6ff;
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 400px;
      margin-top: 1rem;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
      font-weight: 500;
    }
    input {
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 1rem;
    }
    button {
      padding: 0.5rem 1rem;
      background: #1a1a2e;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
      cursor: default;
    }
    hr {
      margin: 2rem 0;
      border: none;
      border-top: 1px solid #eee;
    }
  `,
})
export class BooksListComponent {
  private sigql = inject(SigqlService);

  protected booksResource = queryResource({
    query: BOOKS_QUERY,
    select: (data: BooksQuery) => data.books,
  });
  protected bookAddedResource = subscriptionResource<{ bookAdded: { id: string; title: string } }>({
    subscription: BOOK_ADDED_SUBSCRIPTION,
  });

  private readonly reloadOnBookAdded = effect(() => {
    if (this.bookAddedResource.value()) {
      this.booksResource.reload();
    }
  });

  protected addForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: Validators.required }),
    year: new FormControl<number | null>(null, Validators.required),
    authorId: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });

  protected adding = signal(false);
  protected addError = signal('');

  protected async submitBook() {
    if (this.addForm.invalid) return;

    const { title, year, authorId } = this.addForm.getRawValue();

    this.adding.set(true);
    this.addError.set('');

    const result = await applyMutationResult(
      this.booksResource,
      this.sigql.mutate<{ addBook: Book }>({
        mutation: ADD_BOOK_MUTATION,
        variables: {
          title,
          year: year!,
          authorId,
        },
      }),
      (data, current) => [...(current ?? []), data.addBook],
    );

    this.adding.set(false);
    if (!result.ok) {
      this.addError.set(errorMessage(result));
      return;
    }
    this.addForm.reset();
  }
}
