import { inject, Injectable, Injector, ResourceRef } from '@angular/core';
import { Observable } from 'rxjs';
import { queryResource, subscriptionResource, watchQueryResource } from './sigql-resource';
import { SigqlService } from './sigql.service';
import { DocumentInput, GraphQLResult } from './types';

export interface OperationResourceOptions<T, V, R> {
  variables?: () => V | undefined;
  /** Allows creation outside an injection context (e.g. in event handlers). */
  injector?: Injector;
  /** Transforms/extracts the raw response into the shape exposed as the resource's value. */
  select?: (data: T) => R;
}

@Injectable()
export abstract class Query<T, V extends Record<string, unknown> = Record<string, unknown>> {
  private readonly sigql = inject(SigqlService);
  abstract readonly document: DocumentInput<T, V>;

  fetch(variables?: V): Promise<GraphQLResult<T>> {
    return this.sigql.query<T, V>({ query: this.document, variables });
  }

  watch(variables?: V): Observable<GraphQLResult<T>> {
    return this.sigql.watch<T, V>({ query: this.document, variables });
  }

  resource<R = T>(options: OperationResourceOptions<T, V, R> = {}): ResourceRef<R | undefined> {
    return queryResource<T, V, R>({ query: this.document, service: this.sigql, ...options });
  }

  watchResource<R = T>(
    options: OperationResourceOptions<T, V, R> = {},
  ): ResourceRef<R | undefined> {
    return watchQueryResource<T, V, R>({ query: this.document, service: this.sigql, ...options });
  }
}

@Injectable()
export abstract class Mutation<T, V extends Record<string, unknown> = Record<string, unknown>> {
  private readonly sigql = inject(SigqlService);
  abstract readonly document: DocumentInput<T, V>;

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
  abstract readonly document: DocumentInput<T, V>;

  subscribe(variables?: V): Observable<T> {
    return this.sigql.subscribe<T, V>({ subscription: this.document, variables });
  }

  resource<R = T>(options: OperationResourceOptions<T, V, R> = {}): ResourceRef<R | undefined> {
    return subscriptionResource<T, V, R>({
      subscription: this.document,
      service: this.sigql,
      ...options,
    });
  }
}
