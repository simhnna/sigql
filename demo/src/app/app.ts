import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <nav>
        <a routerLink="/books" routerLinkActive="active">Books</a>
        <a routerLink="/authors" routerLinkActive="active">Authors</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    header {
      background: #1a1a2e;
      padding: 1rem 2rem;
    }
    nav {
      display: flex;
      gap: 1.5rem;
    }
    nav a {
      color: #e0e0e0;
      text-decoration: none;
      font-weight: 500;
      font-size: 1rem;
    }
    nav a.active {
      color: #e94560;
      border-bottom: 2px solid #e94560;
      padding-bottom: 2px;
    }
    main {
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
  `,
})
export class App {}
