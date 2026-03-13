import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { queryResource } from 'sigql';

interface BookDetail {
  book: {
    id: string;
    title: string;
    year: number;
    author: {
      id: string;
      name: string;
      bio: string;
    };
  } | null;
}

const BOOK_QUERY = /* GraphQL */ `
  query Book($id: ID!) {
    book(id: $id) {
      id
      title
      year
      author {
        id
        name
        bio
      }
    }
  }
`;

@Component({
  selector: 'app-book-detail',
  imports: [RouterLink],
  template: `
    <a routerLink="/books">&larr; Back to books</a>

    @if (bookResource.isLoading()) {
      <p class="loading">Loading...</p>
    } @else if (bookResource.error()) {
      <p class="error">Failed to load book.</p>
    } @else if (!bookResource.value()?.book) {
      <p class="error">Book not found.</p>
    } @else {
      @let book = bookResource.value()!.book!;
      <article>
        <h1>{{ book.title }}</h1>
        <p class="meta">Published {{ book.year }}</p>
        <section>
          <h2>Author</h2>
          <p>
            <a [routerLink]="['/authors', book.author.id]">{{ book.author.name }}</a>
          </p>
          <p class="bio">{{ book.author.bio }}</p>
        </section>
        <button (click)="bookResource.reload()">Refresh</button>
      </article>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    a {
      color: #1a1a2e;
    }
    .loading {
      color: #888;
      font-style: italic;
      margin-top: 1rem;
    }
    .error {
      color: #e94560;
      margin-top: 1rem;
    }
    article {
      margin-top: 1.5rem;
    }
    h1 {
      margin-bottom: 0.25rem;
    }
    .meta {
      color: #888;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    .bio {
      color: #555;
      font-style: italic;
    }
    button {
      margin-top: 1.5rem;
      padding: 0.5rem 1rem;
      background: #1a1a2e;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  `,
})
export class BookDetailComponent {
  private route = inject(ActivatedRoute);

  private idSignal = toSignal(this.route.paramMap.pipe(map((p) => p.get('id')!)), {
    initialValue: '',
  });

  protected bookResource = queryResource<BookDetail, { id: string }>({
    query: BOOK_QUERY,
    variables: () => ({ id: this.idSignal() }),
  });
}
