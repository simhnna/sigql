import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { queryResource } from 'sigql';

interface Author {
  id: string;
  name: string;
  bio: string;
  books: Array<{ id: string; title: string }>;
}

interface AuthorsQuery {
  authors: Author[];
}

const AUTHORS_QUERY = /* GraphQL */ `
  query Authors {
    authors {
      id
      name
      bio
      books {
        id
        title
      }
    }
  }
`;

@Component({
  selector: 'app-authors-list',
  imports: [RouterLink],
  template: `
    <h1>Authors</h1>

    @if (authorsResource.isLoading()) {
      <p class="loading">Loading authors...</p>
    } @else if (authorsResource.error()) {
      <p class="error">Error loading authors.</p>
    } @else {
      <ul class="list">
        @for (author of authorsResource.value()?.authors; track author.id) {
          <li>
            <a [routerLink]="['/authors', author.id]">{{ author.name }}</a>
            <span class="meta">{{ author.books.length }} book(s)</span>
          </li>
        }
      </ul>
      <button (click)="authorsResource.reload()">Refresh</button>
    }
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
    button {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background: #1a1a2e;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  `,
})
export class AuthorsListComponent {
  protected authorsResource = queryResource<AuthorsQuery>({ query: AUTHORS_QUERY });
}
