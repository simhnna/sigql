import { inject, Injectable, ResourceRef } from '@angular/core';
import { Observable } from 'rxjs';
import { queryResource, subscriptionResource, watchQueryResource } from './sigql-resource';
import { SigqlService } from './sigql.service';
import { DocumentInput, GraphQLResult } from './types';

@Injectable()
export abstract class Query<T, V extends Record<string, unknown> = Record<string, unknown>> {
  private readonly sigql = inject(SigqlService);
  abstract readonly document: DocumentInput;

  fetch(variables?: V): Promise<GraphQLResult<T>> {
    return this.sigql.query<T, V>({ query: this.document, variables });
  }

  watch(variables?: V): Observable<T> {
    return this.sigql.watch<T, V>({ query: this.document, variables });
  }

  resource<R = T>(variables?: () => V, select?: (data: T) => R): ResourceRef<R | undefined> {
    return queryResource<T, V, R>({ query: this.document, variables, select, service: this.sigql });
  }

  watchResource<R = T>(variables?: () => V, select?: (data: T) => R): ResourceRef<R | undefined> {
    return watchQueryResource<T, V, R>({
      query: this.document,
      variables,
      select,
      service: this.sigql,
    });
  }
}

@Injectable()
export abstract class Mutation<T, V extends Record<string, unknown> = Record<string, unknown>> {
  private readonly sigql = inject(SigqlService);
  abstract readonly document: DocumentInput;

  mutate(
    variables?: V,
    options?: { refetchQueries?: string[]; awaitRefetchQueries?: boolean },
  ): Promise<GraphQLResult<T>> {
    return this.sigql.mutate<T, V>({ mutation: this.document, variables, ...options });
  }
}

@Injectable()
export abstract class Subscription<T, V extends Record<string, unknown> = Record<string, unknown>> {
  private readonly sigql = inject(SigqlService);
  abstract readonly document: DocumentInput;

  subscribe(variables?: V): Observable<T> {
    return this.sigql.subscribe<T, V>({ subscription: this.document, variables });
  }

  resource<R = T>(variables?: () => V, select?: (data: T) => R): ResourceRef<R | undefined> {
    return subscriptionResource<T, V, R>({
      subscription: this.document,
      variables,
      select,
      service: this.sigql,
    });
  }
}
