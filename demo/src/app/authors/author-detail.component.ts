import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { queryResource } from 'sigql';

interface AuthorDetail {
  author: {
    id: string;
    name: string;
    bio: string;
    books: Array<{ id: string; title: string; year: number }>;
  } | null;
}

const AUTHOR_QUERY = /* GraphQL */ `
  query Author($id: ID!) {
    author(id: $id) {
      id
      name
      bio
      books {
        id
        title
        year
      }
    }
  }
`;

@Component({
  selector: 'app-author-detail',
  imports: [RouterLink],
  template: `
    <a routerLink="/authors">&larr; Back to authors</a>

    @if (authorResource.isLoading()) {
      <p class="loading">Loading...</p>
    } @else if (authorResource.error()) {
      <p class="error">Failed to load author.</p>
    } @else if (!authorResource.value()?.author) {
      <p class="error">Author not found.</p>
    } @else {
      @let author = authorResource.value()!.author!;
      <article>
        <h1>{{ author.name }}</h1>
        <p class="bio">{{ author.bio }}</p>
        <section>
          <h2>Books</h2>
          <ul class="book-list">
            @for (book of author.books; track book.id) {
              <li>
                <a [routerLink]="['/books', book.id]">{{ book.title }}</a>
                <span class="year">{{ book.year }}</span>
              </li>
            }
          </ul>
        </section>
        <button (click)="authorResource.reload()">Refresh</button>
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
    .bio {
      color: #555;
      font-style: italic;
      margin-bottom: 1.5rem;
    }
    ul.book-list {
      list-style: none;
      padding: 0;
    }
    ul.book-list li {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid #eee;
    }
    ul.book-list a {
      color: #1a1a2e;
      text-decoration: none;
    }
    ul.book-list a:hover {
      text-decoration: underline;
    }
    .year {
      color: #888;
      font-size: 0.875rem;
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
export class AuthorDetailComponent {
  private route = inject(ActivatedRoute);

  private idSignal = toSignal(this.route.paramMap.pipe(map((p) => p.get('id')!)), {
    initialValue: '',
  });

  protected authorResource = queryResource<AuthorDetail, { id: string }>({
    query: AUTHOR_QUERY,
    variables: () => ({ id: this.idSignal() }),
  });
}
