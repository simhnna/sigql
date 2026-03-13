import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'books', pathMatch: 'full' },
  {
    path: 'books',
    loadComponent: () =>
      import('./books/books-list.component').then((m) => m.BooksListComponent),
  },
  {
    path: 'books/:id',
    loadComponent: () =>
      import('./books/book-detail.component').then((m) => m.BookDetailComponent),
  },
  {
    path: 'authors',
    loadComponent: () =>
      import('./authors/authors-list.component').then((m) => m.AuthorsListComponent),
  },
  {
    path: 'authors/:id',
    loadComponent: () =>
      import('./authors/author-detail.component').then((m) => m.AuthorDetailComponent),
  },
];
